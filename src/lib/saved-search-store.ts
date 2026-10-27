import { saveJson, storageRead, STORAGE_KEYS } from "./storage";
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
export const SAVED_SEARCH_READ_ERROR =
  "保存済みの検索条件を確認できませんでした。保存領域の制限やデータを確認してから、もう一度操作してください。上書きはしていません。";

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

class InvalidSavedSearchRead extends Error {
  constructor(readonly readableItems: readonly SavedSearch[]) {
    super("Invalid saved-search storage");
  }
}

function readPersisted(): readonly SavedSearch[] {
  const result = storageRead(STORAGE_KEYS.SAVED_SEARCHES);
  if (!result.ok) throw new Error("Saved-search storage is unavailable");
  if (result.value === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.value);
  } catch {
    throw new Error("Invalid saved-search storage");
  }
  // A partially corrupted list is unknown data, not an empty/filtered list to overwrite.
  if (!Array.isArray(parsed)) throw new InvalidSavedSearchRead([]);
  if (!parsed.every(isSavedSearch)) throw new InvalidSavedSearchRead(parsed.filter(isSavedSearch));
  return parsed;
}

function subscribeStorage(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEYS.SAVED_SEARCHES && event.key !== null) return;
    try {
      if (event.storageArea !== window.localStorage) return;
    } catch {
      // Refresh reports a denied read without trusting an event's payload.
    }
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

export interface SavedSearchSnapshot {
  readonly items: readonly SavedSearch[];
  readonly error: string | null;
}

function equalItems(left: readonly SavedSearch[], right: readonly SavedSearch[]) {
  return (
    left.length === right.length &&
    left.every((item, index) => {
      const other = right[index];
      return (
        item.id === other.id &&
        item.name === other.name &&
        item.query === other.query &&
        item.createdAt === other.createdAt
      );
    })
  );
}

// One immutable snapshot per window, refreshed from this origin's existing browser storage.
// Read-before-write narrows stale-tab loss; localStorage is NOT an atomic cross-tab transaction.
export function createSavedSearchStore(
  read: () => readonly SavedSearch[] = readPersisted,
  write: (items: readonly SavedSearch[]) => boolean = (items) =>
    saveJson(STORAGE_KEYS.SAVED_SEARCHES, items),
  subscribeExternal: (listener: () => void) => () => void = subscribeStorage,
) {
  let snapshot: SavedSearchSnapshot | undefined;
  let unsubscribeExternal: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const replace = (items: readonly SavedSearch[], error: string | null) => {
    const sameItems = snapshot && equalItems(snapshot.items, items);
    if (sameItems && snapshot?.error === error) return false;
    snapshot = Object.freeze({
      items: sameItems
        ? snapshot!.items
        : Object.freeze(items.map((entry) => Object.freeze({ ...entry }))),
      error,
    });
    return true;
  };
  const getSnapshot = (): SavedSearchSnapshot => {
    if (!snapshot) {
      try {
        replace(read(), null);
      } catch (error) {
        // Preserve the old defensive display of readable legacy entries, but
        // never write a filtered list over unrecognized persisted entries.
        replace(
          error instanceof InvalidSavedSearchRead ? error.readableItems : [],
          SAVED_SEARCH_READ_ERROR,
        );
      }
    }
    return snapshot!;
  };
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const publish = (items: readonly SavedSearch[], error: string | null) => {
    if (replace(items, error)) notify();
  };
  const refresh = () => {
    try {
      // An unrelated external change cannot turn a failed local save into success.
      publish(
        read(),
        snapshot?.error === SAVED_SEARCH_STORAGE_ERROR ? SAVED_SEARCH_STORAGE_ERROR : null,
      );
    } catch {
      publish(getSnapshot().items, SAVED_SEARCH_READ_ERROR);
    }
  };
  const update = (
    transform: (current: readonly SavedSearch[]) => readonly SavedSearch[] | null,
  ) => {
    let current: readonly SavedSearch[];
    try {
      current = read();
    } catch {
      publish(getSnapshot().items, SAVED_SEARCH_READ_ERROR);
      return false;
    }
    const next = transform(current);
    if (next === null) {
      publish(current, null);
      return true;
    }
    const items = next.slice(0, MAX_SAVED);
    let persisted = false;
    try {
      persisted = write(items);
    } catch {
      devError("[saved-search-store] persistence failed");
    }
    if (!persisted) {
      publish(current, SAVED_SEARCH_STORAGE_ERROR);
      return false;
    }
    publish(items, null);
    return true;
  };
  return {
    getSnapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        unsubscribeExternal = subscribeExternal(refresh);
        // Cover the getSnapshot-to-subscribe gap without writing or moving focus.
        refresh();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          unsubscribeExternal?.();
          unsubscribeExternal = undefined;
          snapshot = undefined;
        }
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
      return update((current) => [entry, ...current.filter((item) => item.name !== trimmedName)]);
    },
    removeSaved(id: string) {
      return update((current) =>
        current.some((item) => item.id === id) ? current.filter((item) => item.id !== id) : null,
      );
    },
    importSaved(entries: readonly SavedSearchJsonEntry[]) {
      return update((current) => {
        const names = new Set<string>();
        return [...entries, ...current].filter((entry) => {
          if (names.has(entry.name)) return false;
          names.add(entry.name);
          return true;
        });
      });
    },
    clearSaved() {
      return update((current) => (current.length === 0 ? null : []));
    },
  };
}

export type SavedSearchStore = ReturnType<typeof createSavedSearchStore>;
