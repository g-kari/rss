import { isValidFeedUrl } from '@/lib/url';

const MAX_REDIRECTS = 5;

/**
 * ReadableStream からバイト列を最大 maxBytes まで読み込む。
 * maxBytes を超えた場合は null を返す。
 */
export async function readBodyBytes(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) return null;
      chunks.push(value);
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

/**
 * ReadableStream から先頭 maxBytes バイトだけ読み込む（部分読み込み）。
 * maxBytes に達した時点で読み込みを打ち切り、収集済みのバイト列を返す。
 * 上限オーバーで null を返す readBodyBytes と異なり、常に Uint8Array を返す。
 */
export async function readBodyBytesPartial(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalBytes += value.byteLength;
      if (totalBytes >= maxBytes) break;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

/**
 * fetch にタイムアウトを付与するラッパー。
 * タイムアウト時は AbortError をスローする。
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * リダイレクトを安全に追跡する fetch ラッパー。
 * 各リダイレクト先を isValidFeedUrl で検証し、プライベート IP への
 * オープンリダイレクト経由 SSRF を防ぐ。
 * タイムアウト時は AbortError をスローする。
 */
export async function fetchFollowSafeRedirects(
  url: string,
  init: Omit<RequestInit, 'redirect'>,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let currentUrl = url;
  let redirectCount = 0;

  try {
    while (redirectCount < MAX_REDIRECTS) {
      const res = await fetch(currentUrl, {
        ...init,
        signal: controller.signal,
        redirect: 'manual',
      });

      // 304 Not Modified はリダイレクトではなく「変更なし」を示す。
      // Location ヘッダーを持たないため、リダイレクト追跡の対象外としてそのまま返す。
      if (res.status === 304) return res;

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) throw new Error('Redirect without Location header');
        const nextUrl = new URL(location, currentUrl).href;
        if (!isValidFeedUrl(nextUrl)) {
          throw new Error(`Redirect to blocked URL: ${nextUrl}`);
        }
        currentUrl = nextUrl;
        redirectCount++;
        continue;
      }

      return res;
    }
    throw new Error(`Too many redirects (>=${MAX_REDIRECTS})`);
  } finally {
    clearTimeout(timeoutId);
  }
}
