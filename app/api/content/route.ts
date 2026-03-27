import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { isValidFeedUrl } from "@/lib/url";
import { fetchFollowSafeRedirects, readBodyBytes } from "@/lib/fetch";
import {
  buildContentCacheKey,
  extractAndCacheContent,
  FETCH_TIMEOUT_MS,
  MAX_CONTENT_BYTES,
} from "@/lib/fetch-article-content";

export async function GET(request: Request) {
  return withSession(({ ctx }) => handleGet(request, ctx));
}

async function handleGet(request: Request, ctx: ExecutionContext): Promise<NextResponse> {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });

  if (!isValidFeedUrl(url)) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const reqUrl = new URL(request.url);
  const cacheKey = await buildContentCacheKey(reqUrl.origin, url);
  const cfCache = caches.default;

  // Cloudflare Cache API で確認
  const cached = await cfCache.match(cacheKey);
  if (cached) {
    const data = (await cached.json()) as { content: string };
    return NextResponse.json(data, { headers: { "X-Cache": "HIT" } });
  }

  try {
    const res = await fetchFollowSafeRedirects(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; rss-reader/1.0)",
          Accept: "text/html,application/xhtml+xml",
        },
      },
      FETCH_TIMEOUT_MS,
    );

    if (!res.ok) {
      // 4xx はクライアント起因（アクセス不可・存在しない）なのでそのまま返す
      // 5xx はゲートウェイエラーとして 502 を返す
      const status = res.status >= 400 && res.status < 500 ? res.status : 502;
      return NextResponse.json({ error: `HTTP ${res.status}` }, { status });
    }

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html"))
      return NextResponse.json({ error: "Not an HTML page" }, { status: 415 });

    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_CONTENT_BYTES)
      return NextResponse.json({ error: "Page too large" }, { status: 413 });

    if (!res.body) return NextResponse.json({ error: "No response body" }, { status: 502 });
    const merged = await readBodyBytes(res.body, MAX_CONTENT_BYTES);
    if (merged === null) return NextResponse.json({ error: "Page too large" }, { status: 413 });

    const { content, source: contentSource } = await extractAndCacheContent(
      merged,
      ct,
      url,
      cacheKey,
      ctx,
    );

    return NextResponse.json(
      { content },
      { headers: { "X-Cache": "MISS", "X-Content-Source": contentSource } },
    );
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError")
      return NextResponse.json({ error: "Request timeout" }, { status: 504 });
    console.error("[content] fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch page" }, { status: 502 });
  }
}
