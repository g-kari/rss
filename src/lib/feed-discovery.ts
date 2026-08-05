/**
 * RSS/Atom フィード URL を探索するユーティリティ。
 *
 * 探索順:
 * 1. URL 自体が RSS/Atom (Content-Type で判定) → そのまま返す
 * 2. HTML なら `<link rel="alternate" type="application/rss+xml">` タグを検索
 * 3. 見つからなければ一般的なパス (/feed, /rss など) を並列プローブ
 */
import { isValidFeedUrl, tryParseBase } from "./url";
import { fetchFollowSafeRedirects, readBodyBytesPartial, RSS_USER_AGENT } from "./fetch";
import { sanitizeLogUrl } from "./log-sanitize";

/** フィード探索時の外部フェッチタイムアウト（ミリ秒）*/
const DISCOVERY_TIMEOUT_MS = 5_000;

/** HTML 読み込み上限バイト数。<head> は通常この範囲内にある */
const MAX_DISCOVERY_BYTES = 64 * 1024;

/** JSON Feed 判定用の読み込み上限。巨大レスポンスを無制限に保持しない。 */
const MAX_JSON_FEED_DISCOVERY_BYTES = 256 * 1024;

/** 一般的な RSS/Atom/JSON Feed パス候補 */
const COMMON_FEED_PATHS = [
  "/feed",
  "/rss",
  "/rss.xml",
  "/atom.xml",
  "/feed.xml",
  "/index.xml",
  "/feed.json", // JSON Feed
  "/feeds/posts/default", // Blogger
] as const;

function isFeedContentType(ct: string): boolean {
  return (
    ct.includes("rss") ||
    ct.includes("atom") ||
    ct.includes("feed+json") ||
    ct.includes("text/xml") ||
    ct.includes("application/xml")
  );
}

function mediaType(contentType: string): string {
  return contentType.split(";", 1)[0].trim().toLowerCase();
}

/** 一般 JSON MIME の本文が JSON Feed かを安全に判定する。 */
export function isGenericJsonFeedResponse(contentType: string, body: string): boolean {
  if (mediaType(contentType) !== "application/json") return false;

  try {
    const data: unknown = JSON.parse(body);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return false;

    const record = data as Record<string, unknown>;
    if (typeof record.version !== "string" || !Array.isArray(record.items)) return false;

    const version = new URL(record.version);
    if (version.protocol !== "https:" && version.protocol !== "http:") return false;
    return (
      (version.hostname === "jsonfeed.org" || version.hostname === "www.jsonfeed.org") &&
      version.pathname.startsWith("/version/")
    );
  } catch {
    return false;
  }
}

/**
 * HTML から <link rel="alternate" type="application/rss+xml" href="..."> を検索する。
 * RSS 2.0 / Atom / JSON Feed の type を認識する。type と href の属性順序は問わない。
 */
function extractFeedLinkFromHtml(html: string, baseUrl: string): string | null {
  // type="..." が href="..." より前のパターン
  const patternTypeFirst =
    /<link[^>]+type=["']application\/(?:(?:rss|atom)\+xml|feed\+json)["'][^>]+href=["']([^"']+)["'][^>]*\/?>/gi;
  // href="..." が type="..." より前のパターン
  const patternHrefFirst =
    /<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/(?:(?:rss|atom)\+xml|feed\+json)["'][^>]*\/?>/gi;

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
  const origin = tryParseBase(baseUrl)?.origin;
  if (!origin) return null;

  const results = await Promise.allSettled(
    COMMON_FEED_PATHS.map(async (path) => {
      const url = origin + path;
      const res = await fetchFollowSafeRedirects(
        url,
        {
          method: "HEAD",
          headers: { "User-Agent": RSS_USER_AGENT },
        },
        DISCOVERY_TIMEOUT_MS,
      );
      const ct = res.headers.get("content-type") ?? "";
      if (res.ok && isFeedContentType(ct)) return url;
      throw new Error("not a feed");
    }),
  );

  for (const r of results) {
    if (r.status === "fulfilled") return r.value;
  }
  return null;
}

/**
 * URL から RSS/Atom フィード URL を探索する。
 *
 * 初期 URL を `isValidFeedUrl` で検証してから fetch を実行する。
 * `fetchFollowSafeRedirects` はリダイレクト先のみ検証し初期 URL は素通しするため、
 * `recommendation.ts` の Brave Search / JSON-LD 由来 URL を直接渡す経路で
 * プライベートネットワーク (RFC1918) への SSRF が成立しないようガードする。
 *
 * @param url 探索対象の URL（RSS 直リンク、またはサイトのトップページなど）
 * @returns 発見したフィード URL。見つからない場合は null。
 */
export async function discoverFeedUrl(url: string): Promise<string | null> {
  if (!isValidFeedUrl(url)) return null;
  const logUrl = sanitizeLogUrl(url);
  try {
    const res = await fetchFollowSafeRedirects(
      url,
      {
        headers: { "User-Agent": RSS_USER_AGENT },
      },
      DISCOVERY_TIMEOUT_MS,
    );
    if (!res.ok) return null;

    const ct = res.headers.get("content-type") ?? "";
    if (isFeedContentType(ct)) return url;

    // HTML は <head> を含む先頭 64KB、一般 JSON は 256KB まで読み、
    // 追加 fetch なしでフィード判定する。
    if (!res.body) return null;
    const maxBytes =
      mediaType(ct) === "application/json" ? MAX_JSON_FEED_DISCOVERY_BYTES : MAX_DISCOVERY_BYTES;
    const bytes = await readBodyBytesPartial(res.body, maxBytes);
    const body = new TextDecoder().decode(bytes);

    if (isGenericJsonFeedResponse(ct, body)) return url;

    const fromLink = extractFeedLinkFromHtml(body, url);
    if (fromLink) return fromLink;

    return probeCommonFeedPaths(url);
  } catch (err) {
    console.warn("[feed-discovery] discoverFeedUrl failed:", logUrl, err);
    return null;
  }
}
