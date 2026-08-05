"use client";

import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import type { Article, KeywordFilter } from "../types";
import type { ToastApi } from "./useToast";
import { useSyncedRef } from "./useSyncedRef";
import { STORAGE_KEYS, SPECIAL_FEED_IDS, deferSaveSet, saveJson, storageSet } from "../lib/storage";
import { MAX_NOTE_LENGTH } from "../lib/validation";
import { pruneExpiredSnoozes } from "../lib/read-state-storage";
import { isLaterIso } from "../lib/read-state-merge";
import type { ReadStateSets } from "./useReadStatePersistence";

export interface ReadStateActionDeps {
  articles: Article[];
  historyIds: Set<string> | undefined;
  stateRef: MutableRefObject<ReadStateSets>;
  setReadIds: Dispatch<SetStateAction<Set<string>>>;
  setReadBeforeTimestamp: Dispatch<SetStateAction<string | null>>;
  setSnoozedUntil: Dispatch<SetStateAction<Record<string, string>>>;
  setNotesState: Dispatch<SetStateAction<Record<string, string>>>;
  setGlobalFilterState: Dispatch<SetStateAction<KeywordFilter | null>>;
  setTtlDaysState: Dispatch<SetStateAction<number | null>>;
  pendingAddedRef: MutableRefObject<{
    read: Set<string>;
    bookmarks: Set<string>;
    readingList: Set<string>;
    likes: Set<string>;
  }>;
  pendingRemovedRef: MutableRefObject<{
    read: Set<string>;
    bookmarks: Set<string>;
    readingList: Set<string>;
    likes: Set<string>;
  }>;
  /** 編集した note の articleId を track する (#1113 flush 中の編集巻き戻り防止) */
  pendingNotesChangedRef: MutableRefObject<Set<string>>;
  /** 削除した note の articleId を track する (#1084 cross-device note 削除) */
  pendingNotesRemovedRef: MutableRefObject<Set<string>>;
  globalFilterDirtyRef: MutableRefObject<boolean>;
  scheduleSyncRef: RefObject<() => void>;
}

interface ReadStateActionResult {
  markRead: (articleId: string) => void;
  markBulkRead: (articleIds: string[]) => void;
  markAllRead: (feedId: string | null) => void;
  markAllReadWithUndo: (feedId: string | null, toast: ToastApi) => void;
  snoozeArticle: (articleId: string, durationMs: number) => void;
  setNote: (articleId: string, text: string) => void;
  deleteNote: (articleId: string) => void;
  setGlobalFilter: (filter: KeywordFilter | null) => void;
  setTtlDays: (days: number | null) => void;
}

