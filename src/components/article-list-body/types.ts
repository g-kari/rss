import type { Article } from "@/types";
import type { ArticleItemProps } from "@/components/ArticleItems";

/**
 * compact / list レイアウト用のフラット化アイテム。
 * 仮想スクロールに渡すため、日付ヘッダーと記事を同じ配列に並べる。
 */
export type FlatItem =
  | { type: "header"; label: string; key: string }
  | { type: "article"; article: Article; articleIndex: number; key: string };

/**
 * `useArticleListItemProps` が返す resolveItemProps の型エイリアス。
 * 各 body コンポーネントが props として受け取り、子の ArticleItem に渡す。
 */
export type ResolveItemProps = (
  article: Article,
  index: number,
  isDeleting?: boolean,
  isNew?: boolean,
) => ArticleItemProps;
