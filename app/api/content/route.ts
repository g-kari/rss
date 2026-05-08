import { NextResponse } from "next/server";
import { withSession, type AuthSession } from "@/lib/server-auth";
import { apiError, formatError } from "@/lib/api-error";
import { deleteCfCache, matchCfCache } from "@/lib/cache-helper";
import { isValidFeedUrl } from "@/lib/url";
import { fetchFollowSafeRedirects, isAbortError, readBodyBytes } from "@/lib/fetch";
import {
  appendPaginatedPages,
  ARTICLE_FETCH_OPTS,
  buildClipCacheKey,
  buildContentCacheKey,
  extractContent,
  saveContentToCache,
  FETCH_TIMEOUT_MS,
  MAX_CONTENT_BYTES,
} from "@/lib/fetch-article-content";
import { checkSlidingWindow } from "@/lib/rate-limit";
import { contentFetchRateLimitKey } from "@/lib/r2";
import { CONTENT_MAX_CALLS } from "@/lib/validation";
const CONTENT_WINDOW_MS = 60 * 1000;

export async function GET(request: Request) {
  return withSession(request, ({ session, env, ctx }) => handleGet(request, session, env, ctx));
}

/**
 * 個別 URL の Cloudflare Cache を削除する。CLI 経由で `curl -X DELETE` から呼ぶことを想定。
 *
 * @example
 * curl -X DELETE -H "Cookie: access_token=..." \
 *   "https://rss.0g0.xyz/api/content?url=https://everia.club/.../slug/"
 */
export async function DELETE(request: Request) {
  return withSession(request, async ({ session }) => {
    const reqUrl = new URL(request.url);
    const url = reqUrl.searchParams.get("url");
    if (!url) return apiError("url is required", 400, { code: "INVALID_URL" });
    if (!isValidFeedUrl(url)) {
      return apiError("Invalid URL", 400, { code: "INVALID_URL" });
    }

    const sharedKey = await buildContentCacheKey(reqUrl.origin, url);
    const clipKey = await buildClipCacheKey(reqUrl.origin, session.userId, url);

    const [sharedDeleted, clipDeleted] = await Promise.all([
      deleteCfCache(sharedKey),
      deleteCfCache(clipKey),
    ]);

    return NextResponse.json({ ok: true, deleted: { shared: sharedDeleted, clip: clipDeleted } });
  });
}

async function handleGet(
  request: Request,
  session: AuthSession,
  env: { RSS_DATA: R2Bucket; RATE_LIMIT: KVNamespace },
  ctx: ExecutionContext,
): Promise<NextResponse> {
  const reqUrl = new URL(request.url);
  const url = reqUrl.searchParams.get("url");
  if (!url) return apiError("url is required", 400, { code: "INVALID_URL" });

  if (!isValidFeedUrl(url)) {
    return apiError("Invalid URL", 400, { code: "INVALID_URL" });
  }

  const cacheKey = await buildContentCacheKey(reqUrl.origin, url);

  // ユーザーの clip キャッシュを優先確認
  const clipKey = await buildClipCacheKey(reqUrl.origin, session.userId, url);
  const clipped = await matchCfCache(clipKey);
  if (clipped) {
    const data = (await clipped.json()) as { content: string };
    return NextResponse.json(data, { headers: { "X-Cache": "HIT", "X-Cache-Source": "clip" } });
  }

  // 共有コンテンツキャッシュを確認
  const cached = await matchCfCache(cacheKey);
  if (cached) {
    const data = (await cached.json()) as { content: string };
    return NextResponse.json(data, { headers: { "X-Cache": "HIT" } });
  }

  // キャッシュミス時のみレートリミットを確認（外部フェッチを保護）
  const limited = await checkSlidingWindow(
    env.RATE_LIMIT,
    contentFetchRateLimitKey(session.userId),
    CONTENT_WINDOW_MS,
    CONTENT_MAX_CALLS,
  );
  if (limited) return limited;

  try {
    const res = await fetchFollowSafeRedirects(url, ARTICLE_FETCH_OPTS, FETCH_TIMEOUT_MS);

    if (!res.ok) {
      // 上流が 429 を返したら Retry-After をクライアントに pass-through してクールダウン判断を委ねる。
      // ただし上流が Retry-After ヘッダを付けていない場合 (wallhaven.cc 等) は
      // クライアント側のリトライロジックが破綻するため、デフォルト 60 秒を補う (#662)。
      if (res.status === 429) {
        const retryAfterHeader = res.headers.get("Retry-After") ?? "60";
        return NextResponse.json(
          {
            error: "Upstream rate limited",
            code: "RATE_LIMITED",
            retryable: true,
            retryAfter: retryAfterHeader,
          },
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": retryAfterHeader,
            },
          },
        );
      }
      // 4xx はクライアント起因（アクセス不可・存在しない）なのでそのまま返す
      // 5xx はゲートウェイエラーとして 502 を返す
      const status = res.status >= 400 && res.status < 500 ? res.status : 502;
      return apiError("Failed to load page", status, {
        code: "FETCH_FAILED",
        retryable: status >= 500,
      });
    }

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html"))
      return apiError("Not an HTML page", 415, { code: "UNSUPPORTED_CONTENT_TYPE" });

    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_CONTENT_BYTES)
      return apiError("Page too large", 413, { code: "PAYLOAD_TOO_LARGE" });

    if (!res.body) return apiError("No response body", 502, { code: "EMPTY_BODY" });
    const merged = await readBodyBytes(res.body, MAX_CONTENT_BYTES);
    if (merged === null) return apiError("Page too large", 413, { code: "PAYLOAD_TOO_LARGE" });

    const {
      content: page1Content,
      source: contentSource,
      html,
    } = await extractContent(merged, ct, url);

    const content = await appendPaginatedPages(html, page1Content, url);

    // 最終コンテンツが確定してからキャッシュ保存（競合を防ぐため1回のみ）
    saveContentToCache(cacheKey, content, ctx);

    return NextResponse.json(
      { content },
      { headers: { "X-Cache": "MISS", "X-Content-Source": contentSource } },
    );
  } catch (err) {
    if (isAbortError(err))
      return apiError("Request timeout", 504, { code: "TIMEOUT", retryable: true });
    console.error("[content] fetch error:", formatError(err));
    return apiError("Failed to fetch page", 502, { code: "FETCH_FAILED", retryable: true });
  }
}
