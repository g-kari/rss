"use client";

import { memo, useCallback, useContext, useEffect, useRef, useState, type TouchEvent } from "react";
import type { Article } from "@/types";
import { GalleryArticleItem } from "@/components/ArticleItems";
import { GalleryItemCtx } from "./gallery-context";
import { OffViewportObserverCtx } from "@/hooks/useOffViewportPositioner";

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
  const offViewport = useContext(OffViewportObserverCtx);
  const rootRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchPos = useRef({ x: 0, y: 0 });

  // #714 Phase 2: ResizeObserver 登録 + 案 2 (min-height で初期高さ固定)
  // 初回 mount 時の offsetHeight を記録して minHeight として state 化する。
  // viewport 内 の cell は画像 load で aspect-ratio が縦長になっても min-height で
  // 下限を保ち、横長で aspect-ratio が縮む場合の shrink を防ぐ。
  // (positioner.update は viewport 外でのみ走るので、visible cell の top/left は不変)
  const [initialMinHeight, setInitialMinHeight] = useState<number | null>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !offViewport) return;
    offViewport.register(el, index);
    if (initialMinHeight === null) {
      const h = el.getBoundingClientRect().height;
      if (h > 0) setInitialMinHeight(h);
    }
    return () => offViewport.unregister(el);
  }, [offViewport, index, initialMinHeight]);

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
  // #714 Phase 2: initialMinHeight を base style に merge して shrink 防止
  const baseStyle = isDeleting
    ? GALLERY_CARD_WRAPPER_STYLE_DELETING
    : GALLERY_CARD_WRAPPER_STYLE_VISIBLE;
  const wrapperStyle =
    initialMinHeight !== null ? { ...baseStyle, minHeight: initialMinHeight } : baseStyle;
  return (
    <div
      ref={rootRef}
      style={wrapperStyle}
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
