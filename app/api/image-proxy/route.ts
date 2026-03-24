import { requireSession } from '@/lib/server-auth';
import { isValidFeedUrl } from '@/lib/url';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { sha256Hex } from '@/lib/r2';
import { fetchWithTimeout } from '@/lib/fetch';

const IMAGE_CACHE_TTL_SEC = 30 * 24 * 60 * 60; // 30日
const FETCH_TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * 1×1 透明 GIF — フェッチ失敗時のフォールバック。
 * broken image アイコンの代わりに空領域を表示するために返す。
 */
const TRANSPARENT_GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00,
  0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff,
  0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
  0x01, 0x00, 0x3b,
]);

function transparentGif(): Response {
  return new Response(TRANSPARENT_GIF, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

export async function GET(request: Request) {
  const result = await requireSession();
  if ('error' in result) return result.error;

  const url = new URL(request.url).searchParams.get('url');
  if (!url) return new Response(null, { status: 400 });

  if (!isValidFeedUrl(url)) return new Response(null, { status: 400 });

  const { ctx } = await getCloudflareContext({ async: true });
  const reqUrl = new URL(request.url);
  const cacheKey = new Request(`${reqUrl.origin}/__cache/image/${await sha256Hex(url)}`);
  const cfCache = caches.default;

  // Cloudflare Cache API で確認
  const cached = await cfCache.match(cacheKey);
  if (cached) {
    return new Response(cached.body, {
      headers: {
        'Content-Type': cached.headers.get('Content-Type') ?? 'image/jpeg',
        'Cache-Control': `public, max-age=${IMAGE_CACHE_TTL_SEC}`,
        'X-Cache': 'HIT',
      },
    });
  }

  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; rss-reader/1.0)',
        'Accept': 'image/*,*/*',
        'Referer': new URL(url).origin + '/',
      },
      redirect: 'follow',
    }, FETCH_TIMEOUT_MS);

    if (!res.ok) return transparentGif();

    const ct = res.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/') && !ct.startsWith('application/octet-stream')) {
      return transparentGif();
    }

    const reader = res.body?.getReader();
    if (!reader) return transparentGif();

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_IMAGE_BYTES) return transparentGif();
        chunks.push(value);
      }
    } finally {
      reader.cancel().catch(() => {});
    }

    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }

    const imageContentType = ct.startsWith('image/') ? ct : 'image/jpeg';

    // Cloudflare Cache API に保存（fire-and-forget）
    ctx.waitUntil(
      cfCache.put(
        cacheKey,
        new Response(merged, {
          headers: {
            'Content-Type': imageContentType,
            'Cache-Control': `public, max-age=${IMAGE_CACHE_TTL_SEC}`,
          },
        }),
      ),
    );

    return new Response(merged, {
      headers: {
        'Content-Type': imageContentType,
        'Cache-Control': `public, max-age=${IMAGE_CACHE_TTL_SEC}`,
        'X-Cache': 'MISS',
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name !== 'AbortError') {
      console.error('[image-proxy] fetch error:', err);
    }
    return transparentGif();
  }
}
