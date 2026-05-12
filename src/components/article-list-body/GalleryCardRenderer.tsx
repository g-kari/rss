"use client";

import { memo, useCallback, useContext, useRef, type TouchEvent } from "react";
import type { Article } from "@/types";
import { GalleryArticleItem } from "@/components/ArticleItems";
import { GalleryItemCtx } from "./gallery-context";

const GALLERY_CARD_WRAPPER_STYLE_VISIBLE = {
  transition: "opacity 0.25s ease",
  opacity: 1,
};
const GALLERY_CARD_WRAPPER_STYLE_DELETING = {
  transition: "opacity 0.25s ease",
  opacity: 0,
  pointerEvents: "none" as const,
};

/**
 * masonic の render 引数として渡す GalleryArticleItem ラッパー。
 * memo でラップしておかないと masonic 側の再計算で全カードが再レンダーされ
 * チカチカするため、`render` の identity を安定化させる。
 */
const GalleryCardRenderer = memo(function GalleryCardRenderer({
  data,
  index,
}: {
  data: Article;
  index: number;
  width: number;
}) {
  const ctx = useContext(GalleryItemCtx);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchPos = useRef({ x: 0, y: 0 });

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!ctx) return;
      const touch = e.touches[0];
      touchPos.current = { x: touch.clientX, y: touch.clientY };
      longPressTimer.current = setTimeout(() => {
        ctx.onGalleryLongPress(data, index, touchPos.current.x, touchPos.current.y);
      }, 500);
    },
    [ctx, data, index],
  );

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  if (!ctx) return null;
  const isDeleting = ctx.deletingIds.has(data.id);
  const isNew = ctx.newIds.has(data.id);
  return (
    <div
      style={isDeleting ? GALLERY_CARD_WRAPPER_STYLE_DELETING : GALLERY_CARD_WRAPPER_STYLE_VISIBLE}
      onContextMenu={(e) => ctx.onGalleryContextMenu(e, data, index)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
    >
      <GalleryArticleItem
        {...ctx.resolveItemProps(data, index, isDeleting, isNew)}
        prefetchedImages={ctx.galleryImagesForItem(data.id)}
        galleryMinImagePx={ctx.galleryMinImagePx}
        isFetchFailed={ctx.galleryFailedIds.has(data.id)}
        isExpanding={ctx.galleryExpandingIds.has(data.id)}
        onRetry={() => ctx.galleryRetryArticle(data.id)}
      />
    </div>
  );
});

export default GalleryCardRenderer;
