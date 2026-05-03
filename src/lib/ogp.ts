import { fetchFollowSafeRedirects, readBodyBytesPartial } from "./fetch";
import { unescapeHtml, extractOgMeta, stripHtml } from "./html";
import { decodeBytesToString, detectCharset } from "./content";
import { isValidFeedUrl, isValidPublicUrl } from "./url";

/** OGP フェッチのデフォルトタイムアウト（ミリ秒） */
const DEFAULT_FETCH_TIMEOUT_MS = 5_000;
/** OGP タグは先頭 512KB 以内にあると想定し、部分取得の上限バイト数として使用する */
const MAX_BYTES = 512 * 1024;

/** OGP フェッチ時に送信するリクエストヘッダー */
const FETCH_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
};

/**
 * vxtwitter.com / fxtwitter.com 等の OGP プロキシはボット UA にのみ
 * OGP meta タグを返し、通常ブラウザ UA にはリダイレクトを返す。
 * そのためプロキシホストには Twitterbot UA で fetch する。
 */
const BOT_UA_HOSTS = new Set(["vxtwitter.com", "fxtwitter.com", "fixupx.com"]);
const BOT_USER_AGENT = "Twitterbot/1.0";

/** x.com / twitter.com は OGP を返さないため、代替ホスト vxtwitter.com に差し替える */
const TWITTER_LIKE_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "mobile.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
]);

/**
 * fetch 先ホストに応じたリクエストヘッダーを返す。
 * OGP プロキシホスト（vxtwitter.com 等）にはボット UA を使用する。
 */
export function buildFetchHeaders(fetchUrl: string): Record<string, string> {
  try {
    const host = new URL(fetchUrl).hostname.toLowerCase();
    if (BOT_UA_HOSTS.has(host)) {
      return { ...FETCH_HEADERS, "User-Agent": BOT_USER_AGENT };
    }
  } catch {
    // 不正 URL はデフォルトヘッダーで続行
  }
  return FETCH_HEADERS;
}

/**
 * OGP 取得用に URL を正規化する。
 * x.com / twitter.com 系ホストは bot 向け OGP を返さないため、
 * OGP 互換プロキシである vxtwitter.com に差し替える。
 * 他ホスト・不正入力は変更せずそのまま返す。
 */
export function normalizeOgpFetchUrl(url: string): string {
  try {
    const u = new URL(url);
    if (TWITTER_LIKE_HOSTS.has(u.hostname.toLowerCase())) {
      u.hostname = "vxtwitter.com";
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}

/**
 * ページから取得した OGP メタデータ。
 * フェッチ失敗時は全フィールドが空文字のフォールバック値を返す。
 */
export interface OgpMeta {
  /** ページタイトル（og:title または &lt;title&gt; タグから取得） */
  title: string;
  /** ページの説明文（og:description から取得） */
  description: string;
  /** OGP 画像 URL（og:image から取得。無効な URL の場合は空文字） */
  image: string;
}

/**
 * URL のページから OGP メタデータ（title / description / og:image）を取得する。
 * charset 検出を行い、非 UTF-8 ページにも対応する。
 * フェッチ失敗時は空文字のフォールバック値を返す。
 */
export async function fetchPageOgpMeta(
  url: string,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<OgpMeta> {
  try {
    const fetchUrl = normalizeOgpFetchUrl(url);
    const headers = buildFetchHeaders(fetchUrl);
    const res = await fetchFollowSafeRedirects(fetchUrl, { headers }, timeoutMs);
    if (!res.ok || !res.body) return { title: "", description: "", image: "" };

    const bytes = await readBodyBytesPartial(res.body, MAX_BYTES);
    const contentType = res.headers.get("content-type") ?? "";
    const charset = detectCharset(contentType, bytes);
    const html = decodeBytesToString(bytes, charset);

    const ogTitle = extractOgMeta(html, "title");
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const pageTitle = unescapeHtml((titleMatch?.[1] ?? "").trim());
    const title = stripHtml(ogTitle || pageTitle).slice(0, 500);

    const description = stripHtml(extractOgMeta(html, "description")).slice(0, 500);

    const rawImage = extractOgMeta(html, "image");
    const image = isValidPublicUrl(rawImage) ? rawImage : "";

    return { title, description, image };
  } catch {
    return { title: "", description: "", image: "" };
  }
}

/**
 * URL が X/Twitter 系ホストかどうかを判定する。
 * vxtwitter.com / fxtwitter.com 等のプロキシホストも含む。
 */
export function isTwitterLikeUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return TWITTER_LIKE_HOSTS.has(host) || BOT_UA_HOSTS.has(host);
  } catch {
    return false;
  }
}

/** フォールバック URL 抽出時にスキップするホスト群（自己参照的なリンク） */
const SKIP_HOSTS_FOR_FALLBACK = new Set([
  "x.com",
  "www.x.com",
  "mobile.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
  "t.co",
  "pic.twitter.com",
  "vxtwitter.com",
  "fxtwitter.com",
  "fixupx.com",
]);

/** 画像ファイル拡張子（OGP ではなく直接画像のためスキップ） */
const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|avif|svg|bmp|ico)(\?|$)/i;

