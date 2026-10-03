import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { useReadStateSyncFlush, type FlushDeps } from "./useReadStateSyncFlush";
import { emptyPendingSets } from "../lib/read-state-storage";
import { STORAGE_KEYS, storageGet } from "../lib/storage";
import type { ReadStateSets } from "./useReadStatePersistence";
import type { KeywordFilter, ReadState } from "../types";

interface SaveResult {
  ok: boolean;
  state?: ReadState;
}

let pendingResolvers: Array<(result: SaveResult) => void> = [];

vi.mock("../lib/read-state-sync-api", () => ({
  saveReadState: vi.fn(
    () =>
      new Promise<SaveResult>((resolve) => {
        pendingResolvers.push(resolve);
      }),
  ),
  fetchReadState: vi.fn(() => Promise.resolve(null)),
}));

import { fetchReadState, saveReadState } from "../lib/read-state-sync-api";

const serverState: ReadState = {
  readIds: ["read-1"],
  bookmarkIds: ["bookmark-1"],
  readingListIds: ["later-1"],
  likeIds: ["like-1"],
};

function setup() {
  return renderHook(() => {
    const applyServerState = useRef(vi.fn()).current;
    const stateRef = useRef<ReadStateSets>({
      read: new Set(["read-1"]),
      bookmarks: new Set(["bookmark-1"]),
      readingList: new Set(["later-1"]),
      likes: new Set(["like-1"]),
      readBeforeTimestamp: null,
      snoozedUntil: {},
      notes: { "note-1": "Offline note" },
      tagIds: { "tag-1": ["local"] },
      ttlDays: null,
    });
    const deps: FlushDeps = {
      user: { sub: "synthetic-user" },
      stateRef,
      globalFilterRef: useRef<KeywordFilter | null>(null),
      applyServerState,
      lastServerSyncRef: useRef(0),
      pendingAddedRef: useRef(emptyPendingSets()),
      pendingRemovedRef: useRef(emptyPendingSets()),
      pendingTagChangedRef: useRef(new Set<string>()),
      pendingTagRemovedRef: useRef(new Set<string>()),
      pendingNotesChangedRef: useRef(new Set<string>()),
      pendingNotesRemovedRef: useRef(new Set<string>()),
      globalFilterDirtyRef: useRef(false),
    };
    return { sync: useReadStateSyncFlush(deps), deps };
  });
}

type SetupResult = ReturnType<typeof setup>["result"];

function startFlush(result: SetupResult) {
  act(() => {
    const { deps, sync } = result.current;
    for (const kind of ["read", "bookmarks", "readingList", "likes"] as const) {
      for (const id of deps.stateRef.current[kind]) deps.pendingAddedRef.current[kind].add(id);
      deps.pendingRemovedRef.current[kind].add(`removed-${kind}`);
    }
    deps.pendingTagChangedRef.current.add("tag-1");
    deps.pendingTagRemovedRef.current.add("removed-tag");
    deps.pendingNotesChangedRef.current.add("note-1");
    deps.pendingNotesRemovedRef.current.add("removed-note");
    deps.globalFilterDirtyRef.current = true;
    sync.scheduleSyncToServer();
    sync.syncImmediately();
    vi.advanceTimersByTime(1);
  });
}

async function resolveSave(index: number, result: SaveResult) {
  await act(async () => {
    pendingResolvers[index]?.(result);
    await Promise.resolve();
  });
}

