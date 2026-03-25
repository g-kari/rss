import { NextResponse } from 'next/server';
import { withSession } from '@/lib/server-auth';
import { isValidFeedUrl } from '@/lib/url';
import { sha256Hex } from '@/lib/r2';
import { fetchFollowSafeRedirects } from '@/lib/fetch';
import {
  detectCharset,
  extractMainContent,
  fetchMarkdownFromHtml,
  isContentSufficient,
  markdownToHtml,
  postProcessMarkdownContent,
} from '@/lib/content';

const CONTENT_CACHE_TTL_SEC = 7 * 24 * 60 * 60; // 7日
const FETCH_TIMEOUT_MS = 10_000;
const MAX_CONTENT_BYTES = 5 * 1024 * 1024;

export async function GET(request: Request) {
  return withSession(({ ctx }) => handleGet(request, ctx));
}

async function handleGet(request: Request, ctx: ExecutionContext): Promise<NextResponse> {
  const url = new URL(request.url).searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });

  if (!isValidFeedUrl(url)) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const reqUrl = new URL(request.url);
  const cacheKey = new Request(`${reqUrl.origin}/__cache/content/${await sha256Hex(url)}`);
  const cfCache = caches.default;

  // Cloudflare Cache API で確認
  const cached = await cfCache.match(cacheKey);
  if (cached) {
    const data = await cached.json() as { content: string };
    return NextResponse.json(data, { headers: { 'X-Cache': 'HIT' } });
  }

  try {
    const res = await fetchFollowSafeRedirects(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; rss-reader/1.0)', Accept: 'text/html,application/xhtml+xml' },
    }, FETCH_TIMEOUT_MS);

    if (!res.ok) return NextResponse.json({ error: `${res.status} ${res.statusText}` }, { status: 502 });

    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('html')) return NextResponse.json({ error: 'Not an HTML page' }, { status: 415 });

    const contentLength = res.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_CONTENT_BYTES)
      return NextResponse.json({ error: 'Page too large' }, { status: 413 });

    const reader = res.body?.getReader();
    if (!reader) return NextResponse.json({ error: 'No response body' }, { status: 502 });

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_CONTENT_BYTES) return NextResponse.json({ error: 'Page too large' }, { status: 413 });
        chunks.push(value);
      }
    } finally {
      reader.cancel().catch(() => {});
    }

    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
    const charset = detectCharset(ct, merged);
    let html: string;
    try {
      html = new TextDecoder(charset).decode(merged);
    } catch {
      // charset が TextDecoder 非対応の場合（RangeError）は UTF-8 でフォールバック
      html = new TextDecoder('utf-8', { fatal: false }).decode(merged);
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
        contentSource = 'ai-markdown';
      }
    }

    // Cloudflare Cache API に保存（fire-and-forget）
    const cacheRes = new Response(JSON.stringify({ content }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CONTENT_CACHE_TTL_SEC}` },
    });
    ctx.waitUntil(cfCache.put(cacheKey, cacheRes));

    return NextResponse.json({ content }, { headers: { 'X-Cache': 'MISS', 'X-Content-Source': contentSource } });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError')
      return NextResponse.json({ error: 'Request timeout' }, { status: 504 });
    console.error('[content] fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch page' }, { status: 502 });
  }
}

