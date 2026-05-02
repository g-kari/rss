"use client";

/**
 * 後方互換性のための re-export ファイル。
 * 実体は article-items/ ディレクトリに分割済み。
 */
export {
  type ArticleItemProps,
  type GalleryItemExtraProps,
  ArticleActions,
  ArticleThumbnail,
  ReadingTimeBadge,
  DuplicateBadge,
  FilterableGalleryImage,
  CompactArticleItem,
  ListArticleItem,
  CardArticleItem,
  MagazineFeaturedArticleItem,
  GalleryArticleItem,
} from "./article-items";

// ArticleList.tsx が `import { resolveThumbnail } from "./ArticleItems"` している
export { resolveThumbnail, highlightText } from "../lib/article-utils";
