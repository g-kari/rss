import { loadJsonArray, saveJson, STORAGE_KEYS } from "./storage";
import type { SavedSearchJsonEntry } from "./export-json";
import { devError } from "./dev-log";

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  createdAt: string;
}

const MAX_SAVED = 20;
export const SAVED_SEARCH_STORAGE_ERROR =
  "検索条件を保存できませんでした。ブラウザーの保存領域を確認してから、もう一度操作してください。";

export function isSavedSearch(value: unknown): value is SavedSearch {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.name === "string" &&
    typeof entry.query === "string" &&
    typeof entry.createdAt === "string"
  );
}

export interface SavedSearchSnapshot {
  readonly items: readonly SavedSearch[];
  readonly error: string | null;
}

// One immutable snapshot per browser window, shared by the existing search bar
// and settings importer. No other local-history hook changes its ownership.
export function createSavedSearchStore(
  read: () => readonly SavedSearch[] = () =>
    loadJsonArray<SavedSearch>(STORAGE_KEYS.SAVED_SEARCHES, [], isSavedSearch),
  write: (items: readonly SavedSearch[]) => boolean = (items) =>
    saveJson(STORAGE_KEYS.SAVED_SEARCHES, items),
) {
  let snapshot: SavedSearchSnapshot | undefined;
  const listeners = new Set<() => void>();
  const freeze = (items: readonly SavedSearch[], error: string | null): SavedSearchSnapshot =>
    Object.freeze({
      items: Object.freeze(items.map((entry) => Object.freeze({ ...entry }))),
      error,
    });
  const getSnapshot = () => (snapshot ??= freeze(read(), null));
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const commit = (next: readonly SavedSearch[]) => {
    const previous = getSnapshot();
    const items = next.slice(0, MAX_SAVED);
    let persisted = false;
    try {
      persisted = write(items);
    } catch (error) {
      devError("[saved-search-store] persistence failed", error);
    }
    if (!persisted) {
      snapshot = Object.freeze({ items: previous.items, error: SAVED_SEARCH_STORAGE_ERROR });
      notify();
      return false;
    }
    snapshot = freeze(items, null);
    notify();
    return true;
  };
  return {
    getSnapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        // Reload persisted data after the last reader has left, including a
        // later remount. Failed writes never replace the persisted snapshot.
        if (listeners.size === 0) snapshot = undefined;
      };
    },
    save(name: string, query: string) {
      const trimmedName = name.trim();
      const trimmedQuery = query.trim();
      if (!trimmedName || !trimmedQuery) return false;
      const entry: SavedSearch = {
        id: crypto.randomUUID(),
        name: trimmedName,
        query: trimmedQuery,
        createdAt: new Date().toISOString(),
      };
      return commit([entry, ...getSnapshot().items.filter((item) => item.name !== trimmedName)]);
    },
    removeSaved(id: string) {
      const previous = getSnapshot().items;
      const next = previous.filter((item) => item.id !== id);
      return next.length === previous.length || commit(next);
    },
    importSaved(entries: readonly SavedSearchJsonEntry[]) {
      const names = new Set<string>();
      return commit(
        [...entries, ...getSnapshot().items].filter((entry) => {
          if (names.has(entry.name)) return false;
          names.add(entry.name);
          return true;
        }),
      );
    },
    clearSaved() {
      return getSnapshot().items.length === 0 || commit([]);
    },
  };
}

export type SavedSearchStore = ReturnType<typeof createSavedSearchStore>;
