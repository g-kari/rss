/**
 * useReadStateToggles の spec。
 *
 * correctness 監査 finding: 孤立 removal (先行 add/schedule なし) は recordRemoval が
 * syncImmediately のみ呼んでいたため、`syncImmediately` の `if (!isDirty && timer===null) return`
 * ガードで early-return され、削除がサーバーに送信されないまま滞留していた。removal でも
 * scheduleSyncRef (dirty を立てる) を呼んでから syncImmediately する修正を固定する。
 */
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRef, type Dispatch, type SetStateAction } from "react";
import { useReadStateToggles, type ToggleDeps } from "./useReadStateToggles";
import type { PendingSets } from "../lib/read-state-storage";
import type { ReadStateSets } from "./useReadStatePersistence";

let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    },
    configurable: true,
  });
});

function emptyPending(): PendingSets {
  return {
    read: new Set(),
    bookmarks: new Set(),
    readingList: new Set(),
    likes: new Set(),
  };
}

function makeStateSets(read: Set<string>): ReadStateSets {
  return {
    read,
    bookmarks: new Set(),
    readingList: new Set(),
    likes: new Set(),
    readBeforeTimestamp: null,
    snoozedUntil: {},
    notes: {},
    tagIds: {},
    ttlDays: null,
  };
}

/** deps を組み立てて renderHook するヘルパー。schedule / immediate は vi.fn で観測する。 */
function renderToggles(currentRead: Set<string>): {
  result: { current: ReturnType<typeof useReadStateToggles> };
  schedule: Mock;
  immediate: Mock;
} {
  const schedule = vi.fn();
  const immediate = vi.fn();
  const noopSetter: Dispatch<SetStateAction<Set<string>>> = () => {};
  const { result } = renderHook(() => {
    const stateRef = useRef<ReadStateSets>(makeStateSets(currentRead));
    const pendingAddedRef = useRef<PendingSets>(emptyPending());
    const pendingRemovedRef = useRef<PendingSets>(emptyPending());
    const scheduleSyncRef = useRef<() => void>(schedule);
    const syncImmediatelyRef = useRef<() => void>(immediate);
    const deps: ToggleDeps = {
      setReadIds: noopSetter,
      setBookmarkIds: noopSetter,
      setReadingListIds: noopSetter,
      setLikeIds: noopSetter,
      stateRef,
      pendingAddedRef,
      pendingRemovedRef,
      scheduleSyncRef,
      syncImmediatelyRef,
    };
    return useReadStateToggles(deps);
  });
  return { result, schedule, immediate };
}

describe("useReadStateToggles", () => {
  it("add (未登録 id) は schedule のみ呼び immediate は呼ばない", () => {
    const { result, schedule, immediate } = renderToggles(new Set());
    act(() => result.current.toggleRead("a1"));
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(immediate).not.toHaveBeenCalled();
  });

  it("removal (登録済 id) は schedule (dirty) と immediate の両方を呼ぶ", () => {
    // 孤立 removal でも dirty を立ててから即時 flush する (early-return 滞留バグの回帰防止)
    const { result, schedule, immediate } = renderToggles(new Set(["a1"]));
    act(() => result.current.toggleRead("a1"));
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(immediate).toHaveBeenCalledTimes(1);
  });
});
