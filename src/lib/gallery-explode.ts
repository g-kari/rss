/**
 * ギャラリービューの「記事で画像をまとめない」展開ロジック (Phase 0b)。
 *
 * 画像/動画 view (`activeFeedView` が `pictures` / `videos`) でギャラリー layout のとき、
 * 1 記事 N 画像を N 個のカードに分解して masonic に渡すための純粋関数。
 *
 * 既読/ブックマーク等の状態は記事単位で共有されるため、各 entry は同じ `article`
 * reference を保持する (toggle が全画像カードに同時反映される)。
 *
 * 上限なし: 1 記事 50 画像なら 50 entry を生成 (ユーザー要件)。
 */

import type { Article } from "../types";

/**
 * ギャラリー描画用の 1 単位 (記事 1 件 or 画像 1 枚)。
 *
 * - `imageSrc === null && imageIndex === null` は「未展開」(従来の 1 記事 1 カード)。
 *   `totalImages` が `null` なら prefetch 未完了、`0` なら本文画像なし (thumb fallback)。
 * - `imageSrc !== null` は「展開済」(画像 1 枚 1 カード)。
 */
export interface GalleryEntry {
  /** 型判別用 discriminant (#769)。Article | GalleryEntry の型ガードで判別 */
  readonly _type: "gallery-entry";
  /** 元記事への reference。既読/ブックマーク状態の参照元 */
  article: Article;
  /** 描画する画像 URL。null なら従来の prefetched/thumb fallback ロジックに委ねる */
  imageSrc: string | null;
  /** 同一記事内での画像 index (0-base)。null なら未展開 */
  imageIndex: number | null;
  /** 同一記事内の総画像数。null なら prefetch 未完了、0 なら本文画像なし */
  totalImages: number | null;
  /** masonic item key (unique 必須) */
  key: string;
}

export interface ExplodeOptions {
  /** true なら 1 article N image → N entry に展開、false なら 1 article 1 entry */
  explode: boolean;
  /** 記事 ID → prefetched 画像配列の lookup (undefined なら未完了) */
  prefetchedImagesByArticleId: (articleId: string) => string[] | undefined;
}

export function explodeArticlesIntoGalleryEntries(
  articles: Article[],
  options: ExplodeOptions,
): GalleryEntry[] {
  if (!options.explode) {
    return articles.map((article) => ({
      _type: "gallery-entry",
      article,
      imageSrc: null,
      imageIndex: null,
      totalImages: null,
      key: article.id,
    }));
  }
  const entries: GalleryEntry[] = [];
  for (const article of articles) {
    const images = options.prefetchedImagesByArticleId(article.id);
    if (images === undefined) {
      // prefetch 未完了 → placeholder 用 1 entry
      entries.push({
        _type: "gallery-entry",
        article,
        imageSrc: null,
        imageIndex: null,
        totalImages: null,
        key: article.id,
      });
      continue;
    }
    if (images.length === 0) {
      // 本文画像なし → thumb fallback 用 1 entry (totalImages: 0 で明示)
      entries.push({
        _type: "gallery-entry",
        article,
        imageSrc: null,
        imageIndex: null,
        totalImages: 0,
        key: article.id,
      });
      continue;
    }
    for (let i = 0; i < images.length; i++) {
      entries.push({
        _type: "gallery-entry",
        article,
        imageSrc: images[i]!,
        imageIndex: i,
        totalImages: images.length,
        key: `${article.id}-${i}`,
      });
    }
  }
  return entries;
}
