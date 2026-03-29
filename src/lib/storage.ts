/**
 * localStorage キーの一元管理と安全なアクセスヘルパー
 *
 * すべての localStorage キー定数をここで定義し、
 * 読み書き時は必ず storageGet / storageSet / storageRemove を経由する。
 */

// ── キー定数 ──────────────────────────────────────────────────

export const SPECIAL_FEED_IDS = {
  BOOKMARKS: "__bookmarks__",
  READING_LIST: "__reading_list__",
  LIKES: "__likes__",
  HISTORY: "__history__",
} as const;

export const STORAGE_KEYS = {
  READ_IDS: "rss-read",
  BOOKMARK_IDS: "rss-bookmarks",
  READING_LIST_IDS: "rss-reading-list",
  LIKE_IDS: "rss-likes",
  PINNED_FEED_IDS: "rss-pinned",
  LAYOUT: "rss-layout",
  THEME: "rss-theme",
  FONT_SIZE: "rss-font-size",
  CONTENT_CACHE_PREFIX: "rss-content:",
  AI_CACHE_PREFIX: "rss-ai:",
  UNREAD_ONLY: "rss-unread-only",
  BOOKMARK_ONLY: "rss-bookmark-only",
  READING_LIST_ONLY: "rss-reading-list-only",
  SORT_ORDER: "rss-sort-order",
  DATE_RANGE: "rss-date-range",
  OGP_CACHE: "rss-ogp-cache",
  SEARCH_HISTORY: "rss-search-history",
  HISTORY: "rss-history",
  NSFW_MODE: "rss-nsfw-mode",
  SIDEBAR_WIDTH: "rss-sidebar-width",
  LIST_WIDTH: "rss-list-width",
  DOWNLOADED_ARTICLE_IDS: "rss-downloaded-images",
  GLOBAL_FILTER: "rss-global-filter",
} as const;

// ── 低レベルラッパー ──────────────────────────────────────────

/** localStorage.getItem の安全なラッパー（例外を null に変換） */
export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** localStorage.setItem の安全なラッパー（容量超過時は無視） */
export function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage full — 無視 */
  }
}

/** localStorage.removeItem の安全なラッパー */
export function storageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * localStorage のキー一覧を返す。
 * prefix 指定時はそのプレフィックスで始まるキーのみ返す。
 */
export function storageListKeys(prefix?: string): string[] {
  try {
    const all = Object.keys(localStorage);
    return prefix ? all.filter((k) => k.startsWith(prefix)) : all;
  } catch {
    return [];
  }
}

// ── JSON ヘルパー ────────────────────────────────────────────

/**
 * JSON として保存された値を読み込む。
 * キーが存在しない・パース失敗時は fallback を返す。
 */
export function loadJson<T>(key: string, fallback: T): T {
  const stored = storageGet(key);
  try {
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** 値を JSON シリアライズして localStorage に保存する */
export function saveJson<T>(key: string, value: T): void {
  storageSet(key, JSON.stringify(value));
}

// ── Set<string> ヘルパー ─────────────────────────────────────

/** JSON 配列として保存された Set<string> を読み込む */
export function loadSet(key: string): Set<string> {
  return new Set(loadJson<string[]>(key, []));
}

/** Set<string> を JSON 配列として保存する */
export function saveSet(key: string, ids: Set<string>): void {
  storageSet(key, JSON.stringify([...ids]));
}

/** Set<string> の要素をトグル（追加/削除）して localStorage に保存する */
export function toggleSetItem(
  setState: (updater: (prev: Set<string>) => Set<string>) => void,
  storageKey: string,
  id: string,
): void {
  setState((prev) => {
    const next = new Set(prev);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    saveSet(storageKey, next);
    return next;
  });
}
