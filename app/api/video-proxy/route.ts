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
import { ALLOWED_VIDEO_CONTENT_TYPES, detectVideoMimeType } from "@/lib/video-mime";
import { errorVideoResponse } from "@/lib/video-error-placeholder";
import { isSameOriginImageRequest } from "@/lib/image-proxy-security";
import { MAX_VIDEO_BYTES } from "@/lib/validation";

// #715: ユーザー指示で「image と同じ TTL」(30 日)
const VIDEO_CACHE_TTL_SEC = 30 * 24 * 60 * 60;

// Content-Length 不明時のストリーミング上限 (動画は大きいので 10MB に設定、image-proxy の 5MB より広め)
const MAX_VIDEO_BYTES_NO_CL = 10 * 1024 * 1024;

export async function GET(request: Request) {
  return withBinarySession(request, ({ session, env, ctx }) =>
    handleGet(request, session, env, ctx),
  );
}

async function handleGet(
  request: Request,
  _session: AuthSession,
  _env: CloudflareEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  const reqUrl = new URL(request.url);

  // image-proxy と同じ same-origin 制約 (Sec-Fetch-Site 検証)
  if (!isSameOriginImageRequest(request.headers, reqUrl.origin)) {
    return new Response(null, { status: 403 });
  }

  const url = reqUrl.searchParams.get("url");
  if (!url) return new Response(null, { status: 400 });
  if (!isValidPublicUrl(url)) return new Response(null, { status: 400 });

  const cacheKey = await buildCacheKey(reqUrl.origin, "video", url);

  // Cloudflare Cache API で確認
  const cached = await matchCfCache(cacheKey);
  if (cached) {
    return new Response(cached.body, {
      headers: {
        "Content-Type": cached.headers.get("Content-Type") ?? "video/mp4",
        "Cache-Control": `public, max-age=${VIDEO_CACHE_TTL_SEC}`,
        "X-Cache": "HIT",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  try {
    const referer = new URL(url).origin + "/";

    const res = await fetchFollowSafeRedirects(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Accept: "video/*,*/*",
          Referer: referer,
        },
      },
      DEFAULT_FETCH_TIMEOUT_MS,
    );

    const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();

    if (!res.ok) {
      console.error(
        `[video-proxy] upstream not ok: url=${url} status=${res.status} content-type="${ct}"`,
      );
      const reason =
        res.status === 404 ? "not_found" : res.status === 403 ? "bot_blocked" : "unavailable";
      return errorVideoResponse(reason, {
        upstreamStatus: res.status,
        upstreamContentType: ct || undefined,
      });
    }

    const needsMagicCheck = ct === "application/octet-stream" || ct === "";

    if (!needsMagicCheck && !ALLOWED_VIDEO_CONTENT_TYPES.has(ct)) {
      console.error(`[video-proxy] MIME rejected: url=${url} content-type="${ct}"`);
      return errorVideoResponse("mime_rejected", {
        upstreamStatus: res.status,
        upstreamContentType: ct,
      });
    }

    const contentLength = res.headers.get("content-length");
    const clBytes = contentLength ? parseInt(contentLength, 10) : NaN;
    if (contentLength && clBytes > MAX_VIDEO_BYTES) {
      console.error(
        `[video-proxy] too large (Content-Length): url=${url} cl=${clBytes} max=${MAX_VIDEO_BYTES}`,
      );
      return errorVideoResponse("too_large", {
        upstreamStatus: res.status,
        upstreamContentType: ct,
        bodySize: clBytes,
      });
    }

    const effectiveMax =
      contentLength && clBytes <= MAX_VIDEO_BYTES ? MAX_VIDEO_BYTES : MAX_VIDEO_BYTES_NO_CL;

    if (!res.body) {
      console.error(`[video-proxy] no body: url=${url} content-type="${ct}"`);
      return errorVideoResponse("unavailable", {
        upstreamStatus: res.status,
        upstreamContentType: ct,
      });
    }
    const merged = await readBodyBytes(res.body, effectiveMax);
    if (merged === null) {
      console.error(
        `[video-proxy] size unknown over limit: url=${url} content-type="${ct}" cl-header=${contentLength ?? "none"} effective-max=${effectiveMax}`,
      );
      return errorVideoResponse(contentLength ? "too_large" : "size_unknown", {
        upstreamStatus: res.status,
        upstreamContentType: ct,
      });
    }

    // マジックバイト検証で MIME 偽装をブロック
    const mimeType = detectVideoMimeType(merged);
    if (!mimeType || !ALLOWED_VIDEO_CONTENT_TYPES.has(mimeType)) {
      console.error(
        `[video-proxy] magic bytes detection failed: url=${url} content-type="${ct}" detected="${mimeType ?? "null"}" body-size=${merged.byteLength}`,
      );
      return errorVideoResponse("content_type_mismatch", {
        upstreamStatus: res.status,
        upstreamContentType: ct,
        detectedMime: mimeType ?? undefined,
        bodySize: merged.byteLength,
      });
    }

    cachePutAsync(
      cacheKey,
      new Response(merged, {
        headers: {
          "Content-Type": mimeType,
          "Cache-Control": `public, max-age=${VIDEO_CACHE_TTL_SEC}`,
        },
      }),
      ctx,
      "video-proxy",
    );

    return new Response(merged, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": `public, max-age=${VIDEO_CACHE_TTL_SEC}`,
        "X-Cache": "MISS",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (!isAbortError(err)) {
      console.error("[video-proxy] fetch error:", formatError(err));
    }
    return errorVideoResponse("network");
  }
}
