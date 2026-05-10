"use client";

import {
  useCallback,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { KeywordFilter, ReadState } from "../types";
import { STORAGE_KEYS, deferSaveSet, saveJson, storageSet } from "../lib/storage";
import { type SetKind, type PendingSets, pruneExpiredSnoozes } from "../lib/read-state-storage";
import { equalSnoozedUntil, equalNotes, equalTagIds } from "../lib/read-state-merge";
import type { ReadStateSets } from "./useReadStatePersistence";

export interface SetStateDispatchers {
  read: Dispatch<SetStateAction<Set<string>>>;
  bookmarks: Dispatch<SetStateAction<Set<string>>>;
  readingList: Dispatch<SetStateAction<Set<string>>>;
  likes: Dispatch<SetStateAction<Set<string>>>;
}

export interface OtherStateDispatchers {
  setGlobalFilterState: Dispatch<SetStateAction<KeywordFilter | null>>;
  setTtlDaysState: Dispatch<SetStateAction<number | null>>;
  setReadBeforeTimestamp: Dispatch<SetStateAction<string | null>>;
  setSnoozedUntil: Dispatch<SetStateAction<Record<string, string>>>;
  setNotesState: Dispatch<SetStateAction<Record<string, string>>>;
  setTagIdsState: Dispatch<SetStateAction<Record<string, string[]>>>;
}

/**
 * ローカル Set にサーバー値をマージした新しい Set を返す純粋関数。
 * 変更がない場合は null を返す（setState の不要な呼び出しを回避する）。
 */
function computeMergedSet(local: Set<string>, serverValues: string[]): Set<string> | null {
  const newValues = serverValues.filter((v) => !local.has(v));
  if (newValues.length === 0) return null;
  return new Set([...local, ...newValues]);
}

export interface ApplyServerStateDeps {
  stateRef: MutableRefObject<ReadStateSets>;
  pendingAddedRef: MutableRefObject<PendingSets>;
  pendingRemovedRef: MutableRefObject<PendingSets>;
  pendingTagChangedRef: MutableRefObject<Set<string>>;
  pendingTagRemovedRef: MutableRefObject<Set<string>>;
  dispatchers: SetStateDispatchers;
  otherDispatchers: OtherStateDispatchers;
}

export function useApplyServerState(deps: ApplyServerStateDeps) {
  const {
    stateRef,
    pendingAddedRef,
    pendingRemovedRef,
    pendingTagChangedRef,
    pendingTagRemovedRef,
    dispatchers,
    otherDispatchers,
  } = deps;
  const {
    read: setReadIds,
    bookmarks: setBookmarkIds,
    readingList: setReadingListIds,
    likes: setLikeIds,
  } = dispatchers;
  const {
    setGlobalFilterState,
    setTtlDaysState,
    setReadBeforeTimestamp,
    setSnoozedUntil,
    setNotesState,
    setTagIdsState,
  } = otherDispatchers;

  const lastServerSyncRef = useRef<number>(0);

  const applyServerState = useCallback(
    (state: ReadState) => {
      lastServerSyncRef.current = Date.now();
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

      // Set 系: computeMergedSet で純粋計算し、変更があれば setState と deferSaveSet を呼ぶ
      // （setState コールバック内での副作用を排除して React Strict Mode の二重実行に対応）
      const mergedRead = computeMergedSet(localSets.read, state.readIds);
      if (mergedRead) {
        setReadIds(mergedRead);
        deferSaveSet(STORAGE_KEYS.READ_IDS, mergedRead);
      }
      const mergedBookmarks = computeMergedSet(localSets.bookmarks, state.bookmarkIds);
      if (mergedBookmarks) {
        setBookmarkIds(mergedBookmarks);
        deferSaveSet(STORAGE_KEYS.BOOKMARK_IDS, mergedBookmarks);
      }
      const mergedReadingList = computeMergedSet(localSets.readingList, state.readingListIds);
      if (mergedReadingList) {
        setReadingListIds(mergedReadingList);
        deferSaveSet(STORAGE_KEYS.READING_LIST_IDS, mergedReadingList);
      }
      const mergedLikes = computeMergedSet(localSets.likes, state.likeIds);
      if (mergedLikes) {
        setLikeIds(mergedLikes);
        deferSaveSet(STORAGE_KEYS.LIKE_IDS, mergedLikes);
      }

      // `"field" in state` チェックの意図:
      // ReadState の optional フィールドは R2 古データとの後方互換性のため省略可能。
      //   - フィールドが存在しない（undefined）→ 古いデータ形式 → ローカル状態を上書きしない
      //   - フィールドが存在して null   → 明示的なクリア操作 → ローカル状態を null にリセット
      // この区別により、別デバイスでの設定変更と古いデータ形式の両方を正しく扱える。
      if ("globalFilter" in state) {
        const serverFilter = state.globalFilter ?? null;
        saveJson(STORAGE_KEYS.GLOBAL_FILTER, serverFilter);
        setGlobalFilterState(serverFilter);
      }
      if ("ttlDays" in state) {
        const ttl = state.ttlDays ?? null;
        storageSet(STORAGE_KEYS.TTL_DAYS, ttl === null ? "" : String(ttl));
        setTtlDaysState(ttl);
      }
      if ("readBeforeTimestamp" in state && state.readBeforeTimestamp) {
        const rbt = state.readBeforeTimestamp;
        const prev = stateRef.current.readBeforeTimestamp;
        const next = !prev || rbt > prev ? rbt : prev;
        if (next !== prev) {
          storageSet(STORAGE_KEYS.READ_BEFORE_TIMESTAMP, next);
          setReadBeforeTimestamp(next);
        }
      }
      if ("snoozedUntil" in state && state.snoozedUntil) {
        const snoozed = state.snoozedUntil;
        const result: Record<string, string> = { ...snoozed };
        for (const [id, until] of Object.entries(stateRef.current.snoozedUntil)) {
          if (!result[id] || until > result[id]) result[id] = until;
        }
        const merged = pruneExpiredSnoozes(result);
        // #686: 内容変化なしなら setState を skip して reference を保持する。
        // useFilteredArticles の structuralFiltered useMemo が snoozedUntil を依存に
        // 持つため、reference 不安定だと 2 秒毎に全記事フィルター再実行になっていた。
        if (!equalSnoozedUntil(stateRef.current.snoozedUntil, merged)) {
          saveJson(STORAGE_KEYS.SNOOZED_UNTIL, merged);
          setSnoozedUntil(merged);
        }
      }
      if ("notes" in state) {
        const merged = { ...stateRef.current.notes, ...(state.notes ?? {}) };
        // #686 同等の構造的等価性ガード: 内容変化なしなら setState を skip し
        // reference を保持する。useFilteredArticles の noteIds useMemo が notes を
        // 依存に持つため、reference 不安定だと 2 秒毎の同期で全記事フィルター pass
        // が再走していた。
        if (!equalNotes(stateRef.current.notes, merged)) {
          saveJson(STORAGE_KEYS.NOTES, merged);
          setNotesState(merged);
        }
      }
      if ("tagIds" in state) {
        const serverTags = state.tagIds ?? {};
        const prev = stateRef.current.tagIds;
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
        // #686 同等の構造的等価性ガード: tagIds は記事フィルター・タグ別ビュー等の
        // useMemo が依存するため、reference 不安定だと 2 秒毎の同期で再計算が走る。
        if (!equalTagIds(prev, result)) {
          saveJson(STORAGE_KEYS.TAGS, result);
          setTagIdsState(result);
        }
      }
    },
    // Ref オブジェクト（stateRef, pendingAddedRef 等）は useRef の安定参照のため deps 不要。
    // stateRef.current.* へのアクセスは applyServerState 呼び出し時の最新値参照のみに使用。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      setReadIds,
      setBookmarkIds,
      setReadingListIds,
      setLikeIds,
      setGlobalFilterState,
      setTtlDaysState,
      setReadBeforeTimestamp,
      setSnoozedUntil,
      setNotesState,
      setTagIdsState,
    ],
  );

  return { applyServerState, lastServerSyncRef };
}
