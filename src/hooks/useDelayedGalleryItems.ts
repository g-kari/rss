"use client";

import { useEffect, useRef, useState } from "react";

interface Result<T> {
  /** masonic に渡す表示用配列 — 削除予定アイテムも一時的に含む */
  displayItems: T[];
  /** フェードアウト中のアイテム ID 集合 — Renderer 側で opacity 遷移に使う */
  deletingIds: Set<string>;
  /** 今回新規追加されたアイテム ID 集合 — 追加アニメーション用 */
  newIds: Set<string>;
}

/**
 * items から抜けた要素を一定時間 displayItems に残し、フェードアウト用の id セットを公開するフック。
 *
 * 画像/動画ギャラリーで記事が既読になって `items` から削除された瞬間に masonic の positioner が
 * 再生成されて全カードが瞬時に再配置されると視覚的に不自然（カードが飛ぶ）なため、
 * - 削除されたアイテムを `delayMs` (既定 300ms) 間 `displayItems` に保持
 * - その間 `deletingIds` に id を入れて Renderer 側で opacity → 0 に遷移
 * - 遅延後に真の `items` と同期することで masonic 内部の positioner 再生成を起こし、
 *   残ったカードの top/left を CSS transition (GalleryMasonry の itemStyle) で滑らかに移動させる
 *
 * 新規追加のみ（append-only）の場合は遅延せず即同期する。
 *
 * 注意: `items` と `getId` の identity が変わるたびに判定を走らせるため、
 *   呼び出し側は `visible` を `useMemo` で安定化し、`getId` は `useCallback` or module scope 関数にすること。
 */
const EMPTY_SET = Object.freeze(new Set<string>()) as Set<string>;

export function useDelayedGalleryItems<T>(
  items: T[],
  getId: (item: T) => string,
  delayMs = 300,
): Result<T> {
  const [displayItems, setDisplayItems] = useState<T[]>(items);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set());
  const prevItemsRef = useRef<T[]>(items);
  const newTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const prev = prevItemsRef.current;
    prevItemsRef.current = items;

    const currentIds = new Set(items.map(getId));
    const prevIds = new Set(prev.map(getId));

    const removedItems = prev.filter((a) => !currentIds.has(getId(a)));
    const addedItems = items.filter((a) => !prevIds.has(getId(a)));

    // 新規追加追跡（リスト完全置換時はスキップ）
    clearTimeout(newTimerRef.current);
    const isFullReplacement = prevIds.size > 0 && [...currentIds].every((id) => !prevIds.has(id));
    if (addedItems.length > 0 && !isFullReplacement) {
      setNewIds(new Set(addedItems.map(getId)));
      newTimerRef.current = setTimeout(() => setNewIds(EMPTY_SET), delayMs + 200);
    } else {
      setNewIds(EMPTY_SET);
    }

    if (removedItems.length === 0) {
      setDisplayItems(items);
      setDeletingIds(EMPTY_SET);
      return () => clearTimeout(newTimerRef.current);
    }

    // 削除あり: prev の順序を保ったまま、items にしかない新規追加を末尾に足して merged を構築
    const merged = [...prev, ...addedItems];

    setDisplayItems(merged);
    setDeletingIds(new Set(removedItems.map(getId)));

    const deleteTimer = setTimeout(() => {
      setDisplayItems(items);
      setDeletingIds(EMPTY_SET);
    }, delayMs);

    return () => {
      clearTimeout(deleteTimer);
      clearTimeout(newTimerRef.current);
    };
  }, [items, getId, delayMs]);

  return { displayItems, deletingIds, newIds };
}
