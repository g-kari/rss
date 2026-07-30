/**
 * 記事コンテンツをサーバー側でフェッチするヘルパー。
 * /api/content と同じ Cloudflare Cache キーを使うため、キャッシュを共有する。
 */

import {
  buildCacheKey,
  buildJsonCacheResponse,
  cachePutAsync,
  matchCfCache,
} from "@/lib/cache-helper";
import { DEFAULT_FETCH_TIMEOUT_MS, fetchFollowSafeRedirects, readBodyBytes } from "@/lib/fetch";
import { sanitizeLogUrl } from "@/lib/log-sanitize";
import {
  decodeBytesToString,
  detectCharset,
  detectNextPageUrl,
  extractMainContent,
  fetchMarkdownFromHtml,
  isContentSufficient,
  markdownToHtml,
} from "@/lib/content";
import { postProcessMarkdownContent } from "@/lib/html-post-processor";
import { isValidFeedUrl } from "@/lib/url";

const CONTENT_CACHE_TTL_SEC = 7 * 24 * 60 * 60;
// everia.club / WordPress nextpage は 5〜10 ページに渡る記事もあるため余裕を持って 10 に設定
const MAX_PAGINATION_PAGES = 10;
export const ARTICLE_FETCH_OPTS = {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (compatible; Googlebot/2.1; rss-reader/1.0; +https://rss.0g0.xyz/bot)",
    Accept: "text/html,application/xhtml+xml",
  },
};
export const MAX_CONTENT_BYTES = 5 * 1024 * 1024;
/** ページネーション結合後・キャッシュ復元後の最終出力に課す上限（UTF-8 バイト）。R2 1 オブジェクト上限とメモリ消費を抑える */
export const MAX_RETURNED_CONTENT_BYTES = 5 * 1024 * 1024;

/**
 * UTF-8 のバイト長で content を切り詰める。多バイト文字の途中で切れた場合は
 * TextDecoder の置換動作に任せて不正シーケンスを安全に処理する。
 */
export function clampContentBytes(
  content: string,
  maxBytes: number = MAX_RETURNED_CONTENT_BYTES,
): string {
  const encoded = new TextEncoder().encode(content);
  if (encoded.byteLength <= maxBytes) return content;
  const truncated = encoded.subarray(0, maxBytes);
  return new TextDecoder("utf-8", { fatal: false }).decode(truncated);
}

/**
 * /api/content と共有する Cloudflare Cache キーを生成する。
 *
 * バージョン名前空間 `content/v2` を採用しており、ロジック修正時にバンプすることで
 * Cloudflare Cache API の POP 単位キャッシュをグローバルに無効化できる。
 * （`caches.default.delete()` はリクエストが届いた POP のキャッシュしか消せないため、
 *   全 POP 一斉無効化にはキー名前空間の差し替えが最も確実な手段）
 */
export async function buildContentCacheKey(origin: string, url: string): Promise<Request> {
  return buildCacheKey(origin, "content/v2", url);
}

/** clip 経由のユーザースコープ Cache キー。保存したユーザー自身のみが /api/content で参照可能。 */
export async function buildClipCacheKey(
  origin: string,
  userId: string,
  url: string,
): Promise<Request> {
  return buildCacheKey(origin, `clip/${userId}`, url);
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
      content = postProcessMarkdownContent(await markdownToHtml(md), url);
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
  cachePutAsync(
    cacheKey,
    buildJsonCacheResponse({ content }, CONTENT_CACHE_TTL_SEC),
    ctx,
    "content",
  );
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
      const { content, html } = await extractContent(result.bytes, result.ct, nextUrl);
      allContents.push(content);
      nextUrl = detectNextPageUrl(html, nextUrl);
    } catch (err) {
      console.warn(
        "[appendPaginatedPages] page fetch failed, stopping pagination:",
        err instanceof Error ? err.message : String(err),
      );
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

  const logUrl = sanitizeLogUrl(url);
  const cacheKey = await buildContentCacheKey(origin, url);
  const cached = await matchCfCache(cacheKey);
  if (cached) {
    const data = (await cached.json()) as { content?: unknown };
    if (typeof data.content !== "string") return null;
    return clampContentBytes(data.content);
  }

  try {
    const result = await fetchHtmlBytes(url);
    if (!result) return null;
    const { bytes: merged, ct } = result;

    const { content: page1Content, html } = await extractContent(merged, ct, url);
    const merged2 = await appendPaginatedPages(html, page1Content, url);
    const content = clampContentBytes(merged2);

    // 最終コンテンツが確定してからキャッシュ保存（競合を防ぐため1回のみ）
    saveContentToCache(cacheKey, content, ctx);

    return content;
  } catch (err) {
    // server-side external fetch wrapper の silent fail を wrangler tail で観測可能化
    // (browser-platform.md § silent fallback 禁止 規範対象判定軸 / canonical: recommendation.ts)
    console.warn("[fetch-article-content] fetch failed:", logUrl, err);
    return null;
  }
}
