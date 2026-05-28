import type { Article } from "../types";
import { collectImageUrlsFromHtml } from "./image-extractor";
import { collectIframeUrlsFromHtml } from "./embed-utils";

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

/**
 * `usePrefetchGalleryContents` 用に、HTML 文字列から画像 URL と iframe embed URL を
 * 1 回の呼び出しで抽出する純粋関数 (#866 案 A)。
 *
 * 旧実装は `collectImageUrlsFromHtml(html)` と `collectIframeUrlsFromHtml(html)` を
 * 2 箇所 (fetch 完了時 + LRU cache hit 時) × 2 helper = 計 4 回呼んでおり、600+ articles ×
 * prefetch のスケールで毎 fetch 完了時に regex parsing コストが累積していた
 * (perf 監査 finding 1)。
 *
 * 本 helper は両 helper を 1 箇所に集約し、戻り値を `{ images, embeds }` 統合型化する
 * ことで:
 *
 * 1. caller 側の 2 行コード (`{ images: collectImageUrlsFromHtml(...), embeds:
 *    collectIframeUrlsFromHtml(...) }`) を 1 関数呼び出しに統合 (caller の cognitive
 *    load 削減 + 将来の hook 追加で sibling drift を防ぐ単一 entry point 化)
 * 2. 入力検証 (`typeof html !== "string"` defensive guard) を 1 度だけ実行
 * 3. CPU cache locality: 同一 HTML 文字列を連続して 2 helper に渡すので、文字列の
 *    page が L1/L2 cache hot な状態で 2 helper 双方が走る (function call boundary を
 *    1 つに減らす効果と合わせて prefetch path の per-article overhead を削減)
 *
 * **既存挙動互換**: 戻り値の `images` / `embeds` は順序・内容ともに既存 2 helper を
 * 個別に呼んだ結果と完全一致する (内部で同 helper を直接呼ぶため。combined regex pass
 * 化は test 仕様 (各 helper 単独の output 順序) に依存があるため見送り、別 Issue 候補)。
 */
export interface GalleryPrefetchMedia {
  /** 本文から抽出した画像 URL（重複排除済み、document order ではなく `<a>` / `<source>` / `<img>` の収集順） */
  images: string[];
  /** 本文から抽出した信頼済み iframe の src（YouTube / Vimeo / ニコニコ 等） */
  embeds: string[];
}

export function collectGalleryMediaFromHtml(html: unknown): GalleryPrefetchMedia {
  // 非 string 入力は `collectImageUrlsFromHtml` が空配列を返す defensive guard を持つ
  // (#812 同種症状、image-extractor.ts § 114-122 参照)。iframe 側は string 前提なので
  // ここで一段ガードする (`""` を渡せば iframe regex も空配列を返す)。
  if (typeof html !== "string") return { images: [], embeds: [] };
  return {
    images: collectImageUrlsFromHtml(html),
    embeds: collectIframeUrlsFromHtml(html),
  };
}
