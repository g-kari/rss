import { useSyncExternalStore } from "react";
import {
  createSavedSearchStore,
  type SavedSearchStore,
  type SavedSearchSnapshot,
} from "../lib/saved-search-store";

export type { SavedSearch } from "../lib/saved-search-store";

const EMPTY: SavedSearchSnapshot = Object.freeze({ items: Object.freeze([]), error: null });
const getServerSnapshot = () => EMPTY;
const serverStore = createSavedSearchStore(
  () => [],
  () => false,
);
const stores = new WeakMap<Window, SavedSearchStore>();

function getStore() {
  if (typeof window === "undefined") return serverStore;
  let store = stores.get(window);
  if (!store) {
    store = createSavedSearchStore();
    stores.set(window, store);
  }
  return store;
}

/** Shared browser-local saved searches, including other tabs; no server state or atomic transaction. */
export function useFullTextSearch() {
  const store = getStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
  return {
    savedSearches: snapshot.items,
    storageError: snapshot.error,
    save: store.save,
    removeSaved: store.removeSaved,
    importSaved: store.importSaved,
    clearSaved: store.clearSaved,
  };
}
