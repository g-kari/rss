import { withBinarySession } from "@/lib/server-auth";
import { isValidPublicUrl } from "@/lib/url";
import { buildCacheKey } from "@/lib/r2";
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchFollowSafeRedirects,
  isAbortError,
  readBodyBytes,
} from "@/lib/fetch";

const IMAGE_CACHE_TTL_SEC = 30 * 24 * 60 * 60; // 30日
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

// 許可する画像 MIME タイプのホワイトリスト（detectImageMimeType と整合）。
// SVG・XML・HTML など XSS リスクのある形式を一括排除するため、
// ブラックリスト方式ではなくホワイトリスト方式を採用する。
const ALLOWED_IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/avif",
]);

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
 * 画像取得失敗時に返す SVG プレースホルダー。
 * 壊れた画像アイコンを表示し、404 であることを視覚的に示す。
 */
const BROKEN_IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">
  <rect width="120" height="80" fill="#f5f5f4" rx="4"/>
  <rect x="1" y="1" width="118" height="78" fill="none" stroke="#e7e5e4" stroke-width="1" rx="3"/>
  <g transform="translate(60,34)" stroke="#a8a29e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <rect x="-14" y="-12" width="28" height="24" rx="2"/>
    <polyline points="-14,4 -6,-4 0,2 7,-5 14,4"/>
    <circle cx="5" cy="-5" r="3"/>
    <line x1="-8" y1="-8" x2="-4" y2="-4" stroke="#d1cac6"/>
    <line x1="-4" y1="-8" x2="-8" y2="-4" stroke="#d1cac6"/>
  </g>
  <text x="60" y="62" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#a8a29e">Image unavailable</text>
</svg>`;

function brokenImageSvg(): Response {
  return new Response(BROKEN_IMAGE_SVG, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function GET(request: Request) {
  return withBinarySession(({ ctx }) => handleGet(request, ctx));
}

async function handleGet(request: Request, ctx: ExecutionContext): Promise<Response> {
  const reqUrl = new URL(request.url);
  const url = reqUrl.searchParams.get("url");
  if (!url) return new Response(null, { status: 400 });

  // 画像 URL はサーバー取得コンテンツ由来のため長さ制限なし。SSRF 対策のみ行う。
  if (!isValidPublicUrl(url)) return new Response(null, { status: 400 });

  const cacheKey = await buildCacheKey(reqUrl.origin, "image", url);
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

    if (!res.ok) return brokenImageSvg();

    const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    const needsMagicCheck = ct === "application/octet-stream" || ct === "";

    // Content-Type ベースの検証：ALLOWED_IMAGE_CONTENT_TYPES に含まれない形式は拒否する。
    // ホワイトリスト方式により、SVG など XSS リスクのある形式を一括排除する。
    if (!needsMagicCheck && !ALLOWED_IMAGE_CONTENT_TYPES.has(ct)) {
      return brokenImageSvg();
    }

    if (!res.body) return brokenImageSvg();
    const merged = await readBodyBytes(res.body, MAX_IMAGE_BYTES);
    if (merged === null) return brokenImageSvg();

    // Content-Type ヘッダーは偽装できるため、常にマジックバイトで MIME タイプを検証する。
    // image/* と宣言されていても実際のバイト列が画像でなければ拒否する。
    const mimeType = detectImageMimeType(merged);
    if (!mimeType) return brokenImageSvg();

    // Cloudflare Cache API に保存（fire-and-forget）
    ctx.waitUntil(
      cfCache
        .put(
          cacheKey,
          new Response(merged, {
            headers: {
              "Content-Type": mimeType,
              "Cache-Control": `public, max-age=${IMAGE_CACHE_TTL_SEC}`,
            },
          }),
        )
        .catch((err) => console.error("[image-proxy] cache put error:", err)),
    );

    return new Response(merged, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": `public, max-age=${IMAGE_CACHE_TTL_SEC}`,
        "X-Cache": "MISS",
      },
    });
  } catch (err) {
    if (!isAbortError(err)) {
      console.error("[image-proxy] fetch error:", err);
    }
    return brokenImageSvg();
  }
}
