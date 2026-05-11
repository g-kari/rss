/**
 * x.com / twitter.com の TTS / 要約 fallback 判定純粋関数 (#718)。
 *
 * x.com / twitter.com は JavaScript が無効なクライアント (Cloudflare Workers の HTTP fetch) では
 * 「JavaScript is not available」「Something went wrong」のような エラーページ風 HTML を返す。
 * これが `extractMainContent` で本文として抽出され、TTS で読み上げられたり AI 要約の入力に
 * 使われたりすると、ユーザーにとって無価値な情報が音声化される。
 *
 * 解消策: x.com / twitter.com ドメイン + JS-disabled エラー文字列を検出して、その content を
 * 「fallback すべき」と判定する。consumer (`buildTtsText` / `useArticleAi` 等) は本関数の
 * `true` 戻り値で processedContent を skip して `article.summary` (RSS 由来 OGP description)
 * を優先的に使う。
 */

const X_COM_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "mobile.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
]);

/**
 * x.com / twitter.com 系ホスト判定。サブドメインや末尾スラッシュの揺れに寛容。
 */
export function isXComHost(link: string | null | undefined): boolean {
  if (!link) return false;
  try {
    const url = new URL(link);
    return X_COM_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * JavaScript 無効時にサイトが返すエラーページの代表的な文字列パターン。
 * 大文字小文字を無視。content の先頭 500 文字以内に出現するかをチェック。
 *
 * パターン:
 *   - "JavaScript is not available" (x.com 英語)
 *   - "JavaScript を有効に" (x.com 日本語)
 *   - "Please enable JavaScript" (汎用)
 *   - "JavaScript is disabled" (汎用)
 *   - "We've detected that JavaScript is disabled" (x.com 詳細メッセージ)
 *   - "Something went wrong, but don't fret" (x.com エラー)
 */
const JS_ERROR_PATTERNS: readonly RegExp[] = [
  /JavaScript is not available/i,
  /JavaScript を有効/,
  /Please enable JavaScript/i,
  /JavaScript is disabled/i,
  /JavaScript が無効/,
  /Something went wrong, but don'?t fret/i,
];

/**
 * 与えられた content が JavaScript 無効時のエラーページかを判定する。
 * 先頭 500 文字のみチェック (長文記事の本文中に偶然含まれる場合の false positive を防ぐ)。
 */
export function isJsDisabledContent(content: string | null | undefined): boolean {
  if (!content) return false;
  const head = content.slice(0, 500);
  return JS_ERROR_PATTERNS.some((p) => p.test(head));
}

/**
 * x.com / twitter.com ドメイン × JS 無効エラー content の組合せを判定。
 * 両方 true のときのみ true を返す。
 *
 * consumer は本関数の戻り値で processedContent を skip すべきかを決める。
 */
export function needsXComOgpFallback(
  link: string | null | undefined,
  content: string | null | undefined,
): boolean {
  return isXComHost(link) && isJsDisabledContent(content);
}
