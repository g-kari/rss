/**
 * RSS/Atom フィード URL を探索するユーティリティ。
 *
 * 探索順:
 * 1. URL 自体が RSS/Atom (Content-Type で判定) → そのまま返す
 * 2. HTML なら `<link rel="alternate" type="application/rss+xml">` タグを検索
 * 3. 見つからなければ一般的なパス (/feed, /rss など) を並列プローブ
 */
import { isValidFeedUrl } from './url';

/** 一般的な RSS/Atom フィードパス候補 */
const COMMON_FEED_PATHS = [
  '/feed',
  '/rss',
  '/rss.xml',
  '/atom.xml',
  '/feed.xml',
  '/index.xml',
  '/feeds/posts/default', // Blogger
] as const;

function isFeedContentType(ct: string): boolean {
  return ct.includes('xml') || ct.includes('rss') || ct.includes('atom');
}

/**
 * HTML から <link rel="alternate" type="application/rss+xml" href="..."> を検索する。
 * type と href の属性順序は問わない。
 */
function extractFeedLinkFromHtml(html: string, baseUrl: string): string | null {
  // type="..." が href="..." より前のパターン
  const patternTypeFirst =
    /<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]+href=["']([^"']+)["'][^>]*\/?>/gi;
  // href="..." が type="..." より前のパターン
  const patternHrefFirst =
    /<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*\/?>/gi;

  for (const pattern of [patternTypeFirst, patternHrefFirst]) {
    pattern.lastIndex = 0;
    const m = pattern.exec(html);
    if (m?.[1]) {
      try {
        const resolved = new URL(m[1], baseUrl).toString();
        // SSRF 対策: プライベートIPへのアクセスを拒否
        if (!isValidFeedUrl(resolved)) continue;
        return resolved;
      } catch {
        continue;
      }
    }
  }
  return null;
}

/**
 * サイトの origin に対して一般的なフィードパスを並列プローブし、
 * 最初に見つかったフィード URL を返す。見つからなければ null。
 */
async function probeCommonFeedPaths(baseUrl: string): Promise<string | null> {
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return null;
  }

  const results = await Promise.allSettled(
    COMMON_FEED_PATHS.map(async (path) => {
      const url = origin + path;
      const res = await fetch(url, {
        method: 'HEAD',
        headers: { 'User-Agent': 'rss-reader/1.0' },
        redirect: 'follow',
      });
      const ct = res.headers.get('content-type') ?? '';
      if (res.ok && isFeedContentType(ct)) return url;
      throw new Error('not a feed');
    }),
  );

  for (const r of results) {
    if (r.status === 'fulfilled') return r.value;
  }
  return null;
}

/**
 * URL から RSS/Atom フィード URL を探索する。
 *
 * @param url 探索対象の URL（RSS 直リンク、またはサイトのトップページなど）
 * @returns 発見したフィード URL。見つからない場合は null。
 */
export async function discoverFeedUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'rss-reader/1.0' },
      redirect: 'follow',
    });
    if (!res.ok) return null;

    const ct = res.headers.get('content-type') ?? '';
    if (isFeedContentType(ct)) return url;

    const html = await res.text();

    const fromLink = extractFeedLinkFromHtml(html, url);
    if (fromLink) return fromLink;

    return probeCommonFeedPaths(url);
  } catch {
    return null;
  }
}
