/**
 * localStorage キーの一元管理と安全なアクセスヘルパー
 *
 * すべての localStorage キー定数をここで定義し、
 * 読み書き時は必ず storageGet / storageSet / storageRemove を経由する。
 */

import type { FeedView } from "../types";
import { devError } from "./dev-log";

// ── キー定数 ──────────────────────────────────────────────────

export const SPECIAL_FEED_IDS = {
  BOOKMARKS: "__bookmarks__",
  READING_LIST: "__reading_list__",
  LIKES: "__likes__",
  HISTORY: "__history__",
  DIGEST: "__digest__",
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
  FONT_FAMILY: "rss-font-family",
  CONTENT_CACHE_PREFIX: "rss-content:",
  AI_CACHE_PREFIX: "rss-ai:",
  AI_TRANSLATE_CACHE_PREFIX: "rss-ai-translate:",
  UNREAD_ONLY: "rss-unread-only",
  BOOKMARK_ONLY: "rss-bookmark-only",
  READING_LIST_ONLY: "rss-reading-list-only",
  LIKE_ONLY: "rss-like-only",
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
  READ_BEFORE_TIMESTAMP: "rss-read-before-ts",
  SNOOZED_UNTIL: "rss-snoozed",
  NOTES: "rss-notes",
  TAGS: "rss-tags",
  TAG_ONLY: "rss-tag-only",
  READING_TIME_RANGE: "rss-reading-time-range",
  NOTE_ONLY: "rss-note-only",
  CACHED_USER: "rss-cached-user",
  COLLAPSED_CATEGORIES: "rss-collapsed-cats",
  WEEKLY_GOAL: "rss-weekly-goal",
  SCROLL_POSITIONS: "rss-scroll-positions",
  TTS_RATE: "tts-rate",
  TTS_VOICE_URI: "rss-tts-voice-uri",
  TTS_VOLUME: "rss-tts-volume",
  TTS_ENGINE: "rss-tts-engine",
  OBSIDIAN_VAULT: "rss-obsidian-vault",
  LINE_HEIGHT: "rss-line-height",
  CONTENT_WIDTH: "rss-content-width",
  TEXT_JUSTIFY: "rss-text-justify",
  READING_PROGRESS_PREFIX: "rss-reading-progress:",
  DIGEST_MODE: "rss-digest-mode",
  AUTO_READ_ENABLED: "rss-auto-read-enabled",
  AUTO_READ_MODE_STATE: "rss-auto-read-mode-state",
  AUTO_READ_THRESHOLD: "rss-auto-read-threshold",
  AUTO_TRANSLATE: "rss-auto-translate",
  AUTO_SUMMARIZE: "rss-auto-summarize",
  AUTO_AI_BROWSER_ONLY: "rss-auto-ai-browser-only",
  GALLERY_AUTO_SCROLL_SPEED: "rss-gallery-autoscroll-speed",
  ACTIVE_FEED_VIEW: "rss-active-feed-view",
  SAVED_SEARCHES: "rss-saved-searches",
  GALLERY_COLUMNS: "rss-gallery-columns",
  GALLERY_COLUMNS_FOCUS: "rss-gallery-columns-focus",
  GALLERY_CARD_SIZE: "rss-gallery-card-size",
  GALLERY_MIN_IMAGE_FILTER: "rss-gallery-min-image-filter",
  /** #714 関連: ギャラリー 1 ページの記事件数 (useArticlePagination の chunk サイズ) */
  GALLERY_PAGE_SIZE: "rss-gallery-page-size",
  BEACON_OVERFLOW: "rss-beacon-overflow",
  TTL_DAYS: "rss-ttl-days",
  DEDUP_BY_LINK: "rss-dedup-by-link",
  IMAGE_DL_FOLDER: "rss-image-dl-folder",
  IMAGE_DL_FOLDER_NSFW: "rss-image-dl-folder-nsfw",
  DOWNLOADED_IMAGE_URLS: "rss-downloaded-image-urls",
  AI_MODEL: "rss-ai-model",
  HEADER_SHARE_TARGETS: "rss-header-share-targets",
  ARTICLE_DETAIL_OVERLAY_WIDTH: "rss-article-detail-overlay-width",
  /** #874 候補 1: コレクションサイドバーの並び順設定 */
  COLLECTION_SORT_BY: "rss-collection-sort-by",
  /** Theme preset (theme + font + lineHeight + contentWidth の組み合わせ保存、案 B localStorage) */
  THEME_PRESETS: "rss-theme-presets",
} as const;

/**
 * feedView 別に独立した localStorage キーを生成する。
 *
 * - `articles` ビューはサフィックスなし（既存キー）。後方互換のため移行不要。
 * - `pictures` / `videos` / `social` ビューは `${baseKey}:${feedView}` で分離。
 */
export function getFeedViewStorageKey(baseKey: string, feedView: FeedView): string {
  return feedView === "articles" ? baseKey : `${baseKey}:${feedView}`;
}

// ── 低レベルラッパー ──────────────────────────────────────────

/** localStorage.getItem の安全なラッパー（例外を null に変換） */
export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    devError("[storage] localStorage.getItem failed", { key, err });
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

// ── Deferred Save（バッチ化された非同期 localStorage 書き込み）────
const pendingSaves = new Map<string, Set<string>>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function runPendingSaves(): void {
  saveTimer = undefined;
  for (const [key, ids] of pendingSaves) saveSet(key, ids);
  pendingSaves.clear();
}

/** saveSet を setTimeout(0) に遅延し、同一ティック内の複数書き込みを 1 回に合成する */
export function deferSaveSet(key: string, ids: Set<string>): void {
  pendingSaves.set(key, ids);
  if (saveTimer == null) saveTimer = setTimeout(runPendingSaves, 0);
}

/** 未フラッシュの deferred save を即時実行する（beforeunload 用） */
export function flushDeferredSaves(): void {
  if (saveTimer != null) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  if (pendingSaves.size === 0) return;
  for (const [key, ids] of pendingSaves) saveSet(key, ids);
  pendingSaves.clear();
}

/**
 * localStorage に保存された文字列を列挙型として読み込む。
 * 保存値が valid に含まれない場合は fallback を返す。
 */
export function loadStoredEnum<T extends string>(key: string, valid: readonly T[], fallback: T): T {
  const stored = storageGet(key);
  return valid.includes(stored as T) ? (stored as T) : fallback;
}

/**
 * Set<string> の要素をトグル（追加/削除）して localStorage に保存する。
 *
 * `defer` のデフォルトは true（setTimeout(0) で永続化を遅延）。React の state updater 内で
 * 同期 saveSet を呼ぶと毎回 JSON.stringify + ディスク I/O が走り、大きな ID 配列
 * （readIds 等）でホットパスに数十 ms のスパイクが入る。デフォルト遅延化で
 * 呼び出し側が意識せずとも安全な挙動になる（即時永続化が必要な箇所のみ
 * 明示的に `defer=false` を渡す）。
 */
export function toggleSetItem(
  setState: (updater: (prev: Set<string>) => Set<string>) => void,
  storageKey: string,
  id: string,
  defer = true,
): void {
  setState((prev) => {
    const next = new Set(prev);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    if (defer) deferSaveSet(storageKey, next);
    else saveSet(storageKey, next);
    return next;
  });
}
