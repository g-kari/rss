/**
 * 記事コンテンツをサーバー側でフェッチするヘルパー。
 * /api/content と同じ Cloudflare Cache キーを使うため、キャッシュを共有する。
 */

import { buildCacheKey } from "@/lib/r2";
import { DEFAULT_FETCH_TIMEOUT_MS, fetchFollowSafeRedirects, readBodyBytes } from "@/lib/fetch";
import {
  detectCharset,
  extractMainContent,
  fetchMarkdownFromHtml,
  isContentSufficient,
  markdownToHtml,
  postProcessMarkdownContent,
} from "@/lib/content";
import { isValidFeedUrl } from "@/lib/url";

export const CONTENT_CACHE_TTL_SEC = 7 * 24 * 60 * 60;
export { DEFAULT_FETCH_TIMEOUT_MS as FETCH_TIMEOUT_MS } from "@/lib/fetch";
export const MAX_CONTENT_BYTES = 5 * 1024 * 1024;

/** /api/content と共有する Cloudflare Cache キーを生成する。 */
export async function buildContentCacheKey(origin: string, url: string): Promise<Request> {
  return buildCacheKey(origin, "content", url);
}

/**
 * バイト列を HTML 文字列に変換し、メインコンテンツを抽出して Cloudflare Cache に保存する。
 * route.ts と fetchArticleContent() で共有するコアロジック。
 */
export async function extractAndCacheContent(
  bytes: Uint8Array,
  ct: string,
  url: string,
  cacheKey: Request,
  ctx: ExecutionContext,
): Promise<{ content: string; source: string }> {
  const charset = detectCharset(ct, bytes);
  let html: string;
  try {
    html = new TextDecoder(charset).decode(bytes);
  } catch {
    // charset が TextDecoder 非対応の場合（RangeError）は UTF-8 でフォールバック
    html = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }

  const { content: extracted, source } = extractMainContent(html, url);
  let content = extracted;
  let contentSource: string = source;

  // 抽出結果が貧弱な場合は Cloudflare AI toMarkdown API でフォールバック
  if (!isContentSufficient(content)) {
    const hostname = new URL(url).hostname;
    const md = await fetchMarkdownFromHtml(html, hostname);
    if (md) {
      content = postProcessMarkdownContent(markdownToHtml(md), url);
      contentSource = "ai-markdown";
    }
  }

  // Cloudflare Cache API に保存（fire-and-forget）
  const cacheRes = new Response(JSON.stringify({ content }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${CONTENT_CACHE_TTL_SEC}`,
    },
  });
  ctx.waitUntil(
    caches.default
      .put(cacheKey, cacheRes)
      .catch((err) => console.error("[content] cache put error:", err)),
  );

  return { content, source: contentSource };
}

/**
 * URL から記事コンテンツを取得する。
 * Cloudflare Cache API を確認し、ヒットすればそのまま返す。
 * ミス時は外部フェッチ→抽出→キャッシュ保存を行う。
 * @returns HTML 文字列、または取得失敗時は null
 */
export async function fetchArticleContent(
  url: string,
  origin: string,
  ctx: ExecutionContext,
): Promise<string | null> {
  if (!isValidFeedUrl(url)) return null;

  const cacheKey = await buildContentCacheKey(origin, url);
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    const data = (await cached.json()) as { content: string };
    return data.content;
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
      DEFAULT_FETCH_TIMEOUT_MS,
    );

    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html")) return null;
    if (!res.body) return null;

    const merged = await readBodyBytes(res.body, MAX_CONTENT_BYTES);
    if (merged === null) return null;

    const { content } = await extractAndCacheContent(merged, ct, url, cacheKey, ctx);
    return content;
  } catch {
    return null;
  }
}
