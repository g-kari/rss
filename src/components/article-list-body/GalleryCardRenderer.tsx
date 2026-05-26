"use client";

import { memo, useCallback, useContext, useRef, type TouchEvent } from "react";
import type { Article } from "@/types";
import type { GalleryEntry } from "@/lib/gallery-explode";
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
 * data が GalleryEntry か Article かを判別する型ガード。
 * discriminated union (#769): `_type: "gallery-entry"` field で明示判別する。
 * 旧実装は `article` field の存在チェックだったが、Article が将来 `article` 名の field を
 * 持つと誤判定する潜在リスクがあったため、discriminant 文字列に切替。
 */
function isGalleryEntry(data: Article | GalleryEntry): data is GalleryEntry {
  return (data as GalleryEntry)._type === "gallery-entry";
}

/**
 * gallery virtualizer の render 引数として渡す GalleryArticleItem ラッパー。
 * memo でラップしておかないと virtualizer 側の再計算で全カードが再レンダーされ
 * チカチカするため、`render` の identity を安定化させる。
 *
 * `data` は Article (従来) または GalleryEntry (画像/動画 view で展開済) の
 * いずれも受け取れる。entry なら entry.article + forcedImageSrc を使う。
 */
const GalleryCardRenderer = memo(function GalleryCardRenderer({
  data,
  index,
}: {
  data: Article | GalleryEntry;
  index: number;
  width: number;
}) {
  const ctx = useContext(GalleryItemCtx);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchPos = useRef({ x: 0, y: 0 });

  const entry = isGalleryEntry(data) ? data : null;
  const article = entry ? entry.article : (data as Article);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!ctx) return;
      const touch = e.touches[0];
      touchPos.current = { x: touch.clientX, y: touch.clientY };
      longPressTimer.current = setTimeout(() => {
        ctx.onGalleryLongPress(article, index, touchPos.current.x, touchPos.current.y);
      }, 500);
    },
    [ctx, article, index],
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
  const isDeleting = ctx.deletingIds.has(article.id);
  const isNew = ctx.newIds.has(article.id);
  return (
    <div
      style={isDeleting ? GALLERY_CARD_WRAPPER_STYLE_DELETING : GALLERY_CARD_WRAPPER_STYLE_VISIBLE}
      onContextMenu={(e) => ctx.onGalleryContextMenu(e, article, index)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
    >
      <GalleryArticleItem
        {...ctx.resolveItemProps(article, index, isDeleting, isNew)}
        prefetchedImages={ctx.galleryImagesForItem(article.id)}
        galleryMinImagePx={ctx.galleryMinImagePx}
        isFetchFailed={ctx.galleryFailedIds.has(article.id)}
        isExpanding={ctx.galleryExpandingIds.has(article.id)}
        onRetry={() => ctx.galleryRetryArticle(article.id)}
        onSelectImage={ctx.onSelectImage}
        // discriminated union (#770): forcedImage 3 props は「entry mode (3 値必須)」or
        // 「null mode (全部 undefined)」のどちらか一方を spread で渡す。TS の union narrow が
        // 動くことで「forcedImageSrc 渡したが key 忘れた」silent failure を構造的に防止。
        {...(entry && entry.imageSrc && ctx.onHideForcedImage
          ? {
              forcedImageSrc: entry.imageSrc,
              forcedImageKey: entry.key,
              onHideForcedImage: ctx.onHideForcedImage,
            }
          : { forcedImageSrc: null })}
      />
    </div>
  );
});

export default GalleryCardRenderer;
