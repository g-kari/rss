'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Article, UserProfile } from '../types';
import { STORAGE_KEYS, saveSet, loadSet } from '../lib/storage';

/** Set<string> state の toggle（追加/削除）+ localStorage 保存の内部ヘルパー */
function toggleSetItem(
  setState: (updater: (prev: Set<string>) => Set<string>) => void,
  storageKey: string,
  id: string,
): void {
  setState((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    saveSet(storageKey, next);
    return next;
  });
}

async function fetchReadState(): Promise<{
  readIds: string[];
  bookmarkIds: string[];
  readingListIds: string[];
} | null> {
  try {
    const res = await fetch('/api/read-state');
    if (!res.ok) return null;
    return res.json() as Promise<{
      readIds: string[];
      bookmarkIds: string[];
      readingListIds: string[];
    }>;
  } catch {
    return null;
  }
}

async function saveReadState(
  readIds: Set<string>,
  bookmarkIds: Set<string>,
  readingListIds: Set<string>,
): Promise<void> {
  try {
    await fetch('/api/read-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        readIds: [...readIds],
        bookmarkIds: [...bookmarkIds],
        readingListIds: [...readingListIds],
      }),
    });
  } catch {
    // サーバー同期失敗は無視（localStorage は保存済み）
  }
}

interface ReadStateResult {
  readIds: Set<string>;
  bookmarkIds: Set<string>;
  readingListIds: Set<string>;
  markRead: (articleId: string) => void;
  markAllRead: (feedId: string | null) => void;
  toggleRead: (articleId: string) => void;
  toggleBookmark: (articleId: string) => void;
  toggleReadingList: (articleId: string) => void;
}

export function useReadState(
  user: UserProfile | null | undefined,
  articles: Article[],
): ReadStateResult {
  const [readIds, setReadIds] = useState<Set<string>>(() => loadSet(STORAGE_KEYS.READ_IDS));
  const [bookmarkIds, setBookmarkIds] = useState<Set<string>>(() =>
    loadSet(STORAGE_KEYS.BOOKMARK_IDS),
  );
  const [readingListIds, setReadingListIds] = useState<Set<string>>(() =>
    loadSet(STORAGE_KEYS.READING_LIST_IDS),
  );

  // 最新の値を保持する ref（デバウンス送信・クロージャ内で使用）
  const localReadRef = useRef(readIds);
  const localBookmarkRef = useRef(bookmarkIds);
  const localReadingListRef = useRef(readingListIds);
  const articlesRef = useRef(articles);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ログイン後にサーバーの既読・ブックマーク・後で読む状態をマージ
  useEffect(() => {
    if (!user) return;
    fetchReadState().then((state) => {
      if (!state) return;
      setReadIds((prev) => {
        const merged = new Set([...prev, ...state.readIds]);
        saveSet(STORAGE_KEYS.READ_IDS, merged);
        localReadRef.current = merged;
        return merged;
      });
      setBookmarkIds((prev) => {
        const merged = new Set([...prev, ...state.bookmarkIds]);
        saveSet(STORAGE_KEYS.BOOKMARK_IDS, merged);
        localBookmarkRef.current = merged;
        return merged;
      });
      setReadingListIds((prev) => {
        const merged = new Set([...prev, ...(state.readingListIds ?? [])]);
        saveSet(STORAGE_KEYS.READING_LIST_IDS, merged);
        localReadingListRef.current = merged;
        return merged;
      });
    });
  }, [user]);

  // ref を最新の state / props に同期
  useEffect(() => {
    localReadRef.current = readIds;
  }, [readIds]);

  useEffect(() => {
    localBookmarkRef.current = bookmarkIds;
  }, [bookmarkIds]);

  useEffect(() => {
    localReadingListRef.current = readingListIds;
  }, [readingListIds]);

  useEffect(() => {
    articlesRef.current = articles;
  }, [articles]);

  // ページを閉じる前にデバウンス待ちのデータを即時送信
  useEffect(() => {
    function onBeforeUnload() {
      if (syncTimerRef.current === null) return;
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
      const body = JSON.stringify({
        readIds: [...localReadRef.current],
        bookmarkIds: [...localBookmarkRef.current],
        readingListIds: [...localReadingListRef.current],
      });
      navigator.sendBeacon('/api/read-state', new Blob([body], { type: 'application/json' }));
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const scheduleSyncToServer = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      saveReadState(localReadRef.current, localBookmarkRef.current, localReadingListRef.current);
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
        const bIds = localBookmarkRef.current;
        const rIds = localReadingListRef.current;
        let ids: string[];
        if (feedId === '__bookmarks__') {
          ids = arts.filter((a) => bIds.has(a.id)).map((a) => a.id);
        } else if (feedId === '__reading_list__') {
          ids = arts.filter((a) => rIds.has(a.id)).map((a) => a.id);
        } else if (feedId) {
          ids = arts.filter((a) => a.feedId === feedId).map((a) => a.id);
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

  const toggleRead = useCallback(
    (id: string) => { toggleSetItem(setReadIds, STORAGE_KEYS.READ_IDS, id); scheduleSyncToServer(); },
    [scheduleSyncToServer],
  );

  const toggleBookmark = useCallback(
    (id: string) => { toggleSetItem(setBookmarkIds, STORAGE_KEYS.BOOKMARK_IDS, id); scheduleSyncToServer(); },
    [scheduleSyncToServer],
  );

  const toggleReadingList = useCallback(
    (id: string) => { toggleSetItem(setReadingListIds, STORAGE_KEYS.READING_LIST_IDS, id); scheduleSyncToServer(); },
    [scheduleSyncToServer],
  );

  return {
    readIds,
    bookmarkIds,
    readingListIds,
    markRead,
    markAllRead,
    toggleRead,
    toggleBookmark,
    toggleReadingList,
  };
}