describe("failed read-state sync recovery", () => {
  beforeEach(() => {
    pendingResolvers = [];
    vi.mocked(saveReadState).mockClear();
    vi.mocked(fetchReadState).mockClear();
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it.each(["online", "immediate", "hidden", "visible"] as const)(
    "retries the complete failed payload on %s without another edit",
    async (trigger) => {
      const { result } = setup();
      startFlush(result);
      expect(saveReadState).toHaveBeenCalledTimes(1);
      const originalBody = vi.mocked(saveReadState).mock.calls[0]?.[0];
      await resolveSave(0, { ok: false });
      expect(result.current.sync.hasPendingChanges).toBe(true);

      act(() => {
        if (trigger === "online") window.dispatchEvent(new Event("online"));
        else if (trigger === "immediate") result.current.sync.syncImmediately();
        else {
          vi.spyOn(document, "visibilityState", "get").mockReturnValue(
            trigger === "hidden" ? "hidden" : "visible",
          );
          document.dispatchEvent(new Event("visibilitychange"));
        }
        vi.advanceTimersByTime(1);
      });

      expect(saveReadState).toHaveBeenCalledTimes(2);
      expect(vi.mocked(saveReadState).mock.calls[1]?.[0]).toBe(originalBody);
      await resolveSave(1, { ok: true, state: serverState });
      expect(result.current.sync.hasPendingChanges).toBe(false);
      act(() => window.dispatchEvent(new Event("online")));
      expect(saveReadState).toHaveBeenCalledTimes(2);
    },
  );

  it("backs up a restored failed payload on unload when a beacon is unavailable", async () => {
    const { result } = setup();
    const beacon = vi.spyOn(navigator, "sendBeacon").mockReturnValue(false);
    startFlush(result);
    const originalBody = vi.mocked(saveReadState).mock.calls[0]?.[0];
    await resolveSave(0, { ok: false });
    act(() => window.dispatchEvent(new Event("beforeunload")));

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(storageGet(STORAGE_KEYS.BEACON_OVERFLOW)).toBe(originalBody);
    expect(result.current.deps.pendingRemovedRef.current.bookmarks).toContain("removed-bookmarks");
  });

  it("keeps the unsynced indicator while a newer edit waits for the next flush", async () => {
    const { result } = setup();
    startFlush(result);
    act(() => {
      result.current.deps.stateRef.current.bookmarks.add("bookmark-2");
      result.current.deps.pendingAddedRef.current.bookmarks.add("bookmark-2");
      result.current.sync.scheduleSyncToServer();
    });
    await resolveSave(0, { ok: true, state: serverState });
    expect(result.current.sync.hasPendingChanges).toBe(true);
    act(() => vi.advanceTimersByTime(5000));
    expect(saveReadState).toHaveBeenCalledTimes(2);
    expect(JSON.parse(vi.mocked(saveReadState).mock.calls[1]?.[0] ?? "{}").bookmarkIds).toEqual([
      "bookmark-2",
    ]);
    await resolveSave(1, { ok: true, state: serverState });
    expect(result.current.sync.hasPendingChanges).toBe(false);
  });

  it("does not merge a stale GET while a recovery POST is in flight", async () => {
    const { result } = setup();
    startFlush(result);
    await resolveSave(0, { ok: false });
    expect(fetchReadState).toHaveBeenCalledTimes(1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(1);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(saveReadState).toHaveBeenCalledTimes(2);
    expect(fetchReadState).toHaveBeenCalledTimes(1);
    await resolveSave(1, { ok: true, state: serverState });
    expect(result.current.sync.hasPendingChanges).toBe(false);
  });

  it("consumes recovery eligibility when a queued continuation saves all restored work", async () => {
    const { result } = setup();
    startFlush(result);
    act(() => {
      result.current.deps.stateRef.current.bookmarks.add("bookmark-2");
      result.current.deps.pendingAddedRef.current.bookmarks.add("bookmark-2");
      result.current.sync.scheduleSyncToServer();
      result.current.sync.syncImmediately();
      vi.advanceTimersByTime(1);
    });
    expect(saveReadState).toHaveBeenCalledTimes(1);
    await resolveSave(0, { ok: false });
    expect(saveReadState).toHaveBeenCalledTimes(2);
    expect(result.current.sync.hasPendingChanges).toBe(true);
    expect(JSON.parse(vi.mocked(saveReadState).mock.calls[1]?.[0] ?? "{}").bookmarkIds).toEqual([
      "bookmark-2",
      "bookmark-1",
    ]);
    await resolveSave(1, { ok: true, state: serverState });
    expect(result.current.sync.hasPendingChanges).toBe(false);
    act(() => {
      window.dispatchEvent(new Event("online"));
      vi.advanceTimersByTime(60_000);
    });
    expect(saveReadState).toHaveBeenCalledTimes(2);
  });

  it("consumes an older debounce but preserves edits made during the recovery continuation", async () => {
    const { result } = setup();
    startFlush(result);
    act(() => {
      result.current.sync.scheduleSyncToServer();
      result.current.sync.syncImmediately();
      vi.advanceTimersByTime(1);
      result.current.deps.stateRef.current.bookmarks.add("bookmark-2");
      result.current.deps.pendingAddedRef.current.bookmarks.add("bookmark-2");
      result.current.sync.scheduleSyncToServer();
    });
    await resolveSave(0, { ok: false });
    expect(saveReadState).toHaveBeenCalledTimes(2);
    act(() => {
      result.current.deps.stateRef.current.bookmarks.add("bookmark-3");
      result.current.deps.pendingAddedRef.current.bookmarks.add("bookmark-3");
      result.current.sync.scheduleSyncToServer();
    });
    await resolveSave(1, { ok: true, state: serverState });
    expect(result.current.sync.hasPendingChanges).toBe(true);
    act(() => vi.advanceTimersByTime(5000));
    expect(saveReadState).toHaveBeenCalledTimes(3);
    expect(JSON.parse(vi.mocked(saveReadState).mock.calls[2]?.[0] ?? "{}").bookmarkIds).toEqual([
      "bookmark-3",
    ]);
    await resolveSave(2, { ok: true, state: serverState });
    expect(result.current.sync.hasPendingChanges).toBe(false);
    act(() => window.dispatchEvent(new Event("online")));
    expect(saveReadState).toHaveBeenCalledTimes(3);
  });

  it("uses an accepted beacon without retaining an overflow backup", async () => {
    const { result } = setup();
    const beacon = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    startFlush(result);
    await resolveSave(0, { ok: false });
    act(() => window.dispatchEvent(new Event("beforeunload")));
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(storageGet(STORAGE_KEYS.BEACON_OVERFLOW)).toBeNull();
    expect(result.current.deps.pendingRemovedRef.current.bookmarks.size).toBe(0);
  });

  it("does not poll or start parallel requests after failure and repeated reconnects", async () => {
    const { result } = setup();
    startFlush(result);
    await resolveSave(0, { ok: false });
    act(() => vi.advanceTimersByTime(60_000));
    expect(saveReadState).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("online"));
    });
    expect(saveReadState).toHaveBeenCalledTimes(2);
    await resolveSave(1, { ok: false });
    act(() => vi.advanceTimersByTime(60_000));
    expect(saveReadState).toHaveBeenCalledTimes(2);
    expect(result.current.sync.hasPendingChanges).toBe(true);
  });
});
