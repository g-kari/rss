/**
 * 記事コンテンツをサーバー側でフェッチするヘルパー。
 * /api/content と同じ Cloudflare Cache キーを使うため、キャッシュを共有する。
 */

import { sha256Hex } from '@/lib/r2';
import { fetchFollowSafeRedirects, readBodyBytes } from '@/lib/fetch';
import {
  detectCharset,
  extractMainContent,
  fetchMarkdownFromHtml,
  isContentSufficient,
  markdownToHtml,
  postProcessMarkdownContent,
} from '@/lib/content';
import { isValidFeedUrl, normalizeUrlForCache } from '@/lib/url';

export const CONTENT_CACHE_TTL_SEC = 7 * 24 * 60 * 60;
export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_CONTENT_BYTES = 5 * 1024 * 1024;

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

  const cacheKey = new Request(`${origin}/__cache/content/${await sha256Hex(normalizeUrlForCache(url))}`);
  const cfCache = caches.default;

  // Cloudflare Cache API で確認（/api/content と同じキー）
  const cached = await cfCache.match(cacheKey);
  if (cached) {
    const data = (await cached.json()) as { content: string };
    return data.content;
  }

  try {
    const res = await fetchFollowSafeRedirects(
      url,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; rss-reader/1.0)', Accept: 'text/html,application/xhtml+xml' } },
      FETCH_TIMEOUT_MS,
    );

    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('html')) return null;

    if (!res.body) return null;
    const merged = await readBodyBytes(res.body, MAX_CONTENT_BYTES);
    if (merged === null) return null;

    const charset = detectCharset(ct, merged);
    let html: string;
    try {
      html = new TextDecoder(charset).decode(merged);
    } catch {
      // charset が TextDecoder 非対応の場合（RangeError）は UTF-8 でフォールバック
      html = new TextDecoder('utf-8', { fatal: false }).decode(merged);
    }
    const { content: extracted } = extractMainContent(html, url);
    let content = extracted;

    if (!isContentSufficient(content)) {
      const hostname = new URL(url).hostname;
      const md = await fetchMarkdownFromHtml(html, hostname);
      if (md) content = postProcessMarkdownContent(markdownToHtml(md), url);
    }

    // Cloudflare Cache に保存（fire-and-forget）
    const cacheRes = new Response(JSON.stringify({ content }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CONTENT_CACHE_TTL_SEC}`,
      },
    });
    ctx.waitUntil(cfCache.put(cacheKey, cacheRes).catch((err) => console.error('[fetchArticleContent] cache put error:', err)));

    return content;
  } catch {
    return null;
  }
}
