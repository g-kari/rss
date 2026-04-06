"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Article, KeywordFilter, UserProfile, ReadState } from "../types";
import { useSyncedRef } from "./useSyncedRef";
import {
  STORAGE_KEYS,
  SPECIAL_FEED_IDS,
  saveSet,
  loadSet,
  toggleSetItem,
  loadJson,
  saveJson,
  storageGet,
  storageSet,
} from "../lib/storage";
import { apiFetch } from "../lib/api-fetch";

type ReadStateSets = {
  read: Set<string>;
  bookmarks: Set<string>;
  readingList: Set<string>;
  likes: Set<string>;
  readBeforeTimestamp: string | null;
  snoozedUntil: Record<string, string>;
};

/** サーバーから取得した配列を既存 Set にマージして localStorage を更新する */
function mergeServerSet(
  setState: (updater: (prev: Set<string>) => Set<string>) => void,
  storageKey: string,
  serverValues: string[],
): void {
  setState((prev) => {
    const merged = new Set([...prev, ...serverValues]);
    saveSet(storageKey, merged);
    return merged;
  });
}

/** /api/read-state から既読状態を取得する。失敗時は null を返す */
async function fetchReadState(): Promise<ReadState | null> {
  try {
    const res = await apiFetch("/api/read-state");
    if (!res.ok) return null;
    return res.json() as Promise<ReadState>;
  } catch {
    return null;
  }
}

/**
 * Set 型の状態をトグルするコールバックを生成する。
 * ID を localStorage の `key` に保存し、`schedule` で非同期サーバー同期をスケジュールする。
 */
function makeToggle(
  setter: React.Dispatch<React.SetStateAction<Set<string>>>,
  key: string,
  schedule: () => void,
): (id: string) => void {
  return (id) => {
    toggleSetItem(setter, key, id);
    schedule();
  };
}

/** 期限切れスヌーズを除去して Record<string, string> を返す */
function pruneExpiredSnoozes(snoozed: Record<string, string>): Record<string, string> {
  const now = new Date().toISOString();
  const result: Record<string, string> = {};
  for (const [id, until] of Object.entries(snoozed)) {
    if (until > now) result[id] = until;
  }
  return result;
}

/** ReadStateSets + globalFilter を /api/read-state に POST する JSON 文字列にシリアライズする */
function serializeReadState(sets: ReadStateSets, globalFilter: KeywordFilter | null): string {
  const pruned = pruneExpiredSnoozes(sets.snoozedUntil);
  return JSON.stringify({
    readIds: [...sets.read],
    bookmarkIds: [...sets.bookmarks],
    readingListIds: [...sets.readingList],
    likeIds: [...sets.likes],
    globalFilter,
    readBeforeTimestamp: sets.readBeforeTimestamp,
    snoozedUntil: Object.keys(pruned).length > 0 ? pruned : null,
  });
}

/**
 * 既読・ブックマーク・後で読む・いいね・グローバルフィルター状態をサーバーに保存する。
 * 通信失敗は無視する（localStorage への保存は呼び出し側で完了済みのため）。
 */
async function saveReadState(
  sets: ReadStateSets,
  globalFilter: KeywordFilter | null,
): Promise<void> {
  try {
    await apiFetch("/api/read-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: serializeReadState(sets, globalFilter),
    });
  } catch {
    // サーバー同期失敗は無視（localStorage は保存済み）
  }
}

interface ReadStateResult {
  readIds: Set<string>;
  bookmarkIds: Set<string>;
  readingListIds: Set<string>;
  likeIds: Set<string>;
  globalFilter: KeywordFilter | null;
  setGlobalFilter: (filter: KeywordFilter | null) => void;
  readBeforeTimestamp: string | null;
  snoozedUntil: Record<string, string>;
  markRead: (articleId: string) => void;
  markBulkRead: (articleIds: string[]) => void;
  markAllRead: (feedId: string | null) => void;
  toggleRead: (articleId: string) => void;
  toggleBookmark: (articleId: string) => void;
  toggleReadingList: (articleId: string) => void;
  toggleLike: (articleId: string) => void;
  snoozeArticle: (articleId: string, durationMs: number) => void;
}

/**
 * ユーザーの既読・ブックマーク・後で読む・いいね状態を管理するフック。
 *
 * ## 状態管理
 * - 初期値は localStorage から即時ロード（オフライン対応）
 * - 状態変更は localStorage に即座に反映し、5 秒のデバウンス後にサーバーへ同期
 * - ページ離脱時（`beforeunload`）は `sendBeacon` で確実に送信
 * - タブ非表示から復帰時（`visibilitychange`）にも同期を試みる
 *
 * ## サーバー同期
 * ログイン後に `/api/read-state` (GET) でサーバーデータをローカルにマージ（ローカル ∪ サーバー）。
 * `globalFilter` と `readBeforeTimestamp` はサーバー値を優先（クロスデバイス同期）。
 *
 * @param user - 認証ユーザー（null / undefined でサーバー同期を行わない）
 * @param articles - 現在表示中の記事リスト（`markAllRead` で参照）
 * @param historyIds - 閲覧履歴 ID セット（`markAllRead` の HISTORY フィード判定に使用）
 */
