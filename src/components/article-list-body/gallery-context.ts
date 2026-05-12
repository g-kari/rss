import { createContext, type MouseEvent } from "react";
import type { Article } from "@/types";
import type { GalleryEntry } from "@/lib/gallery-explode";
import type { ResolveItemProps } from "./types";

/**
 * GalleryMasonry の render コンポーネントは masonic 制約により最少の props だけを
 * 受け取るため、各カードに必要な情報は React Context 経由で渡す。
 */
export interface GalleryItemContextValue {
  resolveItemProps: ResolveItemProps;
  galleryImagesForItem: (articleId: string) => string[] | undefined;
  galleryMinImagePx: number;
  deletingIds: Set<string>;
  newIds: Set<string>;
  galleryFailedIds: Set<string>;
  galleryExpandingIds: Set<string>;
  galleryRetryArticle: (id: string) => void;
  onGalleryContextMenu: (e: MouseEvent, article: Article, index: number) => void;
  onGalleryLongPress: (article: Article, index: number, x: number, y: number) => void;
  /**
   * Phase 1: 画像/動画 view で 1 記事 N 画像を分解した際の画像クリック ハンドラ。
   * forcedImageSrc が entry にあれば呼ばれる (= ライトボックスを開く)。
   * 未指定 (= articles/social view または explode=false) では undefined。
   */
  onSelectImage?: (imageSrc: string, article: Article) => void;
  /**
   * forcedImageSrc が min-px フィルタで hidden になった際の通知 (entry.key 単位)。
   * 親で hidden entry を items 配列から除外して masonic の空白セルを消す。
   */
  onHideForcedImage?: (entryKey: string) => void;
}

export const GalleryItemCtx = createContext<GalleryItemContextValue | null>(null);

/** Article-based (従来 1 article 1 card) の item key */
export const galleryItemKey = (a: Article) => a.id;

/** GalleryEntry-based (Phase 1 で 1 記事 N 画像分解) の item key */
export const galleryEntryItemKey = (entry: GalleryEntry) => entry.key;
