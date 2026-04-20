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
import {
  type SetKind,
  type PendingSets,
  emptyPendingSets,
  snapshotPendingSets,
  mergePendingSets,
  pruneExpiredSnoozes,
  normalizeTagName,
  normalizeTagArray,
  serializeReadState,
} from "../lib/read-state-storage";

type ReadStateSets = {
  read: Set<string>;
  bookmarks: Set<string>;
  readingList: Set<string>;
  likes: Set<string>;
  readBeforeTimestamp: string | null;
  snoozedUntil: Record<string, string>;
  notes: Record<string, string>;
  tagIds: Record<string, string[]>;
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
 *
 * 追加・削除のいずれでも pendingAdded / pendingRemoved に差分を記録するため、
 * サーバー側はフルセットではなく差分のみを受け取れる。
 */
function makeToggle(
  setter: React.Dispatch<React.SetStateAction<Set<string>>>,
  key: string,
  schedule: () => void,
  getCurrentSet: () => Set<string>,
  onAdd: (id: string) => void,
  onRemove: (id: string) => void,
): (id: string) => void {
  return (id) => {
    const isRemoval = getCurrentSet().has(id);
    toggleSetItem(setter, key, id);
    if (isRemoval) {
      onRemove(id);
    } else {
      onAdd(id);
      schedule();
    }
  };
}

interface SaveResult {
  ok: boolean;
  state?: ReadState;
  /** ネットワーク障害等で status が取れない場合は undefined */
  status?: number;
}

/**
 * 既読・ブックマーク・後で読む・いいね・グローバルフィルター状態をサーバーに保存する。
 * サーバー側で差分マージ後の最新 ReadState を受け取る。
 * 通信失敗・サーバーエラー時は ok: false と status（取得できた場合）を返す。
 */
async function saveReadState(body: string): Promise<SaveResult> {
  try {
    const res = await apiFetch("/api/read-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) return { ok: false, status: res.status };
    const state = (await res.json()) as ReadState;
    return { ok: true, state };
  } catch {
    return { ok: false };
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
  tagIds: Record<string, string[]>;
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
  addTag: (articleId: string, tag: string) => void;
  removeTag: (articleId: string, tag: string) => void;
  setArticleTags: (articleId: string, tags: readonly string[]) => void;
  clearArticleTags: (articleId: string) => void;
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
  const [tagIdsState, setTagIdsState] = useState<Record<string, string[]>>(() =>
    loadJson<Record<string, string[]>>(STORAGE_KEYS.TAGS, {}),
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
    tagIds: tagIdsState,
  });
  const historyIdsRef = useSyncedRef(historyIds);
  const articlesRef = useSyncedRef(articles);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  // 追加操作で蓄積した ID（POST で readIds/bookmarkIds/... として送信し、サーバー側で既存に合流する）
  const pendingAddedRef = useRef<PendingSets>(emptyPendingSets());
  // 削除操作で蓄積した ID（POST で removedIds として送信し、サーバー側で既存から除外する）
  const pendingRemovedRef = useRef<PendingSets>(emptyPendingSets());
  // globalFilter は「変更されたときのみ」サーバーへ送る。
  // 毎回送ると、別端末で設定した値を空 POST で上書きしてしまう可能性がある。
  const globalFilterDirtyRef = useRef(false);
  // タグが変更された articleId（POST で tagIds に現在値を含めて送信）
  const pendingTagChangedRef = useRef<Set<string>>(new Set());
  // タグが完全に消去された articleId（POST の removedIds.tagIds で送信）
  const pendingTagRemovedRef = useRef<Set<string>>(new Set());

  // useEffect 不要 — レンダー中の直接代入で十分
  stateRef.current = {
    read: readIds,
    bookmarks: bookmarkIds,
    readingList: readingListIds,
    likes: likeIds,
    readBeforeTimestamp,
    snoozedUntil,
    notes,
    tagIds: tagIdsState,
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
    // local にあってサーバーにない ID は pendingAdded に積み、次回 flush で送信する。
    // これにより、リロード前に flush できなかった追加がサーバーへ確実に反映される。
    const serverSets: Record<SetKind, Set<string>> = {
      read: new Set(state.readIds),
      bookmarks: new Set(state.bookmarkIds),
      readingList: new Set(state.readingListIds),
      likes: new Set(state.likeIds),
    };
    const localSets: Record<SetKind, Set<string>> = {
      read: stateRef.current.read,
      bookmarks: stateRef.current.bookmarks,
      readingList: stateRef.current.readingList,
      likes: stateRef.current.likes,
    };
    for (const kind of ["read", "bookmarks", "readingList", "likes"] as SetKind[]) {
      for (const id of localSets[kind]) {
        if (!serverSets[kind].has(id) && !pendingRemovedRef.current[kind].has(id)) {
          pendingAddedRef.current[kind].add(id);
        }
      }
    }
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
      const rbt = state.readBeforeTimestamp;
      setReadBeforeTimestamp((prev) => {
        const next = !prev || rbt > prev ? rbt : prev;
        if (next !== prev) storageSet(STORAGE_KEYS.READ_BEFORE_TIMESTAMP, next);
        return next;
      });
    }
    if ("snoozedUntil" in state && state.snoozedUntil) {
      const snoozed = state.snoozedUntil;
      setSnoozedUntil((prev) => {
        const result: Record<string, string> = { ...snoozed };
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
    if ("tagIds" in state) {
      // タグはキー単位で処理:
      // - pendingTagRemovedRef: 削除予定なのでサーバー値・ローカル値の両方を無視してスキップ
      //   （result に残すと「削除されない状態」に戻ってしまい、次回 flush 後も削除結果が反映されない）
      // - pendingTagChangedRef: ローカルに未同期の変更あり → サーバーで上書きせずローカル値を保持
      // - それ以外のサーバー側キー: サーバー優先で上書き
      // - ローカルだけに存在するキー: pendingTagChangedRef に追加して次回 flush で送る
      const serverTags = state.tagIds ?? {};
      setTagIdsState((prev) => {
        const result: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(serverTags)) {
          if (pendingTagRemovedRef.current.has(k)) continue;
          if (pendingTagChangedRef.current.has(k)) continue;
          result[k] = v;
        }
        for (const [k, v] of Object.entries(prev)) {
          if (pendingTagRemovedRef.current.has(k)) continue;
          if (k in result) continue;
          result[k] = v;
          if (!(k in serverTags)) {
            pendingTagChangedRef.current.add(k);
          }
        }
        saveJson(STORAGE_KEYS.TAGS, result);
        return result;
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
    const added = snapshotPendingSets(pendingAddedRef.current);
    const removed = snapshotPendingSets(pendingRemovedRef.current);
    const tagChanged = new Set(pendingTagChangedRef.current);
    const tagRemoved = new Set(pendingTagRemovedRef.current);
    const wasGfDirty = globalFilterDirtyRef.current;
    const body = serializeReadState(
      added,
      removed,
      globalFilterRef.current,
      stateRef.current.readBeforeTimestamp,
      stateRef.current.snoozedUntil,
      stateRef.current.notes,
      {
        changedKeys: tagChanged,
        removedKeys: tagRemoved,
        currentTags: stateRef.current.tagIds,
      },
      wasGfDirty,
    );
    const accepted = navigator.sendBeacon(
      "/api/read-state",
      new Blob([body], { type: "application/json" }),
    );
    // キュー受理された場合のみ pending をクリア。拒否（false）なら beforeunload がキャンセル
    // された場合に備えて pending を保持する（実際に閉じればいずれ失われるが少なくとも救済余地を残す）
    if (accepted) {
      pendingAddedRef.current = emptyPendingSets();
      pendingRemovedRef.current = emptyPendingSets();
      pendingTagChangedRef.current = new Set();
      pendingTagRemovedRef.current = new Set();
      globalFilterDirtyRef.current = false;
    }
  });
  useEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState !== "hidden") return;
      if (!userRef.current) return;
      if (!flushIfPending()) return;
      const added = snapshotPendingSets(pendingAddedRef.current);
      const removed = snapshotPendingSets(pendingRemovedRef.current);
      const tagChanged = new Set(pendingTagChangedRef.current);
      const tagRemoved = new Set(pendingTagRemovedRef.current);
      const wasGfDirty = globalFilterDirtyRef.current;
      pendingAddedRef.current = emptyPendingSets();
      pendingRemovedRef.current = emptyPendingSets();
      pendingTagChangedRef.current = new Set();
      pendingTagRemovedRef.current = new Set();
      globalFilterDirtyRef.current = false;
      const body = serializeReadState(
        added,
        removed,
        globalFilterRef.current,
        stateRef.current.readBeforeTimestamp,
        stateRef.current.snoozedUntil,
        stateRef.current.notes,
        {
          changedKeys: tagChanged,
          removedKeys: tagRemoved,
          currentTags: stateRef.current.tagIds,
        },
        wasGfDirty,
      );
      saveReadState(body).then((result) => {
        if (result.ok && result.state) {
          applyServerState(result.state);
        } else {
          // グローバル通知は apiFetch 内で発火済み。pending に復帰して次回リトライ。
          mergePendingSets(pendingAddedRef.current, added);
          mergePendingSets(pendingRemovedRef.current, removed);
          for (const k of tagChanged) pendingTagChangedRef.current.add(k);
          for (const k of tagRemoved) pendingTagRemovedRef.current.add(k);
          if (wasGfDirty) globalFilterDirtyRef.current = true;
        }
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

  /** 追加・削除差分を snapshot して送信し、成功時はサーバー応答を反映、失敗時は pending に戻す */
  const flushToServer = useCallback(async () => {
    if (!userRef.current) return;
    const added = snapshotPendingSets(pendingAddedRef.current);
    const removed = snapshotPendingSets(pendingRemovedRef.current);
    const tagChanged = new Set(pendingTagChangedRef.current);
    const tagRemoved = new Set(pendingTagRemovedRef.current);
    const wasGfDirty = globalFilterDirtyRef.current;
    pendingAddedRef.current = emptyPendingSets();
    pendingRemovedRef.current = emptyPendingSets();
    pendingTagChangedRef.current = new Set();
    pendingTagRemovedRef.current = new Set();
    globalFilterDirtyRef.current = false;
    const body = serializeReadState(
      added,
      removed,
      globalFilterRef.current,
      stateRef.current.readBeforeTimestamp,
      stateRef.current.snoozedUntil,
      stateRef.current.notes,
      {
        changedKeys: tagChanged,
        removedKeys: tagRemoved,
        currentTags: stateRef.current.tagIds,
      },
      wasGfDirty,
    );
    const result = await saveReadState(body);
    if (result.ok && result.state) {
      applyServerState(result.state);
    } else {
      // グローバル通知は apiFetch 内で発火済み。次回デバウンスで再送できるよう pending に復帰。
      mergePendingSets(pendingAddedRef.current, added);
      mergePendingSets(pendingRemovedRef.current, removed);
      for (const k of tagChanged) pendingTagChangedRef.current.add(k);
      for (const k of tagRemoved) pendingTagRemovedRef.current.add(k);
      if (wasGfDirty) globalFilterDirtyRef.current = true;
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
      pendingAddedRef.current.read.add(articleId);
      pendingRemovedRef.current.read.delete(articleId);
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
      for (const id of newIds) {
        pendingAddedRef.current.read.add(id);
        pendingRemovedRef.current.read.delete(id);
      }
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
        // 新たに追加された ID のみを pending に記録（既読済み ID は送信不要）
        for (const id of ids) {
          if (!prev.has(id)) {
            pendingAddedRef.current.read.add(id);
            pendingRemovedRef.current.read.delete(id);
          }
        }
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
    // 追加 ID を pending に記録し、次回の flush で送信する
    const recordAdd =
      (kind: SetKind) =>
      (id: string): void => {
        pendingAddedRef.current[kind].add(id);
        pendingRemovedRef.current[kind].delete(id);
      };
    // 削除ID を pending に記録し、即時同期する
    const recordRemoval =
      (kind: SetKind) =>
      (id: string): void => {
        pendingRemovedRef.current[kind].add(id);
        pendingAddedRef.current[kind].delete(id);
        syncImmediately();
      };
    return {
      // toggleRead も削除時の即時同期を有効化する（既読解除が他端末で復活するバグ対策）
      toggleRead: makeToggle(
        setReadIds,
        STORAGE_KEYS.READ_IDS,
        scheduleSyncToServer,
        () => stateRef.current.read,
        recordAdd("read"),
        recordRemoval("read"),
      ),
      toggleBookmark: makeToggle(
        setBookmarkIds,
        STORAGE_KEYS.BOOKMARK_IDS,
        scheduleSyncToServer,
        () => stateRef.current.bookmarks,
        recordAdd("bookmarks"),
        recordRemoval("bookmarks"),
      ),
      toggleReadingList: makeToggle(
        setReadingListIds,
        STORAGE_KEYS.READING_LIST_IDS,
        scheduleSyncToServer,
        () => stateRef.current.readingList,
        recordAdd("readingList"),
        recordRemoval("readingList"),
      ),
      toggleLike: makeToggle(
        setLikeIds,
        STORAGE_KEYS.LIKE_IDS,
        scheduleSyncToServer,
        () => stateRef.current.likes,
        recordAdd("likes"),
        recordRemoval("likes"),
      ),
    };
  }, [scheduleSyncToServer, syncImmediately]);

  const setGlobalFilter = useCallback(
    (filter: KeywordFilter | null) => {
      saveJson(STORAGE_KEYS.GLOBAL_FILTER, filter);
      setGlobalFilterState(filter);
      globalFilterDirtyRef.current = true;
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

  /** 記事のタグを完全に置き換える。空配列を渡すとキー自体を削除する */
  const setArticleTags = useCallback(
    (articleId: string, tags: readonly string[]) => {
      if (articleId.length === 0) return;
      const normalized = normalizeTagArray(tags);
      // stateRef から「変更前」の値を読んで差分判定と pending 更新を setState の外で完結させる。
      // setState コールバック内で ref を変更すると StrictMode の二重呼び出しで重複が発生するため避ける。
      const before = stateRef.current.tagIds[articleId] ?? [];
      const same =
        before.length === normalized.length && before.every((v, i) => v === normalized[i]);
      if (same) return;
      if (normalized.length === 0) {
        pendingTagRemovedRef.current.add(articleId);
        pendingTagChangedRef.current.delete(articleId);
      } else {
        pendingTagChangedRef.current.add(articleId);
        pendingTagRemovedRef.current.delete(articleId);
      }
      setTagIdsState((prev) => {
        const next: Record<string, string[]> = { ...prev };
        if (normalized.length === 0) {
          if (!(articleId in prev)) return prev;
          delete next[articleId];
        } else {
          next[articleId] = normalized;
        }
        saveJson(STORAGE_KEYS.TAGS, next);
        return next;
      });
      scheduleSyncToServer();
    },
    [scheduleSyncToServer],
  );

  const addTag = useCallback(
    (articleId: string, tag: string) => {
      const n = normalizeTagName(tag);
      if (!n) return;
      const current = stateRef.current.tagIds[articleId] ?? [];
      if (current.includes(n)) return;
      setArticleTags(articleId, [...current, n]);
    },
    [setArticleTags],
  );

  const removeTag = useCallback(
    (articleId: string, tag: string) => {
      const n = normalizeTagName(tag);
      if (!n) return;
      const current = stateRef.current.tagIds[articleId] ?? [];
      if (!current.includes(n)) return;
      setArticleTags(
        articleId,
        current.filter((t) => t !== n),
      );
    },
    [setArticleTags],
  );

  const clearArticleTags = useCallback(
    (articleId: string) => {
      setArticleTags(articleId, []);
    },
    [setArticleTags],
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
    tagIds: tagIdsState,
    addTag,
    removeTag,
    setArticleTags,
    clearArticleTags,
  };
}