export function useReadState(
  user: UserProfile | null | undefined,
  articles: Article[],
  historyIds?: Set<string>,
): ReadStateResult {
  const [readIds, setReadIds] = useState<Set<string>>(() => loadSet(STORAGE_KEYS.READ_IDS));
  const [bookmarkIds, setBookmarkIds] = useState<Set<string>>(() =>
    loadSet(STORAGE_KEYS.BOOKMARK_IDS),
  );
  const [readingListIds, setReadingListIds] = useState<Set<string>>(() =>
    loadSet(STORAGE_KEYS.READING_LIST_IDS),
  );
  const [likeIds, setLikeIds] = useState<Set<string>>(() => loadSet(STORAGE_KEYS.LIKE_IDS));
  const [globalFilter, setGlobalFilterState] = useState<KeywordFilter | null>(() =>
    loadJson<KeywordFilter | null>(STORAGE_KEYS.GLOBAL_FILTER, null),
  );
  const globalFilterRef = useSyncedRef<KeywordFilter | null>(globalFilter);
  const userRef = useSyncedRef(user);
  const [readBeforeTimestamp, setReadBeforeTimestamp] = useState<string | null>(() =>
    storageGet(STORAGE_KEYS.READ_BEFORE_TIMESTAMP),
  );
  const [snoozedUntil, setSnoozedUntil] = useState<Record<string, string>>(() =>
    pruneExpiredSnoozes(loadJson<Record<string, string>>(STORAGE_KEYS.SNOOZED_UNTIL, {})),
  );

  // 4つのセットをまとめて保持する ref（デバウンス送信・クロージャ内で使用）
  const stateRef = useRef<ReadStateSets>({
    read: readIds,
    bookmarks: bookmarkIds,
    readingList: readingListIds,
    likes: likeIds,
    readBeforeTimestamp,
    snoozedUntil,
  });
  const historyIdsRef = useSyncedRef(historyIds);
  const articlesRef = useSyncedRef(articles);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);

  // useEffect 不要 — レンダー中の直接代入で十分
  stateRef.current = {
    read: readIds,
    bookmarks: bookmarkIds,
    readingList: readingListIds,
    likes: likeIds,
    readBeforeTimestamp,
    snoozedUntil,
  };

  // ログイン後にサーバーの既読・ブックマーク・後で読む・グローバルフィルター状態をマージ
  useEffect(() => {
    if (!user) return;
    fetchReadState().then((state) => {
      if (!state) return;
      mergeServerSet(setReadIds, STORAGE_KEYS.READ_IDS, state.readIds);
      mergeServerSet(setBookmarkIds, STORAGE_KEYS.BOOKMARK_IDS, state.bookmarkIds);
      mergeServerSet(setReadingListIds, STORAGE_KEYS.READING_LIST_IDS, state.readingListIds);
      mergeServerSet(setLikeIds, STORAGE_KEYS.LIKE_IDS, state.likeIds);
      // globalFilter はサーバー値を優先（クロスデバイス同期）
      if ("globalFilter" in state) {
        const serverFilter = state.globalFilter ?? null;
        saveJson(STORAGE_KEYS.GLOBAL_FILTER, serverFilter);
        setGlobalFilterState(serverFilter);
      }
      // readBeforeTimestamp はサーバー値と比較して新しい方を使う（クロスデバイス同期）
      if ("readBeforeTimestamp" in state && state.readBeforeTimestamp) {
        setReadBeforeTimestamp((prev) => {
          const server = state.readBeforeTimestamp!;
          const next = !prev || server > prev ? server : prev;
          if (next !== prev) storageSet(STORAGE_KEYS.READ_BEFORE_TIMESTAMP, next);
          return next;
        });
      }
      // snoozedUntil はサーバー値とローカル値をマージ（期限切れは除去）
      if ("snoozedUntil" in state && state.snoozedUntil) {
        setSnoozedUntil((prev) => {
          const merged = pruneExpiredSnoozes({ ...state.snoozedUntil!, ...prev });
          saveJson(STORAGE_KEYS.SNOOZED_UNTIL, merged);
          return merged;
        });
      }
    });
  }, [user]);

  // ページを閉じる前・タブ非表示時にデバウンス待ちのデータを即時送信
  // - beforeunload: ページ閉じ・遷移時。fetch は中断されるため sendBeacon を使用
  // - visibilitychange: タブ切り替え時。fetch を使用（beforeunload が発火しないケースを補完）
  useEffect(() => {
    function flushIfPending(): boolean {
      if (syncTimerRef.current === null) return false;
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
      return true;
    }
    function onBeforeUnload() {
      if (!userRef.current) return;
      if (!flushIfPending()) return;
      navigator.sendBeacon(
        "/api/read-state",
        new Blob([serializeReadState(stateRef.current, globalFilterRef.current)], {
          type: "application/json",
        }),
      );
    }
    function onVisibilityChange() {
      if (document.visibilityState !== "hidden") return;
      if (!userRef.current) return;
      if (!flushIfPending()) return;
      saveReadState(stateRef.current, globalFilterRef.current);
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, []);

  const scheduleSyncToServer = useCallback(() => {
    isDirtyRef.current = true;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      if (!isDirtyRef.current) return;
      isDirtyRef.current = false;
      saveReadState(stateRef.current, globalFilterRef.current);
    }, 5000);
  }, []);

  const markRead = useCallback(
    (articleId: string) => {
      setReadIds((prev) => {
        if (prev.has(articleId)) return prev;
        const next = new Set(prev);
        next.add(articleId);
        saveSet(STORAGE_KEYS.READ_IDS, next);
        return next;
      });
      scheduleSyncToServer();
    },
    [scheduleSyncToServer],
  );

  const markBulkRead = useCallback(
    (articleIds: string[]) => {
      setReadIds((prev) => {
        const newIds = articleIds.filter((id) => !prev.has(id));
        if (newIds.length === 0) return prev;
        const next = new Set([...prev, ...newIds]);
        saveSet(STORAGE_KEYS.READ_IDS, next);
        return next;
      });
      scheduleSyncToServer();
    },
    [scheduleSyncToServer],
  );

  const markAllRead = useCallback(
    (feedId: string | null) => {
      setReadIds((prev) => {
        const arts = articlesRef.current;
        const { bookmarks, readingList, likes } = stateRef.current;
        const specialSets: Partial<Record<string, Set<string>>> = {
          [SPECIAL_FEED_IDS.BOOKMARKS]: bookmarks,
          [SPECIAL_FEED_IDS.READING_LIST]: readingList,
          [SPECIAL_FEED_IDS.LIKES]: likes,
          [SPECIAL_FEED_IDS.HISTORY]: historyIdsRef.current ?? new Set<string>(),
        };
        const specialSet = feedId ? (specialSets[feedId] ?? null) : null;
        const ids =
          specialSet !== null
            ? arts.filter((a) => specialSet.has(a.id)).map((a) => a.id)
            : feedId
              ? arts.filter((a) => a.feedHash === feedId).map((a) => a.id)
              : arts.map((a) => a.id);
        const next = new Set([...prev, ...ids]);
        saveSet(STORAGE_KEYS.READ_IDS, next);
        return next;
      });
      // 全フィード「全既読」の場合は readBeforeTimestamp を現在時刻に設定する。
      // これにより、まだロードされていないサーバー側の古い記事も既読扱いになる。
      if (!feedId) {
        const now = new Date().toISOString();
        setReadBeforeTimestamp((prev) => {
          const next = !prev || now > prev ? now : prev;
          storageSet(STORAGE_KEYS.READ_BEFORE_TIMESTAMP, next);
          return next;
        });
      }
      scheduleSyncToServer();
    },
    [scheduleSyncToServer],
  );

  const { toggleRead, toggleBookmark, toggleReadingList, toggleLike } = useMemo(
    () => ({
      toggleRead: makeToggle(setReadIds, STORAGE_KEYS.READ_IDS, scheduleSyncToServer),
      toggleBookmark: makeToggle(setBookmarkIds, STORAGE_KEYS.BOOKMARK_IDS, scheduleSyncToServer),
      toggleReadingList: makeToggle(
        setReadingListIds,
        STORAGE_KEYS.READING_LIST_IDS,
        scheduleSyncToServer,
      ),
      toggleLike: makeToggle(setLikeIds, STORAGE_KEYS.LIKE_IDS, scheduleSyncToServer),
    }),
    [scheduleSyncToServer],
  );

  const setGlobalFilter = useCallback(
    (filter: KeywordFilter | null) => {
      saveJson(STORAGE_KEYS.GLOBAL_FILTER, filter);
      setGlobalFilterState(filter);
      scheduleSyncToServer();
    },
    [scheduleSyncToServer],
  );

  const snoozeArticle = useCallback(
    (articleId: string, durationMs: number) => {
      const until = new Date(Date.now() + durationMs).toISOString();
      setSnoozedUntil((prev) => {
        const next = pruneExpiredSnoozes({ ...prev, [articleId]: until });
        saveJson(STORAGE_KEYS.SNOOZED_UNTIL, next);
        return next;
      });
      scheduleSyncToServer();
    },
    [scheduleSyncToServer],
  );

  return {
    readIds,
    bookmarkIds,
    readingListIds,
    likeIds,
    globalFilter,
    setGlobalFilter,
    readBeforeTimestamp,
    snoozedUntil,
    markRead,
    markBulkRead,
    markAllRead,
    toggleRead,
    toggleBookmark,
    toggleReadingList,
    toggleLike,
    snoozeArticle,
  };
}
