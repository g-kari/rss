import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server-auth';
import { isValidFeedUrl } from '@/lib/url';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { sha256Hex } from '@/lib/r2';
import { unescapeHtml } from '@/lib/html';

const FETCH_TIMEOUT_MS = 5_000;
const MAX_BYTES = 512 * 1024; // og:image は先頭 512KB 以内にある
const OGP_CACHE_TTL_SEC = 30 * 24 * 60 * 60; // 30日

export async function GET(request: Request) {
  const result = await requireSession();
  if ('error' in result) return result.error;

  const url = new URL(request.url).searchParams.get('url');
  if (!url) return NextResponse.json({ image: '' });
  if (!isValidFeedUrl(url)) return NextResponse.json({ image: '' });

  const { ctx } = await getCloudflareContext({ async: true });
  const reqUrl = new URL(request.url);
  const cacheKey = new Request(`${reqUrl.origin}/__cache/ogp/${await sha256Hex(url)}`);
  const cfCache = caches.default;

  // Cloudflare Cache API で確認
  const cached = await cfCache.match(cacheKey);
  if (cached) {
    const data = await cached.json() as { image: string };
    return NextResponse.json(data, { headers: { 'X-Cache': 'HIT' } });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; rss-reader/1.0)',
        Accept: 'text/html',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return NextResponse.json({ image: '' });

    // 先頭 MAX_BYTES だけ読んで og:image を探す
    const reader = res.body?.getReader();
    if (!reader) return NextResponse.json({ image: '' });

    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.byteLength;
        if (total >= MAX_BYTES) break;
      }
    } finally {
      reader.cancel().catch(() => {});
    }

    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) { merged.set(c, offset); offset += c.byteLength; }
    const html = new TextDecoder().decode(merged);

    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

    // HTML エンティティをデコード（&amp; → & など）
    // imgix 等の CDN は URL 中の & をそのまま期待するため必須
    const image = unescapeHtml(m?.[1] ?? '');

    // Cloudflare Cache API に保存（fire-and-forget）
    const cacheRes = new Response(JSON.stringify({ image }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${OGP_CACHE_TTL_SEC}` },
    });
    ctx.waitUntil(cfCache.put(cacheKey, cacheRes));

    return NextResponse.json({ image }, { headers: { 'X-Cache': 'MISS' } });
  } catch {
    clearTimeout(timeoutId);
    return NextResponse.json({ image: '' });
  }
}
