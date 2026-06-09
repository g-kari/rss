/**
 * useReadStateSyncFlush の in-flight ガード spec。
 *
 * flushToServer は await saveReadState の最中に online / visibilitychange / beforeunload 経由で
 * 2 回目が並行起動しうる。並行 flush は prepareFlush が pending を全リセット済の状態で失敗パスの
 * restorePending が別 flush のリセット済 ref に古い id を重複混入させる race を生む。
 * isFlushingRef ガードで「in-flight 中は 1 度だけ再 flush を予約」する挙動を固定する。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRef, type MutableRefObject, type RefObject } from "react";
import { useReadStateSyncFlush, type FlushDeps } from "./useReadStateSyncFlush";
import type { ReadStateSets } from "./useReadStatePersistence";
import type { ReadState, KeywordFilter } from "../types";

type SaveResult = { ok: boolean; state?: ReadState };

let pendingResolvers: Array<(v: SaveResult) => void> = [];

vi.mock("../lib/read-state-sync-api", () => ({
  saveReadState: vi.fn(
    () =>
      new Promise<SaveResult>((resolve) => {
        pendingResolvers.push(resolve);
      }),
  ),
  fetchReadState: vi.fn(() => Promise.resolve(null)),
}));

import { saveReadState } from "../lib/read-state-sync-api";

function emptyPending() {
  return {
    read: new Set<string>(),
    bookmarks: new Set<string>(),
    readingList: new Set<string>(),
    likes: new Set<string>(),
  };
}

function setup() {
  const { result } = renderHook(() => {
    const stateRef = useRef<ReadStateSets>({
      read: new Set(),
      bookmarks: new Set(),
      readingList: new Set(),
      likes: new Set(),
      readBeforeTimestamp: null,
      snoozedUntil: {},
      notes: {},
      tagIds: {},
      ttlDays: null,
    });
    const deps: FlushDeps = {
      user: { sub: "user-1" },
      stateRef: stateRef as MutableRefObject<ReadStateSets>,
      globalFilterRef: useRef<KeywordFilter | null>(null) as RefObject<KeywordFilter | null>,
      applyServerState: vi.fn(),
      lastServerSyncRef: useRef(0),
      pendingAddedRef: useRef(emptyPending()),
      pendingRemovedRef: useRef(emptyPending()),
      pendingTagChangedRef: useRef<Set<string>>(new Set()),
      pendingTagRemovedRef: useRef<Set<string>>(new Set()),
      pendingNotesChangedRef: useRef<Set<string>>(new Set()),
      pendingNotesRemovedRef: useRef<Set<string>>(new Set()),
      globalFilterDirtyRef: useRef(false),
    };
    return useReadStateSyncFlush(deps);
  });
  return result;
}

describe("useReadStateSyncFlush — in-flight ガード", () => {
  beforeEach(() => {
    pendingResolvers = [];
    vi.mocked(saveReadState).mockClear();
    vi.useFakeTimers();
  });

  it("in-flight 中の 2 回目 syncImmediately は saveReadState を並行起動しない", async () => {
    const result = setup();

    // 1 回目: dirty にして syncImmediately → setTimeout(0) で flushToServer 起動
    act(() => {
      result.current.scheduleSyncToServer();
      result.current.syncImmediately();
      vi.advanceTimersByTime(1);
    });
    expect(saveReadState).toHaveBeenCalledTimes(1); // 1 回目開始 (await で停止中)

    // await 中に 2 回目 syncImmediately (online / visibilitychange を模擬)
    act(() => {
      result.current.scheduleSyncToServer();
      result.current.syncImmediately();
      vi.advanceTimersByTime(1);
    });
    expect(saveReadState).toHaveBeenCalledTimes(1); // in-flight ガードで並行起動しない

    // 1 回目を解決 → flushAgain が再 flush して 2 回目が走る
    await act(async () => {
      pendingResolvers[0]?.({ ok: true, state: undefined });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(saveReadState).toHaveBeenCalledTimes(2); // 完了後に予約された再 flush
  });

  it("単発 flush は通常通り 1 回 saveReadState を呼ぶ", async () => {
    const result = setup();
    act(() => {
      result.current.scheduleSyncToServer();
      result.current.syncImmediately();
      vi.advanceTimersByTime(1);
    });
    expect(saveReadState).toHaveBeenCalledTimes(1);
    await act(async () => {
      pendingResolvers[0]?.({ ok: true, state: undefined });
      await Promise.resolve();
    });
    // 再 flush 予約なし → 1 回のまま
    expect(saveReadState).toHaveBeenCalledTimes(1);
  });
});
