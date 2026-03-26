import { withBinarySession } from "@/lib/server-auth";
import { isValidFeedUrl, normalizeUrlForCache } from "@/lib/url";
import { sha256Hex } from "@/lib/r2";
import { DEFAULT_FETCH_TIMEOUT_MS, fetchFollowSafeRedirects, readBodyBytes } from "@/lib/fetch";

const IMAGE_CACHE_TTL_SEC = 30 * 24 * 60 * 60; // 30日
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * 先頭バイトから画像フォーマットを検出する（マジックバイト検証）。
 * Content-Type が application/octet-stream の場合のフォールバックとして使用。
 */
function detectImageMimeType(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";

  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return "image/png";

  // GIF: 47 49 46 38 (GIF87a / GIF89a)
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38)
    return "image/gif";

  // WebP: RIFF????WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return "image/webp";

  // BMP: 42 4D
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";

  // AVIF / HEIF: ftyp box (offset 4-7 = "ftyp", brand の先頭 4 bytes で判別)
  // HEIC/HEIF は主要ブラウザ未対応のため null を返して拒否する
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === "avif") return "image/avif";
    if (brand === "heic" || brand === "heix") return null; // HEIC はブラウザ未対応のため拒否
  }

  return null;
}

/**
 * 1×1 透明 GIF — フェッチ失敗時のフォールバック。
 * broken image アイコンの代わりに空領域を表示するために返す。
 */
const TRANSPARENT_GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff,
  0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

function transparentGif(): Response {
  return new Response(TRANSPARENT_GIF, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function GET(request: Request) {
  return withBinarySession(({ ctx }) => handleGet(request, ctx));
}

async function handleGet(request: Request, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) return new Response(null, { status: 400 });

  if (!isValidFeedUrl(url)) return new Response(null, { status: 400 });

  const reqUrl = new URL(request.url);
  const cacheKey = new Request(
    `${reqUrl.origin}/__cache/image/${await sha256Hex(normalizeUrlForCache(url))}`,
  );
  const cfCache = caches.default;

  // Cloudflare Cache API で確認
  const cached = await cfCache.match(cacheKey);
  if (cached) {
    return new Response(cached.body, {
      headers: {
        "Content-Type": cached.headers.get("Content-Type") ?? "image/jpeg",
        "Cache-Control": `public, max-age=${IMAGE_CACHE_TTL_SEC}`,
        "X-Cache": "HIT",
      },
    });
  }

  try {
    const res = await fetchFollowSafeRedirects(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; rss-reader/1.0)",
          Accept: "image/*,*/*",
          Referer: new URL(url).origin + "/",
        },
      },
      DEFAULT_FETCH_TIMEOUT_MS,
    );

    if (!res.ok) return transparentGif();

    const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    const isImageType = ct.startsWith("image/");
    const needsMagicCheck = ct === "application/octet-stream" || ct === "";

    // image/* でも application/octet-stream でもない場合は拒否
    if (!isImageType && !needsMagicCheck) {
      return transparentGif();
    }

    // SVG は <script> タグや外部リソース参照を含められるため拒否する。
    // ブラウザが SVG を直接開いた場合にスクリプトが実行される可能性があり、
    // SVG をプロキシすることはセキュリティリスクとなる。
    // image/svg+xml のほか image/svg・application/svg+xml などの非標準形式も拒否する。
    if (ct.includes("svg")) {
      return transparentGif();
    }

    if (!res.body) return transparentGif();
    const merged = await readBodyBytes(res.body, MAX_IMAGE_BYTES);
    if (merged === null) return transparentGif();

    // Content-Type ヘッダーは偽装できるため、常にマジックバイトで MIME タイプを検証する。
    // image/* と宣言されていても実際のバイト列が画像でなければ拒否する。
    const detected = detectImageMimeType(merged);
    if (!detected) return transparentGif();
    const imageContentType = detected;

    // Cloudflare Cache API に保存（fire-and-forget）
    ctx.waitUntil(
      cfCache
        .put(
          cacheKey,
          new Response(merged, {
            headers: {
              "Content-Type": imageContentType,
              "Cache-Control": `public, max-age=${IMAGE_CACHE_TTL_SEC}`,
            },
          }),
        )
        .catch((err) => console.error("[image-proxy] cache put error:", err)),
    );

    return new Response(merged, {
      headers: {
        "Content-Type": imageContentType,
        "Cache-Control": `public, max-age=${IMAGE_CACHE_TTL_SEC}`,
        "X-Cache": "MISS",
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name !== "AbortError") {
      console.error("[image-proxy] fetch error:", err);
    }
    return transparentGif();
  }
}
