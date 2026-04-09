/**
 * 記事コンテンツをサーバー側でフェッチするヘルパー。
 * /api/content と同じ Cloudflare Cache キーを使うため、キャッシュを共有する。
 */

import { buildCacheKey, cachePutAsync } from "@/lib/r2";
import { DEFAULT_FETCH_TIMEOUT_MS, fetchFollowSafeRedirects, readBodyBytes } from "@/lib/fetch";
import {
  decodeBytesToString,
  detectCharset,
  detectNextPageUrl,
  extractMainContent,
  fetchMarkdownFromHtml,
  isContentSufficient,
  markdownToHtml,
  postProcessMarkdownContent,
} from "@/lib/content";
import { isValidFeedUrl } from "@/lib/url";

export const CONTENT_CACHE_TTL_SEC = 7 * 24 * 60 * 60;
const MAX_PAGINATION_PAGES = 10;
export const ARTICLE_FETCH_OPTS = {
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; rss-reader/1.0)",
    Accept: "text/html,application/xhtml+xml",
  },
};
export { DEFAULT_FETCH_TIMEOUT_MS as FETCH_TIMEOUT_MS } from "@/lib/fetch";
export const MAX_CONTENT_BYTES = 5 * 1024 * 1024;

/** /api/content と共有する Cloudflare Cache キーを生成する。 */
export async function buildContentCacheKey(origin: string, url: string): Promise<Request> {
  return buildCacheKey(origin, "content", url);
}

/**
 * バイト列を HTML 文字列に変換し、メインコンテンツを抽出する。
 * キャッシュ保存は行わないため、呼び出し元で saveContentToCache() を呼ぶこと。
 * route.ts と fetchArticleContent() で共有するコアロジック。
 */
export async function extractContent(
  bytes: Uint8Array,
  ct: string,
  url: string,
): Promise<{ content: string; source: string; html: string }> {
  const charset = detectCharset(ct, bytes);
  const html = decodeBytesToString(bytes, charset);

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

  return { content, source: contentSource, html };
}

/**
 * コンテンツを Cloudflare Cache API に保存する（fire-and-forget）。
 * ページネーション含む最終コンテンツが確定してから呼ぶこと。
 */
export function saveContentToCache(
  cacheKey: Request,
  content: string,
  ctx: ExecutionContext,
): void {
  const cacheRes = new Response(JSON.stringify({ content }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${CONTENT_CACHE_TTL_SEC}`,
    },
  });
  cachePutAsync(cacheKey, cacheRes, ctx, "content");
}

/** HTML をフェッチしてバイト列と Content-Type を返す。失敗・非HTML・body なしは null。 */
async function fetchHtmlBytes(url: string): Promise<{ bytes: Uint8Array; ct: string } | null> {
  const res = await fetchFollowSafeRedirects(url, ARTICLE_FETCH_OPTS, DEFAULT_FETCH_TIMEOUT_MS);
  if (!res.ok || !res.body) return null;
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("html")) return null;
  const bytes = await readBodyBytes(res.body, MAX_CONTENT_BYTES);
  if (!bytes) return null;
  return { bytes, ct };
}

/**
 * ページ 1 のデコード済み HTML を受け取り、次ページが存在すれば順に取得して連結する。
 * キャッシュ保存は行わないため、呼び出し元で saveContentToCache() を呼ぶこと。
 */
export async function appendPaginatedPages(
  firstPageHtml: string,
  firstPageContent: string,
  firstPageUrl: string,
): Promise<string> {
  const allContents: string[] = [firstPageContent];
  const visited = new Set<string>([firstPageUrl]);
  let nextUrl = detectNextPageUrl(firstPageHtml, firstPageUrl);

  while (nextUrl && !visited.has(nextUrl) && allContents.length < MAX_PAGINATION_PAGES) {
    visited.add(nextUrl);
    try {
      const result = await fetchHtmlBytes(nextUrl);
      if (!result) break;
      const { bytes, ct } = result;
      const charset = detectCharset(ct, bytes);
      const html = decodeBytesToString(bytes, charset);
      const { content: extracted } = extractMainContent(html, nextUrl);
      let content = extracted;
      // 1ページ目と同様に、抽出結果が貧弱な場合は AI フォールバック
      if (!isContentSufficient(content)) {
        const hostname = new URL(nextUrl).hostname;
        const md = await fetchMarkdownFromHtml(html, hostname);
        if (md) {
          content = postProcessMarkdownContent(markdownToHtml(md), nextUrl);
        }
      }
      allContents.push(content);
      nextUrl = detectNextPageUrl(html, nextUrl);
    } catch {
      break;
    }
  }

  if (allContents.length === 1) return firstPageContent;

  return allContents.join(
    '\n<hr style="margin:2rem 0;border:none;border-top:1px solid var(--color-border-subtle)">\n',
  );
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
    const result = await fetchHtmlBytes(url);
    if (!result) return null;
    const { bytes: merged, ct } = result;

    const { content: page1Content, html } = await extractContent(merged, ct, url);
    const content = await appendPaginatedPages(html, page1Content, url);

    // 最終コンテンツが確定してからキャッシュ保存（競合を防ぐため1回のみ）
    saveContentToCache(cacheKey, content, ctx);

    return content;
  } catch {
    return null;
  }
}
