"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Article, UserProfile } from "../types";
import { STORAGE_KEYS, SPECIAL_FEED_IDS, saveSet, loadSet, toggleSetItem } from "../lib/storage";
import { apiFetch } from "../lib/api-fetch";

type ReadStateSets = {
  read: Set<string>;
  bookmarks: Set<string>;
  readingList: Set<string>;
  likes: Set<string>;
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

async function fetchReadState(): Promise<{
  readIds: string[];
  bookmarkIds: string[];
  readingListIds: string[];
  likeIds: string[];
} | null> {
  try {
    const res = await apiFetch("/api/read-state");
    if (!res.ok) return null;
    return res.json() as Promise<{
      readIds: string[];
      bookmarkIds: string[];
      readingListIds: string[];
      likeIds: string[];
    }>;
  } catch {
    return null;
  }
}

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

/** ReadStateSets を /api/read-state に POST する JSON 文字列にシリアライズする */
function serializeReadState(sets: ReadStateSets): string {
  return JSON.stringify({
    readIds: [...sets.read],
    bookmarkIds: [...sets.bookmarks],
    readingListIds: [...sets.readingList],
    likeIds: [...sets.likes],
  });
}

async function saveReadState(sets: ReadStateSets): Promise<void> {
  try {
    await apiFetch("/api/read-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: serializeReadState(sets),
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
  markRead: (articleId: string) => void;
  markAllRead: (feedId: string | null) => void;
  toggleRead: (articleId: string) => void;
  toggleBookmark: (articleId: string) => void;
  toggleReadingList: (articleId: string) => void;
  toggleLike: (articleId: string) => void;
}

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

  // 4つのセットをまとめて保持する ref（デバウンス送信・クロージャ内で使用）
  const stateRef = useRef<ReadStateSets>({
    read: readIds,
    bookmarks: bookmarkIds,
    readingList: readingListIds,
    likes: likeIds,
  });
  const historyIdsRef = useRef(historyIds);
  historyIdsRef.current = historyIds;
  const articlesRef = useRef(articles);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // useEffect 不要 — レンダー中の直接代入で十分
  stateRef.current = {
    read: readIds,
    bookmarks: bookmarkIds,
    readingList: readingListIds,
    likes: likeIds,
  };
  articlesRef.current = articles;

  // ログイン後にサーバーの既読・ブックマーク・後で読む状態をマージ
  useEffect(() => {
    if (!user) return;
    fetchReadState().then((state) => {
      if (!state) return;
      mergeServerSet(setReadIds, STORAGE_KEYS.READ_IDS, state.readIds ?? []);
      mergeServerSet(setBookmarkIds, STORAGE_KEYS.BOOKMARK_IDS, state.bookmarkIds ?? []);
      mergeServerSet(setReadingListIds, STORAGE_KEYS.READING_LIST_IDS, state.readingListIds ?? []);
      mergeServerSet(setLikeIds, STORAGE_KEYS.LIKE_IDS, state.likeIds ?? []);
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
      if (!flushIfPending()) return;
      navigator.sendBeacon(
        "/api/read-state",
        new Blob([serializeReadState(stateRef.current)], { type: "application/json" }),
      );
    }
    function onVisibilityChange() {
      if (document.visibilityState !== "hidden") return;
      if (!flushIfPending()) return;
      saveReadState(stateRef.current);
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
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      saveReadState(stateRef.current);
    }, 2000);
  }, []);

  const markRead = useCallback(
    (articleId: string) => {
      setReadIds((prev) => {
        const next = new Set(prev).add(articleId);
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
        let ids: string[];
        if (feedId === SPECIAL_FEED_IDS.BOOKMARKS) {
          ids = arts.filter((a) => bookmarks.has(a.id)).map((a) => a.id);
        } else if (feedId === SPECIAL_FEED_IDS.READING_LIST) {
          ids = arts.filter((a) => readingList.has(a.id)).map((a) => a.id);
        } else if (feedId === SPECIAL_FEED_IDS.LIKES) {
          ids = arts.filter((a) => likes.has(a.id)).map((a) => a.id);
        } else if (feedId === SPECIAL_FEED_IDS.HISTORY) {
          const hIds = historyIdsRef.current;
          ids = hIds ? arts.filter((a) => hIds.has(a.id)).map((a) => a.id) : [];
        } else if (feedId) {
          ids = arts.filter((a) => a.feedHash === feedId).map((a) => a.id);
        } else {
          ids = arts.map((a) => a.id);
        }
        const next = new Set([...prev, ...ids]);
        saveSet(STORAGE_KEYS.READ_IDS, next);
        return next;
      });
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

  return {
    readIds,
    bookmarkIds,
    readingListIds,
    likeIds,
    markRead,
    markAllRead,
    toggleRead,
    toggleBookmark,
    toggleReadingList,
    toggleLike,
  };
}
