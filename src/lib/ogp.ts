import { fetchFollowSafeRedirects, readBodyBytesPartial } from "./fetch";
import { unescapeHtml, extractOgMeta } from "./html";
import { decodeBytesToString, detectCharset } from "./content";
import { isValidFeedUrl } from "./url";

const DEFAULT_FETCH_TIMEOUT_MS = 5_000;
const MAX_BYTES = 512 * 1024; // OGP タグは先頭 512KB 以内にある
const MAX_OGP_IMAGE_URL_LENGTH = 8192; // imgix 等 CDN で URL が長くなる場合がある

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
};

export interface OgpMeta {
  title: string;
  description: string;
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
    const title = (ogTitle || pageTitle).slice(0, 500);

    const description = extractOgMeta(html, "description").slice(0, 500);

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