export function useReadStateActions(deps: ReadStateActionDeps): ReadStateActionResult {
  const {
    articles,
    historyIds,
    stateRef,
    setReadIds,
    setReadBeforeTimestamp,
    setSnoozedUntil,
    setNotesState,
    setGlobalFilterState,
    setTtlDaysState,
    pendingAddedRef,
    pendingRemovedRef,
    pendingNotesChangedRef,
    pendingNotesRemovedRef,
    globalFilterDirtyRef,
    scheduleSyncRef,
  } = deps;

  const historyIdsRef = useSyncedRef(historyIds);
  const articlesRef = useSyncedRef(articles);

  const markRead = useCallback(
    (articleId: string) => {
      setReadIds((prev) => {
        if (prev.has(articleId)) return prev;
        const next = new Set(prev);
        next.add(articleId);
        deferSaveSet(STORAGE_KEYS.READ_IDS, next);
        return next;
      });
      pendingAddedRef.current.read.add(articleId);
      pendingRemovedRef.current.read.delete(articleId);
      scheduleSyncRef.current();
    },
    // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setReadIds],
  );

  const markBulkRead = useCallback(
    (articleIds: string[]) => {
      const newIds = articleIds.filter((id) => !stateRef.current.read.has(id));
      if (newIds.length === 0) return;
      setReadIds((prev) => {
        const next = new Set(prev);
        for (const id of newIds) next.add(id);
        deferSaveSet(STORAGE_KEYS.READ_IDS, next);
        return next;
      });
      for (const id of newIds) {
        pendingAddedRef.current.read.add(id);
        pendingRemovedRef.current.read.delete(id);
      }
      scheduleSyncRef.current();
    },
    // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setReadIds],
  );

  // 今回新規に既読化した id 配列を返す。markAllReadWithUndo の差分復元 (#1086) で使用する。
  // id 計算と pending 更新は updater 外で行う (markBulkRead と同じ stateRef ベース pattern、
  // setState callback 内副作用を排除して React Strict Mode の二重実行に対応)。
  const markAllRead = useCallback(
    (feedId: string | null): string[] => {
      const arts = articlesRef.current;
      const { read, bookmarks, readingList, likes } = stateRef.current;
      const specialSets: Partial<Record<string, Set<string>>> = {
        [SPECIAL_FEED_IDS.BOOKMARKS]: bookmarks,
        [SPECIAL_FEED_IDS.READING_LIST]: readingList,
        [SPECIAL_FEED_IDS.LIKES]: likes,
        [SPECIAL_FEED_IDS.HISTORY]: historyIdsRef.current ?? new Set<string>(),
      };
      const specialSet = feedId ? (specialSets[feedId] ?? null) : null;
      const ids: string[] = [];
      const addedIds: string[] = [];
      for (const article of arts) {
        if (specialSet !== null && !specialSet.has(article.id)) continue;
        if (specialSet === null && feedId && article.feedHash !== feedId) continue;
        ids.push(article.id);
        if (!read.has(article.id)) addedIds.push(article.id);
      }

      setReadIds((prev) => {
        const next = new Set([...prev, ...ids]);
        deferSaveSet(STORAGE_KEYS.READ_IDS, next);
        return next;
      });
      for (const id of addedIds) {
        pendingAddedRef.current.read.add(id);
        pendingRemovedRef.current.read.delete(id);
      }
      if (!feedId) {
        const now = new Date().toISOString();
        setReadBeforeTimestamp((prev) => {
          // ISO 比較は isLaterIso (Date.parse) 経由。raw `>` は offset 形式で cutoff 後退 (#1083)。
          const next = !prev || isLaterIso(now, prev) ? now : prev;
          storageSet(STORAGE_KEYS.READ_BEFORE_TIMESTAMP, next);
          return next;
        });
      }
      scheduleSyncRef.current();
      return addedIds;
    },
    [
      historyIdsRef,
      articlesRef,
      stateRef,
      setReadIds,
      setReadBeforeTimestamp,
      pendingAddedRef,
      pendingRemovedRef,
      scheduleSyncRef,
    ],
  );

  const markAllReadWithUndo = useCallback(
    (feedId: string | null, toast: ToastApi) => {
      const prevReadBeforeTimestamp = stateRef.current.readBeforeTimestamp;
      // markAllRead が pendingRemoved から delete する前のスナップショット。
      // undo で「元々 pendingRemoved にあった addedId」だけを復元するために使う。
      const prevPendingRemoved = new Set(pendingRemovedRef.current.read);

      const addedIds = markAllRead(feedId);

      toast.undo("全て既読にしました", () => {
        // 差分復元 (#1086): markAllRead が今回追加した addedIds だけを巻き戻す。
        // 旧実装は read Set / pending-ref を丸ごと上書きしていたため、undo window 中の
        // 別操作 (別記事の既読化 / 解除) が失われていた。差分復元で window 中の操作は保持する。
        setReadIds((cur) => {
          const next = new Set(cur);
          for (const id of addedIds) next.delete(id);
          deferSaveSet(STORAGE_KEYS.READ_IDS, next);
          return next;
        });
        for (const id of addedIds) {
          // markAllRead が立てた pending-add を取り消す
          pendingAddedRef.current.read.delete(id);
          // markAllRead が pendingRemoved から消した id は、元々あったなら復元する
          if (prevPendingRemoved.has(id)) pendingRemovedRef.current.read.add(id);
        }
        if (!feedId) {
          setReadBeforeTimestamp(prevReadBeforeTimestamp);
          storageSet(STORAGE_KEYS.READ_BEFORE_TIMESTAMP, prevReadBeforeTimestamp ?? "");
        }
        scheduleSyncRef.current();
      });
    },
    [
      stateRef,
      markAllRead,
      setReadIds,
      setReadBeforeTimestamp,
      pendingAddedRef,
      pendingRemovedRef,
      scheduleSyncRef,
    ],
  );

  const snoozeArticle = useCallback(
    (articleId: string, durationMs: number) => {
      const until = new Date(Date.now() + durationMs).toISOString();
      setSnoozedUntil((prev) => {
        const next = pruneExpiredSnoozes({ ...prev, [articleId]: until });
        saveJson(STORAGE_KEYS.SNOOZED_UNTIL, next);
        return next;
      });
      scheduleSyncRef.current();
    },
    // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setSnoozedUntil],
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
      // note を設定したら removal pending を解除 (削除→再設定の打ち消し、#1084)
      pendingNotesRemovedRef.current.delete(articleId);
      // #1113: 編集 key を changed channel で track (tags の pendingTagChangedRef と対称)。
      // flush の await 中に再編集された note が server-wins マージで巻き戻るのを防ぐ。
      pendingNotesChangedRef.current.add(articleId);
      scheduleSyncRef.current();
    },
    // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setNotesState],
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
      // #1084: 削除した note key を removal channel で track (tags の pendingTagRemovedRef と対称)。
      // serializeReadState が removedIds.notes として送信 → server mergeNotes が honor → 復活を防ぐ。
      pendingNotesRemovedRef.current.add(articleId);
      // #1113: 削除は changed channel から除外 (削除が編集に優先、tags の pendingTagChangedRef.delete と対称)。
      pendingNotesChangedRef.current.delete(articleId);
      scheduleSyncRef.current();
    },
    // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setNotesState],
  );

  const setGlobalFilter = useCallback(
    (filter: KeywordFilter | null) => {
      saveJson(STORAGE_KEYS.GLOBAL_FILTER, filter);
      setGlobalFilterState(filter);
      globalFilterDirtyRef.current = true;
      scheduleSyncRef.current();
    },
    // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setGlobalFilterState],
  );

  const setTtlDays = useCallback(
    (days: number | null) => {
      storageSet(STORAGE_KEYS.TTL_DAYS, days === null ? "" : String(days));
      setTtlDaysState(days);
      scheduleSyncRef.current();
    },
    // useSyncedRef の戻り値は identity 不変のため deps 配列から除外 (react-hook-patterns.md 規範)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setTtlDaysState],
  );

  return {
    markRead,
    markBulkRead,
    markAllRead,
    markAllReadWithUndo,
    snoozeArticle,
    setNote,
    deleteNote,
    setGlobalFilter,
    setTtlDays,
  };
}
