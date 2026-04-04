import { fetchFollowSafeRedirects, readBodyBytesPartial } from "./fetch";
import { unescapeHtml, extractOgMeta, stripHtml } from "./html";
import { decodeBytesToString, detectCharset } from "./content";
import { isValidFeedUrl } from "./url";

/** OGP フェッチのデフォルトタイムアウト（ミリ秒） */
const DEFAULT_FETCH_TIMEOUT_MS = 5_000;
/** OGP タグは先頭 512KB 以内にあると想定し、部分取得の上限バイト数として使用する */
const MAX_BYTES = 512 * 1024;
/** imgix 等 CDN で URL が長くなる場合を考慮した OGP 画像 URL の最大許容長 */
const MAX_OGP_IMAGE_URL_LENGTH = 8192;

/** OGP フェッチ時に送信するリクエストヘッダー */
const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
};

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
    const res = await fetchFollowSafeRedirects(url, { headers: FETCH_HEADERS }, timeoutMs);
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
    const image =
      /^https?:\/\//i.test(rawImage) &&
      rawImage.length <= MAX_OGP_IMAGE_URL_LENGTH &&
      isValidFeedUrl(rawImage)
        ? rawImage
        : "";

    return { title, description, image };
  } catch {
    return { title: "", description: "", image: "" };
  }
}
