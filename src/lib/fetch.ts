import { isValidFeedUrl } from '@/lib/url';

const MAX_REDIRECTS = 5;

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
    while (redirectCount <= MAX_REDIRECTS) {
      const res = await fetch(currentUrl, {
        ...init,
        signal: controller.signal,
        redirect: 'manual',
      });

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
    throw new Error(`Too many redirects (>${MAX_REDIRECTS})`);
  } finally {
    clearTimeout(timeoutId);
  }
}
