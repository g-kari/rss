import { withBinarySession } from "@/lib/server-auth";
import { isValidPublicUrl } from "@/lib/url";
import { buildCacheKey } from "@/lib/r2";
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchFollowSafeRedirects,
  isAbortError,
  readBodyBytes,
} from "@/lib/fetch";
import { ALLOWED_IMAGE_CONTENT_TYPES, detectImageMimeType } from "@/lib/image-mime";
import { errorImageSvg } from "@/lib/image-error-placeholder";

const IMAGE_CACHE_TTL_SEC = 30 * 24 * 60 * 60; // 30日
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

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

    if (!res.ok) {
      return errorImageSvg(res.status === 404 ? "not_found" : "unavailable");
    }

    const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const needsMagicCheck = ct === "application/octet-stream" || ct === "";

    // Content-Type ベースの検証：ALLOWED_IMAGE_CONTENT_TYPES に含まれない形式は拒否する。
    // ホワイトリスト方式により、SVG など XSS リスクのある形式を一括排除する。
    if (!needsMagicCheck && !ALLOWED_IMAGE_CONTENT_TYPES.has(ct)) {
      return errorImageSvg("unavailable");
    }

    if (!res.body) return errorImageSvg("unavailable");
    const merged = await readBodyBytes(res.body, MAX_IMAGE_BYTES);
    if (merged === null) return errorImageSvg("too_large");

    // Content-Type ヘッダーは偽装できるため、常にマジックバイトで MIME タイプを検証する。
    // image/* と宣言されていても実際のバイト列が画像でなければ拒否する。
    const mimeType = detectImageMimeType(merged);
    if (!mimeType) return errorImageSvg("unavailable");

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
    return errorImageSvg("network");
  }
}
