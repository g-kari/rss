import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server-auth';
import { isValidFeedUrl } from '@/lib/url';

const FETCH_TIMEOUT_MS = 5_000;
const MAX_BYTES = 512 * 1024; // og:image は先頭 512KB 以内にある

export async function GET(request: Request) {
  const result = await requireSession();
  if ('error' in result) return result.error;

  const url = new URL(request.url).searchParams.get('url');
  if (!url) return NextResponse.json({ image: '' });
  if (!isValidFeedUrl(url)) return NextResponse.json({ image: '' });

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

    return NextResponse.json({ image: m?.[1] ?? '' });
  } catch {
    clearTimeout(timeoutId);
    return NextResponse.json({ image: '' });
  }
}
