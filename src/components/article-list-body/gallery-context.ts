import { createContext, type MouseEvent } from "react";
import type { Article } from "@/types";
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
}

export const GalleryItemCtx = createContext<GalleryItemContextValue | null>(null);

export const galleryItemKey = (a: Article) => a.id;
