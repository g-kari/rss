/**
 * JSON-LD `<script type="application/ld+json">` から記事の主要画像 URL を抽出する
 * 純粋関数。
 *
 * 多くのサイト (特に CMS / 漫画ビューワ等) は schema.org の Article エンティティで
 * `"image": ["url1", "url2", ...]` または `"image": "url"` を宣言する。これは
 * 「この記事の主要画像」の信頼できるソースになる。
 *
 * Readability はテキスト密度ベースで本文を抽出するため、テキストが少ない画像主体ページ
 * では別の領域 (推薦・サイドバーなど) を「本文」と誤判定して主要画像を取りこぼすことが
 * ある。JSON-LD の image 宣言を併用することで、抽出結果に **記事固有の主要画像** が
 * 含まれているかを検証・補完できる。
 */

/**
 * HTML から JSON-LD の `image` フィールドを全て収集する。
 *
 * - `@type` が "article" / "Article" / "NewsArticle" / "BlogPosting" の場合のみ採用
 * - `image` は文字列配列 / 文字列単体 / `{ url: "..." }` オブジェクトのいずれも許容
 * - http(s) URL のみ採用 (data:, javascript:, 相対パス等は除外)
 *
 * @returns 重複除去済みの画像 URL 配列
 */
export function extractJsonLdImages(html: string): string[] {
  const scripts = [
    ...html.matchAll(
      /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi,
    ),
  ];
  const urls = new Set<string>();
  for (const [, json] of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json.trim());
    } catch {
      continue;
    }
    walkJsonLd(parsed, urls);
  }
  return [...urls];
}

const ARTICLE_TYPES = new Set([
  "article",
  "newsarticle",
  "blogposting",
  "techarticle",
  "scholarlyarticle",
  "report",
  "socialmediaposting",
]);

function walkJsonLd(node: unknown, urls: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) walkJsonLd(item, urls);
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  // @type 一致 (article 系) なら image を採用
  const typeRaw = obj["@type"];
  const types = Array.isArray(typeRaw) ? typeRaw : [typeRaw];
  const isArticle = types.some((t) => typeof t === "string" && ARTICLE_TYPES.has(t.toLowerCase()));
  if (isArticle && "image" in obj) {
    collectImageUrls(obj.image, urls);
  }
  // 入れ子オブジェクトも探索 (BreadcrumbList などに混在することがある)
  for (const v of Object.values(obj)) {
    if (typeof v === "object" && v !== null) walkJsonLd(v, urls);
  }
}

function collectImageUrls(image: unknown, urls: Set<string>): void {
  if (typeof image === "string") {
    if (isHttpUrl(image)) urls.add(image);
    return;
  }
  if (Array.isArray(image)) {
    for (const i of image) collectImageUrls(i, urls);
    return;
  }
  if (image && typeof image === "object") {
    const obj = image as Record<string, unknown>;
    // schema.org ImageObject: { "@type": "ImageObject", "url": "..." }
    if (typeof obj.url === "string") collectImageUrls(obj.url, urls);
    if (typeof obj.contentUrl === "string") collectImageUrls(obj.contentUrl, urls);
  }
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

/**
 * 抽出済みコンテンツに、JSON-LD の主要画像が **不足していれば補完する**。
 *
 * 用途: Readability が画像主体ページで本文を取りこぼした場合のフォールバック。
 * 既に含まれている画像はそのままにし、足りない画像だけを末尾の `<div hidden>`
 * (ImageGallery 用) に追加する。
 *
 * `<div hidden>` を選ぶ理由: 本文中に直接 `<img>` を挿入すると Readability の
 * 結果と重複表示・順序破壊が起きるため、クライアント側 ImageGallery が拾える形で
 * 後付けする。`extractThumbListImgs` と同じ手法。
 */
export function appendMissingJsonLdImages(
  extractedContent: string,
  jsonLdImageUrls: string[],
): string {
  if (jsonLdImageUrls.length === 0) return extractedContent;
  const missing = jsonLdImageUrls.filter((url) => !extractedContent.includes(url));
  if (missing.length === 0) return extractedContent;
  const imgs = missing.map((url) => `<img src="${escapeAttr(url)}" alt="" />`).join("");
  return extractedContent + `<div hidden>${imgs}</div>`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
