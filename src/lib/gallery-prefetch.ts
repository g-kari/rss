import type { Article } from "../types";

/**
 * `usePrefetchGalleryContents` の useEffect 依存配列に渡すキー (#669)。
 *
 * articles は毎レンダーで新参照 (`visible.slice(...)`) になるため、依存配列に
 * 直接入れると毎レンダーで effect が再実行されて進行中 fetch が中断される。
 * 代わりに記事 ID を結合した文字列キーを依存にすることで、内容が変わらない
 * 限り effect を再実行しない。
 *
 * **重要**: 旧実装は `articles.slice(0, maxPrefetch)` で先頭 N 件のみキー化して
 * いたため、ユーザーがスクロールして visible が拡張されても articlesKey が変わらず
 * effect が再実行されない → 21 件目以降が永遠にプリフェッチされない問題があった
 * (#669「一定処理すると止まる」)。**全 visible 記事の ID** をキーにすることで
 * visible 拡張を確実に検知する。
 */
export function buildArticlesKey(articles: Article[]): string {
  return articles
    .filter((a) => Boolean(a.link))
    .map((a) => a.id)
    .join("\0");
}
