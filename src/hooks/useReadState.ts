"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Article, KeywordFilter, UserProfile, ReadState } from "../types";
import { useSyncedRef } from "./useSyncedRef";
import { useEventListener } from "./useEventListener";
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
import { MAX_NOTE_LENGTH } from "../lib/validation";

type ReadStateSets = {
  read: Set<string>;
  bookmarks: Set<string>;
  readingList: Set<string>;
  likes: Set<string>;
  readBeforeTimestamp: string | null;
  snoozedUntil: Record<string, string>;
  notes: Record<string, string>;
};

type RemovedKind = "read" | "bookmarks" | "readingList" | "likes";

type PendingRemoved = Record<RemovedKind, Set<string>>;

function emptyPendingRemoved(): PendingRemoved {
  return {
    read: new Set(),
    bookmarks: new Set(),
    readingList: new Set(),
    likes: new Set(),
  };
}

function snapshotPendingRemoved(pending: PendingRemoved): PendingRemoved {
  return {
    read: new Set(pending.read),
    bookmarks: new Set(pending.bookmarks),
    readingList: new Set(pending.readingList),
    likes: new Set(pending.likes),
  };
}

function mergePendingRemoved(target: PendingRemoved, source: PendingRemoved): void {
  for (const kind of Object.keys(target) as RemovedKind[]) {
    for (const id of source[kind]) target[kind].add(id);
  }
}

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
 *
 * `getCurrentSet` と `onRemove` を指定した場合、削除操作を検出して削除 ID を伝達する。
 * これにより、リロード前にサーバーへ削除が反映されず復活するバグを防ぐ。
 */