/**
 * HTML から外部リンク URL を抽出する。
 * ツイート本文に含まれる共有 URL をフォールバック OGP 取得用に返す。
 * 自己参照（twitter.com / x.com / t.co 等）や画像 URL はスキップする。
 */
export function extractExternalUrls(html: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = unescapeHtml(match[1].trim());
    if (!href || !/^https?:\/\//i.test(href)) continue;
    if (!isValidFeedUrl(href)) continue;

    try {
      const host = new URL(href).hostname.toLowerCase();
      if (SKIP_HOSTS_FOR_FALLBACK.has(host)) continue;
    } catch {
      continue;
    }

    if (IMAGE_EXTENSIONS.test(href)) continue;

    const normalized = href.split("#")[0];
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(href);
  }

  return urls;
}

/** フォールバック時にツイートページの HTML を取得する最大バイト数 */
const FALLBACK_MAX_BYTES = 256 * 1024;
/** フォールバック時に試行する URL の最大数 */
const MAX_FALLBACK_ATTEMPTS = 3;
/** フォールバック全体のタイムアウト（ミリ秒） */
const FALLBACK_TOTAL_TIMEOUT_MS = 3_000;

/**
 * X/Twitter 投稿に OGP 画像がない場合に、投稿内のリンク先から OGP 画像を取得する。
 * vxtwitter.com のページ HTML からリンクを抽出し、各リンク先の OGP 画像を試行する。
 *
 * @param originalUrl - 元の X/Twitter URL
 * @param timeoutMs - 個別フェッチのタイムアウト
 * @returns 見つかった OGP 画像 URL。なければ空文字
 */
export async function fetchTwitterFallbackImage(
  originalUrl: string,
  timeoutMs: number = FALLBACK_TOTAL_TIMEOUT_MS,
): Promise<string> {
  try {
    // vxtwitter のページ HTML を取得してリンクを抽出
    const fetchUrl = normalizeOgpFetchUrl(originalUrl);
    const headers = buildFetchHeaders(fetchUrl);
    const res = await fetchFollowSafeRedirects(fetchUrl, { headers }, timeoutMs);
    if (!res.ok || !res.body) return "";

    const bytes = await readBodyBytesPartial(res.body, FALLBACK_MAX_BYTES);
    const contentType = res.headers.get("content-type") ?? "";
    const charset = detectCharset(contentType, bytes);
    const html = decodeBytesToString(bytes, charset);

    const urls = extractExternalUrls(html);
    if (urls.length === 0) return "";

    // 各リンク先の OGP を試行（最大 MAX_FALLBACK_ATTEMPTS 個、全体タイムアウト付き）
    const perUrlTimeout = Math.min(timeoutMs, FALLBACK_TOTAL_TIMEOUT_MS);
    for (const candidateUrl of urls.slice(0, MAX_FALLBACK_ATTEMPTS)) {
      // 再帰防止: Twitter 系 URL はスキップ
      if (isTwitterLikeUrl(candidateUrl)) continue;

      try {
        const meta = await fetchPageOgpMeta(candidateUrl, perUrlTimeout);
        if (meta.image && isValidPublicUrl(meta.image)) {
          return meta.image;
        }
      } catch {
        // 個別の失敗は無視して次を試行
      }
    }

    return "";
  } catch {
    return "";
  }
}
