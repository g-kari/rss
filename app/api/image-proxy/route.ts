import { withBinarySession, type AuthSession } from "@/lib/server-auth";
import { isValidPublicUrl } from "@/lib/url";
import { buildCacheKey, cachePutAsync, matchCfCache } from "@/lib/cache-helper";
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchFollowSafeRedirects,
  isAbortError,
  readBodyBytes,
} from "@/lib/fetch";
import { ALLOWED_IMAGE_CONTENT_TYPES, detectImageMimeType } from "@/lib/image-mime";
import { errorImageSvg } from "@/lib/image-error-placeholder";
import { isContentTypeConsistent, isSameOriginImageRequest } from "@/lib/image-proxy-security";
import { MAX_IMAGE_BYTES, IMAGE_PROXY_MAX_CALLS } from "@/lib/validation";
import { checkSlidingWindow } from "@/lib/rate-limit";
import { imageProxyRateLimitKey } from "@/lib/r2";

const IMAGE_CACHE_TTL_SEC = 30 * 24 * 60 * 60; // 30日
const IMAGE_PROXY_WINDOW_MS = 60 * 1000;

// Content-Length 不明時のストリーミング上限（並列リクエストによるメモリ圧迫を緩和）
const MAX_IMAGE_BYTES_NO_CL = 5 * 1024 * 1024; // 5MB

export async function GET(request: Request) {
  return withBinarySession(request, ({ session, env, ctx }) =>
    handleGet(request, session, env, ctx),
  );
}

async function handleGet(
  request: Request,
  session: AuthSession,
  env: CloudflareEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  const reqUrl = new URL(request.url);

  // CSP (`img-src 'self'`) を実質的に保護するため、同一オリジンからの画像取得のみ受け付ける。
  // Sec-Fetch-Site / Referer で判定し、不一致は 403 で拒否する（fail-closed）。
  if (!isSameOriginImageRequest(request.headers, reqUrl.origin)) {
    return new Response(null, { status: 403 });
  }

  const url = reqUrl.searchParams.get("url");
  if (!url) return new Response(null, { status: 400 });

  // 画像 URL はサーバー取得コンテンツ由来のため長さ制限なし。SSRF 対策のみ行う。
  if (!isValidPublicUrl(url)) return new Response(null, { status: 400 });

  const cacheKey = await buildCacheKey(reqUrl.origin, "image", url);

  // Cloudflare Cache API で確認
  const cached = await matchCfCache(cacheKey);
  if (cached) {
    return new Response(cached.body, {
      headers: {
        "Content-Type": cached.headers.get("Content-Type") ?? "image/jpeg",
        "Cache-Control": `public, max-age=${IMAGE_CACHE_TTL_SEC}`,
        "X-Cache": "HIT",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // キャッシュミス時のみレートリミットを確認（外部フェッチを保護）
  const limited = await checkSlidingWindow(
    env.RATE_LIMIT,
    imageProxyRateLimitKey(session.userId),
    IMAGE_PROXY_WINDOW_MS,
    IMAGE_PROXY_MAX_CALLS,
  );
  if (limited) return limited;

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

    // Content-Length による事前検証: ボディを読む前にサイズ超過を検出して即拒否する。
    const contentLength = res.headers.get("content-length");
    const clBytes = contentLength ? parseInt(contentLength, 10) : NaN;
    if (contentLength && clBytes > MAX_IMAGE_BYTES) {
      return errorImageSvg("too_large");
    }

    // Content-Length が無い場合は上限を 5MB に制限し、並列リクエストによるメモリ圧迫を緩和する。
    const effectiveMax =
      contentLength && clBytes <= MAX_IMAGE_BYTES ? MAX_IMAGE_BYTES : MAX_IMAGE_BYTES_NO_CL;

    if (!res.body) return errorImageSvg("unavailable");
    const merged = await readBodyBytes(res.body, effectiveMax);
    if (merged === null) return errorImageSvg("too_large");

    // Content-Type ヘッダーは偽装できるため、常にマジックバイトで MIME タイプを検証する。
    // image/* と宣言されていても実際のバイト列が画像でなければ拒否する。
    const mimeType = detectImageMimeType(merged);
    if (!mimeType) return errorImageSvg("unavailable");

    // 宣言された Content-Type とマジックバイト由来の MIME が矛盾する場合はキャッシュ汚染を防ぐため拒否。
    // 例: 攻撃者が `Content-Type: image/png` で JPEG を返してプロキシキャッシュを占拠する試みを遮断。
    if (!isContentTypeConsistent(ct, mimeType)) return errorImageSvg("unavailable");

    // Cloudflare Cache API に保存（fire-and-forget）
    cachePutAsync(
      cacheKey,
      new Response(merged, {
        headers: {
          "Content-Type": mimeType,
          "Cache-Control": `public, max-age=${IMAGE_CACHE_TTL_SEC}`,
        },
      }),
      ctx,
      "image-proxy",
    );

    return new Response(merged, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": `public, max-age=${IMAGE_CACHE_TTL_SEC}`,
        "X-Cache": "MISS",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (!isAbortError(err)) {
      console.error("[image-proxy] fetch error:", err);
    }
    return errorImageSvg("network");
  }
}
