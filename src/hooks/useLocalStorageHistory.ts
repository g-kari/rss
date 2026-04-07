"use client";

import { useState, useCallback } from "react";
import { loadJson, saveJson } from "../lib/storage";

/**
 * localStorage に配列を永続化する汎用フック。
 * 先頭追加・重複排除・上限制御・削除・クリアをサポートする。
 */
export function useLocalStorageHistory<T>(storageKey: string, maxSize: number, initial: T[] = []) {
  const [items, setItems] = useState<T[]>(() => loadJson<T[]>(storageKey, initial));

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

  /** predicate が true のアイテムを削除する */
  const remove = useCallback(
    (predicate: (item: T) => boolean) => {
      setItems((prev) => {
        const next = prev.filter((i) => !predicate(i));
        saveJson(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  /** 全件クリアする */
  const clear = useCallback(() => {
    setItems([]);
    saveJson(storageKey, []);
  }, [storageKey]);

  return { items, prepend, remove, clear };
}
