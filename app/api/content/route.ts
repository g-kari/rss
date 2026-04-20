import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import { matchCfCache } from "@/lib/cache-helper";
import { isValidFeedUrl } from "@/lib/url";
import { fetchFollowSafeRedirects, isAbortError, readBodyBytes } from "@/lib/fetch";
import {
  appendPaginatedPages,
  ARTICLE_FETCH_OPTS,
  buildContentCacheKey,
  extractContent,
  saveContentToCache,
  FETCH_TIMEOUT_MS,
  MAX_CONTENT_BYTES,
} from "@/lib/fetch-article-content";

export async function GET(request: Request) {
  return withSession(request, ({ ctx }) => handleGet(request, ctx));
}

async function handleGet(request: Request, ctx: ExecutionContext): Promise<NextResponse> {
  const reqUrl = new URL(request.url);
  const url = reqUrl.searchParams.get("url");
  if (!url) return apiError("url is required", 400, { code: "INVALID_URL" });

  if (!isValidFeedUrl(url)) {
    return apiError("Invalid URL", 400, { code: "INVALID_URL" });
  }

  const cacheKey = await buildContentCacheKey(reqUrl.origin, url);

  // Cloudflare Cache API で確認
  const cached = await matchCfCache(cacheKey);
  if (cached) {
    const data = (await cached.json()) as { content: string };
    return NextResponse.json(data, { headers: { "X-Cache": "HIT" } });
  }

  try {
    const res = await fetchFollowSafeRedirects(url, ARTICLE_FETCH_OPTS, FETCH_TIMEOUT_MS);

    if (!res.ok) {
      // 上流が 429 を返したら Retry-After をクライアントに pass-through してクールダウン判断を委ねる
      if (res.status === 429) {
        const retryAfterHeader = res.headers.get("Retry-After");
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (retryAfterHeader) headers["Retry-After"] = retryAfterHeader;
        return NextResponse.json(
          {
            error: "Upstream rate limited",
            code: "RATE_LIMITED",
            retryable: true,
            retryAfter: retryAfterHeader,
          },
          { status: 429, headers },
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
    console.error("[content] fetch error:", err);
    return apiError("Failed to fetch page", 502, { code: "FETCH_FAILED", retryable: true });
  }
}
