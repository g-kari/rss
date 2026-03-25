/**
 * localStorage キーの一元管理と安全なアクセスヘルパー
 *
 * すべての localStorage キー定数をここで定義し、
 * 読み書き時は必ず storageGet / storageSet / storageRemove を経由する。
 */

// ── キー定数 ──────────────────────────────────────────────────

export const STORAGE_KEYS = {
  READ_IDS: 'rss-read',
  BOOKMARK_IDS: 'rss-bookmarks',
  READING_LIST_IDS: 'rss-reading-list',
  PINNED_FEED_IDS: 'rss-pinned',
  LAYOUT: 'rss-layout',
  THEME: 'rss-theme',
  FONT_SIZE: 'rss-font-size',
  AI_MODE: 'rss-ai-mode',
  CONTENT_CACHE_PREFIX: 'rss-content:',
  AI_CACHE_PREFIX: 'rss-ai:',
  UNREAD_ONLY: 'rss-unread-only',
  BOOKMARK_ONLY: 'rss-bookmark-only',
  SORT_ORDER: 'rss-sort-order',
  DATE_RANGE: 'rss-date-range',
  OGP_CACHE: 'rss-ogp-cache',
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

// ── Set<string> ヘルパー ─────────────────────────────────────

/** JSON 配列として保存された Set<string> を読み込む */
export function loadSet(key: string): Set<string> {
  const stored = storageGet(key);
  try {
    return new Set(stored ? (JSON.parse(stored) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Set<string> を JSON 配列として保存する */
export function saveSet(key: string, ids: Set<string>): void {
  storageSet(key, JSON.stringify([...ids]));
}