function makeToggle(
  setter: React.Dispatch<React.SetStateAction<Set<string>>>,
  key: string,
  schedule: () => void,
  getCurrentSet?: () => Set<string>,
  onRemove?: (id: string) => void,
): (id: string) => void {
  return (id) => {
    const isRemoval = getCurrentSet ? getCurrentSet().has(id) : false;
    toggleSetItem(setter, key, id);
    if (isRemoval && onRemove) {
      onRemove(id);
    } else {
      schedule();
    }
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

/**
 * ReadStateSets + globalFilter + 削除差分を /api/read-state に POST する JSON 文字列にシリアライズする。
 * サーバー側は既存 ReadState に対して `(existing ∪ update) \ removedIds` でマージする。
 */
function serializeReadState(
  sets: ReadStateSets,
  globalFilter: KeywordFilter | null,
  removed: PendingRemoved,
): string {
  const pruned = pruneExpiredSnoozes(sets.snoozedUntil);
  return JSON.stringify({
    readIds: [...sets.read],
    bookmarkIds: [...sets.bookmarks],
    readingListIds: [...sets.readingList],
    likeIds: [...sets.likes],
    globalFilter,
    readBeforeTimestamp: sets.readBeforeTimestamp,
    snoozedUntil: Object.keys(pruned).length > 0 ? pruned : null,
    notes: Object.keys(sets.notes).length > 0 ? sets.notes : null,
    removedIds: {
      readIds: [...removed.read],
      bookmarkIds: [...removed.bookmarks],
      readingListIds: [...removed.readingList],
      likeIds: [...removed.likes],
    },
  });
}

/**
 * 既読・ブックマーク・後で読む・いいね・グローバルフィルター状態をサーバーに保存する。
 * サーバー側で差分マージ後の最新 ReadState を返す。通信失敗時は null。
 */
async function saveReadState(
  sets: ReadStateSets,
  globalFilter: KeywordFilter | null,
  removed: PendingRemoved,
): Promise<ReadState | null> {
  try {
    const res = await apiFetch("/api/read-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: serializeReadState(sets, globalFilter, removed),
    });
    if (!res.ok) return null;
    return res.json() as Promise<ReadState>;
  } catch {
    return null;
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
  notes: Record<string, string>;
  markRead: (articleId: string) => void;
  markBulkRead: (articleIds: string[]) => void;
  markAllRead: (feedId: string | null) => void;
  toggleRead: (articleId: string) => void;
  toggleBookmark: (articleId: string) => void;
  toggleReadingList: (articleId: string) => void;
  toggleLike: (articleId: string) => void;
  snoozeArticle: (articleId: string, durationMs: number) => void;
  setNote: (articleId: string, text: string) => void;
  deleteNote: (articleId: string) => void;
}

/**
 * ユーザーの既読・ブックマーク・後で読む・いいね状態を管理するフック。
 *
 * ## 状態管理
 * - 初期値は localStorage から即時ロード（オフライン対応）
 * - 状態変更は localStorage に即座に反映し、5 秒のデバウンス後にサーバーへ同期
 * - ページ離脱時（`beforeunload`）は `sendBeacon` で確実に送信
 * - タブ非表示から復帰時（`visibilitychange`）にも同期を試みる（15秒クールダウン）
 *
 * ## サーバー同期（端末間整合のための 3-way マージ）
 * POST /api/read-state は差分形式（追加と `removedIds`）で送信し、サーバー側で
 * 既存 R2 データと `(existing ∪ update) \ removed` でマージする。
 * これにより、他端末の追加を失わず、明示的な削除（既読解除など）も他端末へ伝播する。
 * POST レスポンスでサーバー側の最新 ReadState を受け取り、ローカルに反映する。
 *
 * `globalFilter` / `readBeforeTimestamp` はサーバー値を優先（クロスデバイス同期）。
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
  const [notes, setNotesState] = useState<Record<string, string>>(() =>
    loadJson<Record<string, string>>(STORAGE_KEYS.NOTES, {}),
  );
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

  // 各セットをまとめて保持する ref（デバウンス送信・クロージャ内で使用）
  const lastServerSyncRef = useRef<number>(0);
  const stateRef = useRef<ReadStateSets>({
    read: readIds,
    bookmarks: bookmarkIds,
    readingList: readingListIds,
    likes: likeIds,
    readBeforeTimestamp,
    snoozedUntil,
    notes,
  });
  const historyIdsRef = useSyncedRef(historyIds);
  const articlesRef = useSyncedRef(articles);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  // 削除操作で蓄積した ID（POST で removedIds として送信し、サーバー側で既存から除外する）
  const pendingRemovedRef = useRef<PendingRemoved>(emptyPendingRemoved());

  // useEffect 不要 — レンダー中の直接代入で十分
  stateRef.current = {
    read: readIds,
    bookmarks: bookmarkIds,
    readingList: readingListIds,
    likes: likeIds,
    readBeforeTimestamp,
    snoozedUntil,
    notes,
  };

  /**
   * サーバーの ReadState をローカルにマージする。
   * ログイン時・フォーカス復帰時・POST レスポンス受信時の共通処理。
   * - readIds / bookmarkIds / readingListIds / likeIds: ローカル ∪ サーバー（ローカル優先）
   * - globalFilter / readBeforeTimestamp: サーバー優先（クロスデバイス同期）
   * - snoozedUntil: until が遅い方を採用してマージ
   * - notes: サーバー優先（テキスト編集コンテンツ）
   */
  const applyServerState = useCallback((state: ReadState) => {
    lastServerSyncRef.current = Date.now();
    mergeServerSet(setReadIds, STORAGE_KEYS.READ_IDS, state.readIds);
    mergeServerSet(setBookmarkIds, STORAGE_KEYS.BOOKMARK_IDS, state.bookmarkIds);
    mergeServerSet(setReadingListIds, STORAGE_KEYS.READING_LIST_IDS, state.readingListIds);
    mergeServerSet(setLikeIds, STORAGE_KEYS.LIKE_IDS, state.likeIds);
    if ("globalFilter" in state) {
      const serverFilter = state.globalFilter ?? null;
      saveJson(STORAGE_KEYS.GLOBAL_FILTER, serverFilter);
      setGlobalFilterState(serverFilter);
    }
    if ("readBeforeTimestamp" in state && state.readBeforeTimestamp) {
      setReadBeforeTimestamp((prev) => {
        const server = state.readBeforeTimestamp!;
        const next = !prev || server > prev ? server : prev;
        if (next !== prev) storageSet(STORAGE_KEYS.READ_BEFORE_TIMESTAMP, next);
        return next;
      });
    }
    if ("snoozedUntil" in state && state.snoozedUntil) {
      setSnoozedUntil((prev) => {
        const result: Record<string, string> = { ...state.snoozedUntil! };
        for (const [id, until] of Object.entries(prev)) {
          if (!result[id] || until > result[id]) result[id] = until;
        }
        const merged = pruneExpiredSnoozes(result);
        saveJson(STORAGE_KEYS.SNOOZED_UNTIL, merged);
        return merged;
      });
    }
    if ("notes" in state) {
      setNotesState((prev) => {
        const merged = { ...prev, ...(state.notes ?? {}) };
        saveJson(STORAGE_KEYS.NOTES, merged);
        return merged;
      });
    }
  }, []);

  // ログイン後にサーバーの既読・ブックマーク・後で読む・グローバルフィルター状態をマージ
  // user?.sub を dependency にすることで、同一ユーザーの認証チェック毎にオブジェクト参照が
  // 変わっても再マージが走らないようにする。
  const userSub = user?.sub;
  useEffect(() => {
    if (!userSub) return;
    fetchReadState().then((state) => {
      if (!state) return;
      applyServerState(state);
    });
  }, [userSub, applyServerState]);

  // デバウンス待ちタイマーを即時実行して null にリセットする
  function flushIfPending(): boolean {
    if (syncTimerRef.current === null) return false;
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = null;
    isDirtyRef.current = false;
    return true;
  }

  // タブ復帰時に他デバイスの変更をサーバーから取り込む（15秒クールダウン）
  // POST の応答でもサーバー状態を反映するため、クールダウンはあくまで過剰 GET 抑止用に短めでよい。
  useEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState !== "visible") return;
      if (!userRef.current) return;
      if (Date.now() - lastServerSyncRef.current < 15_000) return;
      fetchReadState().then((state) => {
        if (!state) return;
        applyServerState(state);
      });
    },
    document,
  );

  // ページを閉じる前・タブ非表示時にデバウンス待ちのデータを即時送信
  // - beforeunload: ページ閉じ・遷移時。fetch は中断されるため sendBeacon を使用
  // - visibilitychange hidden: タブ切り替え時。fetch を使用（beforeunload が発火しないケースを補完）
  useEventListener("beforeunload", () => {
    if (!userRef.current) return;
    if (!flushIfPending()) return;
    // sendBeacon はレスポンス未確認のため、キュー受理成否のみで pending の扱いを決める
    const removed = snapshotPendingRemoved(pendingRemovedRef.current);
    const accepted = navigator.sendBeacon(
      "/api/read-state",
      new Blob([serializeReadState(stateRef.current, globalFilterRef.current, removed)], {
        type: "application/json",
      }),
    );
    // キュー受理された場合のみ pending をクリア。拒否（false）なら beforeunload がキャンセル
    // された場合に備えて pending を保持する（実際に閉じればいずれ失われるが少なくとも救済余地を残す）
    if (accepted) pendingRemovedRef.current = emptyPendingRemoved();
  });
  useEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState !== "hidden") return;
      if (!userRef.current) return;
      if (!flushIfPending()) return;
      const removed = snapshotPendingRemoved(pendingRemovedRef.current);
      pendingRemovedRef.current = emptyPendingRemoved();
      saveReadState(stateRef.current, globalFilterRef.current, removed).then((latest) => {
        if (latest) applyServerState(latest);
        else mergePendingRemoved(pendingRemovedRef.current, removed);
      });
    },
    document,
  );
  // アンマウント時にデバウンス待ちのタイマーをクリア
  useEffect(() => {
    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, []);

  /** 削除差分を snapshot して送信し、成功時はサーバー応答を反映、失敗時は pending に戻す */
  const flushToServer = useCallback(async () => {
    if (!userRef.current) return;
    const removed = snapshotPendingRemoved(pendingRemovedRef.current);
    pendingRemovedRef.current = emptyPendingRemoved();
    const latest = await saveReadState(stateRef.current, globalFilterRef.current, removed);
    if (latest) {
      applyServerState(latest);
    } else {
      // 次回デバウンスで再送できるよう pending に復帰
      mergePendingRemoved(pendingRemovedRef.current, removed);
    }
  }, [applyServerState, globalFilterRef, userRef]);

  const scheduleSyncToServer = useCallback(() => {
    isDirtyRef.current = true;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      if (!isDirtyRef.current) return;
      isDirtyRef.current = false;
      syncTimerRef.current = null;
      void flushToServer();
    }, 5000);
  }, [flushToServer]);

  /**
   * 削除操作用の即時サーバー同期。
   * デバウンスなしで React のコミット後（setTimeout 0）に同期する。
   * 既読解除・ブックマーク解除・後で読む削除・いいね解除の直後にリロードしても復活しないようにする。
   */
  const syncImmediately = useCallback(() => {
    if (!userRef.current) return;
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
    // isDirtyRef を true にして beforeunload 時の flushIfPending が sendBeacon を発火できるようにする
    isDirtyRef.current = true;
    // setTimeout(0) を syncTimerRef に保持することで、ページリロード前に flushIfPending が検出できる
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      if (!userRef.current) return;
      isDirtyRef.current = false;
      void flushToServer();
    }, 0);
  }, [flushToServer, userRef]);

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
      // stateRef.current.read は現在レンダーの readIds を同期的に反映するため、
      // 既読済み ID を事前フィルタリングして不要な setState・scheduleSyncToServer を回避する
      const newIds = articleIds.filter((id) => !stateRef.current.read.has(id));
      if (newIds.length === 0) return;
      setReadIds((prev) => {
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
    [scheduleSyncToServer, historyIdsRef, articlesRef],
  );

  const { toggleRead, toggleBookmark, toggleReadingList, toggleLike } = useMemo(() => {
    // 削除ID を pending に記録し、即時同期する
    const recordRemoval =
      (kind: RemovedKind) =>
      (id: string): void => {
        pendingRemovedRef.current[kind].add(id);
        syncImmediately();
      };
    return {
      // toggleRead も削除時の即時同期を有効化する（既読解除が他端末で復活するバグ対策）
      toggleRead: makeToggle(
        setReadIds,
        STORAGE_KEYS.READ_IDS,
        scheduleSyncToServer,
        () => stateRef.current.read,
        recordRemoval("read"),
      ),
      toggleBookmark: makeToggle(
        setBookmarkIds,
        STORAGE_KEYS.BOOKMARK_IDS,
        scheduleSyncToServer,
        () => stateRef.current.bookmarks,
        recordRemoval("bookmarks"),
      ),
      toggleReadingList: makeToggle(
        setReadingListIds,
        STORAGE_KEYS.READING_LIST_IDS,
        scheduleSyncToServer,
        () => stateRef.current.readingList,
        recordRemoval("readingList"),
      ),
      toggleLike: makeToggle(
        setLikeIds,
        STORAGE_KEYS.LIKE_IDS,
        scheduleSyncToServer,
        () => stateRef.current.likes,
        recordRemoval("likes"),
      ),
    };
  }, [scheduleSyncToServer, syncImmediately]);

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

  const setNote = useCallback(
    (articleId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (trimmed.length > MAX_NOTE_LENGTH) return;
      setNotesState((prev) => {
        const next = { ...prev, [articleId]: trimmed };
        saveJson(STORAGE_KEYS.NOTES, next);
        return next;
      });
      scheduleSyncToServer();
    },
    [scheduleSyncToServer],
  );

  const deleteNote = useCallback(
    (articleId: string) => {
      setNotesState((prev) => {
        if (!(articleId in prev)) return prev;
        const next = { ...prev };
        delete next[articleId];
        saveJson(STORAGE_KEYS.NOTES, next);
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
    notes,
    markRead,
    markBulkRead,
    markAllRead,
    toggleRead,
    toggleBookmark,
    toggleReadingList,
    toggleLike,
    snoozeArticle,
    setNote,
    deleteNote,
  };
}
