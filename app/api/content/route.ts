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
 * 個別 URL の **自分の clip Cache** のみを削除する。CLI 経由で `curl -X DELETE` から呼ぶことを想定。
 *
 * @example
 * curl -X DELETE -H "Cookie: access_token=..." \
 *   "https://rss.0g0.xyz/api/content?url=https://everia.club/.../slug/"
 *
 * #691 セキュリティ修正:
 * 以前は shared cache (ユーザー横断) も削除していたが、任意の認証済ユーザーが
 * 任意の URL の shared cache を無効化できる権限不備だった (cache busting DoS)。
 * 現在は clip cache (ユーザー別 key) のみを削除する。shared cache は TTL (7日)
 * で自然失効に任せ、フィード購読単位の一括クリアは
 * `POST /api/feeds/{feedHash}/purge-content-cache` (購読チェック付き) を使う。
 */
export async function DELETE(request: Request) {
  return withSession(request, async ({ session }) => {
    const reqUrl = new URL(request.url);
    const url = reqUrl.searchParams.get("url");
    if (!url) return apiError("url is required", 400, { code: "INVALID_URL" });
    if (!isValidFeedUrl(url)) {
      return apiError("Invalid URL", 400, { code: "INVALID_URL" });
    }

    const clipKey = await buildClipCacheKey(reqUrl.origin, session.userId, url);
    const clipDeleted = await deleteCfCache(clipKey);

    return NextResponse.json({ ok: true, deleted: { clip: clipDeleted } });
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
  // #779: KV 障害時も fail-closed (外部 fetch コスト・DoS を防ぐ)。
  // AI エンドポイント (ai-route-helper) と整合させた defense in depth。
  const limited = await checkSlidingWindow(
    env.RATE_LIMIT,
    contentFetchRateLimitKey(session.userId),
    CONTENT_WINDOW_MS,
    CONTENT_MAX_CALLS,
    { failClosed: true },
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
      // #804: 上流の 4xx / 5xx を一律 HTTP 502 Bad Gateway に変換する。
      // 4xx pass-through だと client 側 classify-http-error が "client_error" 判定し
      // 「ログインし直してください」相当の汎用 fallback を表示してしまい、
      // 上流 fetch 失敗とサーバー認証エラーが区別不能になっていた (RFC 標準: 502 = upstream gateway 失敗)。
      // upstreamStatus を response body に含めて debugging visibility を確保。
      return apiError("Upstream fetch failed", 502, {
        code: "UPSTREAM_FETCH_FAILED",
        retryable: true,
        upstreamStatus: res.status,
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
