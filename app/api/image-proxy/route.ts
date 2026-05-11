import { withBinarySession, type AuthSession } from "@/lib/server-auth";
import { formatError } from "@/lib/api-error";
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
import { MAX_IMAGE_BYTES } from "@/lib/validation";

const IMAGE_CACHE_TTL_SEC = 30 * 24 * 60 * 60; // 30日

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

  try {
    // #720: Qiita の imgix CDN (`qiita-user-contents.imgix.net` 等) はホットリンク保護で
    // qiita.com 以外の Referer を拒否する。`.imgix.net` かつホスト名に "qiita" を含む場合のみ
    // Referer を `https://qiita.com/` に差し替える。他サービスの imgix では origin そのままを維持。
    const targetHostname = new URL(url).hostname.toLowerCase();
    const isQiitaImgix = targetHostname.endsWith(".imgix.net") && targetHostname.includes("qiita");
    const referer = isQiitaImgix ? "https://qiita.com/" : new URL(url).origin + "/";

    const res = await fetchFollowSafeRedirects(
      url,
      {
        headers: {
          // 実ブラウザ風 UA で bot 判定 (Cloudflare Bot Fight 等) を回避 (#720 案 B)
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Accept: "image/*,*/*",
          Referer: referer,
        },
      },
      DEFAULT_FETCH_TIMEOUT_MS,
    );

    const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();

    // #749: 失敗時の詳細を console.error + X-Image-Proxy-* ヘッダーで返し、wrangler tail / DevTools
    // どちらからでも切り分け可能にする (前 #720 案 B では原因が見えないまま close した反省)。
    if (!res.ok) {
      console.error(
        `[image-proxy] upstream not ok: url=${url} status=${res.status} content-type="${ct}"`,
      );
      const reason =
        res.status === 404 ? "not_found" : res.status === 403 ? "bot_blocked" : "unavailable";
      return errorImageSvg(reason, {
        upstreamStatus: res.status,
        upstreamContentType: ct || undefined,
      });
    }

    const needsMagicCheck = ct === "application/octet-stream" || ct === "";

    // Content-Type ベースの検証：ALLOWED_IMAGE_CONTENT_TYPES に含まれない形式は拒否する。
    // ホワイトリスト方式により、SVG など XSS リスクのある形式を一括排除する。
    if (!needsMagicCheck && !ALLOWED_IMAGE_CONTENT_TYPES.has(ct)) {
      console.error(`[image-proxy] MIME rejected: url=${url} content-type="${ct}"`);
      return errorImageSvg("mime_rejected", {
        upstreamStatus: res.status,
        upstreamContentType: ct,
      });
    }

    // Content-Length による事前検証: ボディを読む前にサイズ超過を検出して即拒否する。
    const contentLength = res.headers.get("content-length");
    const clBytes = contentLength ? parseInt(contentLength, 10) : NaN;
    if (contentLength && clBytes > MAX_IMAGE_BYTES) {
      console.error(
        `[image-proxy] too large (Content-Length): url=${url} cl=${clBytes} max=${MAX_IMAGE_BYTES}`,
      );
      return errorImageSvg("too_large", {
        upstreamStatus: res.status,
        upstreamContentType: ct,
        bodySize: clBytes,
      });
    }

    // Content-Length が無い場合は上限を 5MB に制限し、並列リクエストによるメモリ圧迫を緩和する。
    const effectiveMax =
      contentLength && clBytes <= MAX_IMAGE_BYTES ? MAX_IMAGE_BYTES : MAX_IMAGE_BYTES_NO_CL;

    if (!res.body) {
      console.error(`[image-proxy] no body: url=${url} content-type="${ct}"`);
      return errorImageSvg("unavailable", {
        upstreamStatus: res.status,
        upstreamContentType: ct,
      });
    }
    const merged = await readBodyBytes(res.body, effectiveMax);
    if (merged === null) {
      console.error(
        `[image-proxy] size unknown over limit: url=${url} content-type="${ct}" cl-header=${contentLength ?? "none"} effective-max=${effectiveMax}`,
      );
      return errorImageSvg(contentLength ? "too_large" : "size_unknown", {
        upstreamStatus: res.status,
        upstreamContentType: ct,
      });
    }

    // Content-Type ヘッダーは偽装できるため、常にマジックバイトで MIME タイプを検証する。
    // image/* と宣言されていても実際のバイト列が画像でなければ拒否する。
    const mimeType = detectImageMimeType(merged);
    if (!mimeType) {
      console.error(
        `[image-proxy] magic bytes detection failed: url=${url} content-type="${ct}" body-size=${merged.byteLength}`,
      );
      return errorImageSvg("unavailable", {
        upstreamStatus: res.status,
        upstreamContentType: ct,
        bodySize: merged.byteLength,
      });
    }

    // 宣言された Content-Type とマジックバイト由来の MIME が矛盾する場合はキャッシュ汚染を防ぐため拒否。
    // 例: 攻撃者が `Content-Type: image/png` で JPEG を返してプロキシキャッシュを占拠する試みを遮断。
    if (!isContentTypeConsistent(ct, mimeType)) {
      console.error(
        `[image-proxy] content-type mismatch: url=${url} declared="${ct}" detected="${mimeType}"`,
      );
      return errorImageSvg("content_type_mismatch", {
        upstreamStatus: res.status,
        upstreamContentType: ct,
        detectedMime: mimeType,
        bodySize: merged.byteLength,
      });
    }

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
      console.error("[image-proxy] fetch error:", formatError(err));
    }
    return errorImageSvg("network");
  }
}
