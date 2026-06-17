import { useCallback } from "react";
import { STORAGE_KEYS } from "../lib/storage";
import { useLocalStorageHistory } from "./useLocalStorageHistory";

const MAX_SAVED = 20;

export interface SavedSearch {
  /** 安定 ID (crypto.randomUUID) */
  id: string;
  /** 表示名（ユーザー入力） */
  name: string;
  /** 検索クエリ文字列（高度クエリ構文を含む） */
  query: string;
  /** 保存日時 (ISO 8601) */
  createdAt: string;
}

/**
 * 全フィード横断のフルテキスト検索 — 保存検索条件管理 (Issue #102)。
 *
 * - localStorage に保存して再ログイン後も維持
 * - 同名で保存すると上書き（先頭に移動）
 * - 上限 MAX_SAVED 件
 *
 * 検索式自体のパース・評価は `src/lib/full-text-search.ts` を参照。
 */
export function useFullTextSearch() {
  const {
    items: savedSearches,
    prepend,
    remove,
    clear,
  } = useLocalStorageHistory<SavedSearch>(
    STORAGE_KEYS.SAVED_SEARCHES,
    MAX_SAVED,
    [],
    (v): v is SavedSearch => {
      if (typeof v !== "object" || v === null) return false;
      const s = v as Record<string, unknown>;
      return (
        typeof s.id === "string" &&
        typeof s.name === "string" &&
        typeof s.query === "string" &&
        typeof s.createdAt === "string"
      );
    },
  );

  const save = useCallback(
    (name: string, query: string) => {
      const trimmedName = name.trim();
      const trimmedQuery = query.trim();
      if (!trimmedName || !trimmedQuery) return;
      const entry: SavedSearch = {
        id: crypto.randomUUID(),
        name: trimmedName,
        query: trimmedQuery,
        createdAt: new Date().toISOString(),
      };
      // 同名は上書き (= 既存を消して先頭に追加)
      prepend(entry, (s) => s.name);
    },
    [prepend],
  );

  const removeSaved = useCallback(
    (id: string) => {
      remove((s) => s.id === id);
    },
    [remove],
  );

  return { savedSearches, save, removeSaved, clearSaved: clear };
}
