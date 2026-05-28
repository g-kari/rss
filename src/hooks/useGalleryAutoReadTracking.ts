"use client";

import { useCallback, useEffect, useState } from "react";

interface GalleryAutoReadTrackingState {
  /** 自動既読として既に処理済みの記事 ID */
  galleryAutoReadIds: Set<string>;
  /** 1 件追加 (重複は無視) */
  handleGalleryAutoRead: (id: string) => void;
}

interface GalleryAutoReadTrackingOptions {
  /** リセットトリガーとなる選択 ID 群 (フィード/グループ/ビュー/レイアウトの切替) */
  selectedFeedId: string | null;
  selectedGroupId: string | null;
  activeFeedView: string;
  layout: string;
}

/**
 * ギャラリーレイアウトでスクロール通過時に自動既読化された記事 ID を追跡する hook (#650 Step 1i)。
 *
 * - フィード / グループ / ビュー / レイアウトが切り替わったら蓄積をリセットする
 *   (前画面の自動既読履歴が新画面のフィルタリングに混入しないように)
 * - 同じ ID の重複追加は無視 (Set 同一性を保ち再レンダー回数を抑える)
 *
 * 元 `App.tsx` の galleryAutoReadIds + handleGalleryAutoRead + reset effect を切り出し。
 */
export function useGalleryAutoReadTracking({
  selectedFeedId,
  selectedGroupId,
  activeFeedView,
  layout,
}: GalleryAutoReadTrackingOptions): GalleryAutoReadTrackingState {
  const [galleryAutoReadIds, setGalleryAutoReadIds] = useState<Set<string>>(() => new Set());

  const handleGalleryAutoRead = useCallback((id: string) => {
    setGalleryAutoReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    setGalleryAutoReadIds(new Set());
  }, [selectedFeedId, selectedGroupId, activeFeedView, layout]);

  return { galleryAutoReadIds, handleGalleryAutoRead };
}
