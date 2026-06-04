/**
 * useReadStateActions の markAllReadWithUndo 差分復元 spec (#1086)。
 *
 * 旧実装は undo で read Set / pending-ref を丸ごと上書きしていたため、undo toast window 中の
 * 別操作 (別記事の既読化) が失われていた。markAllRead が今回追加した addedIds だけを
 * 差分巻き戻しすることで window 中の操作を保持することを固定する。
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRef, type Dispatch, type SetStateAction } from "react";
import { useReadStateActions, type ReadStateActionDeps } from "./useReadStateActions";
import type { ReadStateSets } from "./useReadStatePersistence";
import type { Article } from "../types";
import type { ToastApi } from "./useToast";

function makeArticle(id: string): Article {
  return { id } as Article;
}

function emptyPending() {
  return {
    read: new Set<string>(),
    bookmarks: new Set<string>(),
    readingList: new Set<string>(),
    likes: new Set<string>(),
  };
}

interface Harness {
  result: { current: ReturnType<typeof useReadStateActions> };
  toast: ToastApi;
  getRead: () => Set<string>;
  getPendingAdded: () => Set<string>;
  getPendingRemoved: () => Set<string>;
  /** toast.undo に渡された callback を発火する */
  fireUndo: () => void;
}

function setup(articles: Article[], initialRead: string[] = []): Harness {
  let captured: (() => void) | null = null;
  const toast: ToastApi = {
    toasts: [],
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    undo: (_msg, onUndo) => {
      captured = onUndo;
    },
    dismiss: vi.fn(),
  };
  let read = new Set<string>(initialRead);
  const noop = () => {};
  const refs: {
    stateRef: { current: ReadStateSets };
    pendingAddedRef: { current: ReturnType<typeof emptyPending> };
    pendingRemovedRef: { current: ReturnType<typeof emptyPending> };
  } = { stateRef: null!, pendingAddedRef: null!, pendingRemovedRef: null! };

  const { result } = renderHook(() => {
    const stateRef = useRef<ReadStateSets>({
      read,
      bookmarks: new Set(),
      readingList: new Set(),
      likes: new Set(),
      readBeforeTimestamp: null,
      snoozedUntil: {},
      notes: {},
      tagIds: {},
      ttlDays: null,
    });
    const pendingAddedRef = useRef(emptyPending());
    const pendingRemovedRef = useRef(emptyPending());
    const globalFilterDirtyRef = useRef(false);
    const scheduleSyncRef = useRef<() => void>(() => {});

    const setReadIds: Dispatch<SetStateAction<Set<string>>> = (action) => {
      read = typeof action === "function" ? action(read) : action;
      stateRef.current.read = read;
    };

    refs.stateRef = stateRef;
    refs.pendingAddedRef = pendingAddedRef;
    refs.pendingRemovedRef = pendingRemovedRef;

    const deps: ReadStateActionDeps = {
      articles,
      historyIds: undefined,
      stateRef,
      setReadIds,
      setReadBeforeTimestamp: noop,
      setSnoozedUntil: noop,
      setNotesState: noop,
      setGlobalFilterState: noop,
      setTtlDaysState: noop,
      pendingAddedRef,
      pendingRemovedRef,
      globalFilterDirtyRef,
      scheduleSyncRef,
    };
    return useReadStateActions(deps);
  });

  return {
    result,
    toast,
    getRead: () => refs.stateRef.current.read,
    getPendingAdded: () => refs.pendingAddedRef.current.read,
    getPendingRemoved: () => refs.pendingRemovedRef.current.read,
    fireUndo: () => {
      if (!captured) throw new Error("toast.undo が呼ばれていない");
      act(() => captured!());
    },
  };
}

describe("useReadStateActions#markAllReadWithUndo (差分復元 #1086)", () => {
  it("全既読 → undo (window 中操作なし) で全 addedId が巻き戻る", () => {
    const h = setup([makeArticle("a1"), makeArticle("a2"), makeArticle("a3")]);
    act(() => h.result.current.markAllReadWithUndo(null, h.toast));
    expect([...h.getRead()].sort()).toEqual(["a1", "a2", "a3"]);
    expect([...h.getPendingAdded()].sort()).toEqual(["a1", "a2", "a3"]);

    h.fireUndo();
    expect([...h.getRead()]).toEqual([]);
    expect([...h.getPendingAdded()]).toEqual([]);
  });

  it("undo window 中に別記事を既読化した変更は undo 後も保持される", () => {
    const h = setup([makeArticle("a1"), makeArticle("a2")]);
    act(() => h.result.current.markAllReadWithUndo(null, h.toast));

    // window 中: 別記事 x99 をユーザーが既読化 (markRead 相当)
    act(() => h.result.current.markRead("x99"));
    expect(h.getRead().has("x99")).toBe(true);
    expect(h.getPendingAdded().has("x99")).toBe(true);

    h.fireUndo();
    // markAll の a1/a2 は巻き戻るが、window 中の x99 は保持される (旧実装では丸ごと上書きで消えていた)
    expect(h.getRead().has("a1")).toBe(false);
    expect(h.getRead().has("a2")).toBe(false);
    expect(h.getRead().has("x99")).toBe(true);
    expect(h.getPendingAdded().has("x99")).toBe(true);
    expect(h.getPendingAdded().has("a1")).toBe(false);
  });

  it("既に既読だった id は markAll の addedId に含まれず undo で巻き戻らない", () => {
    const h = setup([makeArticle("a1"), makeArticle("a2")], ["a1"]);
    act(() => h.result.current.markAllReadWithUndo(null, h.toast));
    // a1 は元々既読 → addedId は a2 のみ
    expect(h.getPendingAdded().has("a1")).toBe(false);
    expect(h.getPendingAdded().has("a2")).toBe(true);

    h.fireUndo();
    // a1 は元々既読なので undo 後も既読のまま、a2 のみ巻き戻る
    expect(h.getRead().has("a1")).toBe(true);
    expect(h.getRead().has("a2")).toBe(false);
  });
});
