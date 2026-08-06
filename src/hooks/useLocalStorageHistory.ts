"use client";

import { useState, useCallback } from "react";
import { loadJsonArray, saveJson } from "../lib/storage";

/**
 * localStorage に配列を永続化する汎用フック。
 * 先頭追加・重複排除・上限制御・削除・クリアをサポートする。
 *
 * #1146 Phase 3 で全 caller (`useSearchHistory` / `useReadingHistory` /
 * `useFullTextSearch`) が `isValidElement` narrow 関数を渡す形に統一済。corrupted
 * localStorage 由来の `.push()` / `.filter()` で TypeError → ErrorBoundary 発火を構造的に
 * 予防 (`loadJsonArray` 経由 → invalid element は silent fallback で配列から排除)。
 */
export function useLocalStorageHistory<T>(
  storageKey: string,
  maxSize: number,
  initial: T[],
  isValidElement: (v: unknown) => v is T,
) {
  const [items, setItems] = useState<T[]>(() =>
    loadJsonArray<T>(storageKey, initial, isValidElement),
  );

  /**
   * 先頭に追加する。
   * @param item      追加するアイテム
   * @param dedupKey  重複判定キー（省略時は参照等価で dedup）
   */
  const prepend = useCallback(
    (item: T, dedupKey?: (i: T) => unknown) => {
      setItems((prev) => {
        const key = dedupKey ? dedupKey(item) : item;
        const without = prev.filter((i) => (dedupKey ? dedupKey(i) !== key : i !== item));
        const next = [item, ...without].slice(0, maxSize);
        saveJson(storageKey, next);
        return next;
      });
    },
    [storageKey, maxSize],
  );

  const remove = useCallback(
    (predicate: (item: T) => boolean) => {
      setItems((prev) => {
        const next = prev.filter((i) => !predicate(i));
        if (next.length === prev.length) return prev;
        saveJson(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const clear = useCallback(() => {
    setItems((prev) => {
      if (prev.length === 0) return prev;
      saveJson(storageKey, []);
      return [];
    });
  }, [storageKey]);

  const replace = useCallback(
    (nextItems: T[]) => {
      const next = nextItems.slice(0, maxSize);
      saveJson(storageKey, next);
      setItems(next);
    },
    [storageKey, maxSize],
  );

  return { items, prepend, remove, clear, replace };
}
