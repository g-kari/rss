import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { topicPreferenceStorageKey, useRecommendationTopics } from "./useRecommendationTopics";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const more = { topic: "unity", label: "Unity", value: "more" };

describe("local topic feedback", () => {
  it("persists account-scoped choices, supports undo, individual reset and reversible reset-all", () => {
    const { result } = renderHook(() => useRecommendationTopics("one"));
    act(() => result.current.update("Unity", "more"));
    expect(result.current.preferences).toEqual([more]);
    expect(localStorage.getItem(topicPreferenceStorageKey("one"))).toBe(JSON.stringify([more]));
    act(() => result.current.update("Unity", "less"));
    expect(result.current.preferences[0].value).toBe("less");
    act(() => result.current.undo());
    expect(result.current.preferences).toEqual([more]);
    act(() => result.current.update("Unity", null));
    expect(result.current.preferences).toEqual([]);
    act(() => result.current.undo());
    expect(result.current.preferences).toEqual([more]);
    act(() => result.current.reset());
    expect(result.current.preferences).toEqual([]);
    act(() => result.current.undo());
    expect(result.current.preferences).toEqual([more]);
  });
  it("isolates changed accounts and refuses stale callbacks", () => {
    const { result, rerender } = renderHook(({ userId }) => useRecommendationTopics(userId), {
      initialProps: { userId: "one" },
    });
    act(() => result.current.update("Unity", "more"));
    const oldUpdate = result.current.update;
    rerender({ userId: "two" });
    expect(result.current.preferences).toEqual([]);
    expect(result.current.canUndo).toBe(false);
    act(() => oldUpdate("AI", "less"));
    expect(localStorage.getItem(topicPreferenceStorageKey("two"))).toBeNull();
    rerender({ userId: "one" });
    expect(result.current.preferences).toEqual([more]);
  });
  it("synchronizes sibling instances and cross-tab changes, including clear", () => {
    const first = renderHook(() => useRecommendationTopics("one"));
    const second = renderHook(() => useRecommendationTopics("one"));
    act(() => first.result.current.update("Unity", "more"));
    expect(second.result.current.preferences).toEqual([more]);
    localStorage.setItem(
      topicPreferenceStorageKey("one"),
      JSON.stringify([{ ...more, value: "less" }]),
    );
    act(() =>
      window.dispatchEvent(new StorageEvent("storage", { key: topicPreferenceStorageKey("one") })),
    );
    expect(first.result.current.preferences[0].value).toBe("less");
    expect(first.result.current.canUndo).toBe(false);
    localStorage.clear();
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: null })));
    expect(first.result.current.preferences).toEqual([]);
    expect(second.result.current.preferences).toEqual([]);
  });
  it("does not clobber a newer tab choice when old undo is clicked", () => {
    const { result } = renderHook(() => useRecommendationTopics("one"));
    act(() => result.current.update("Unity", "more"));
    localStorage.setItem(
      topicPreferenceStorageKey("one"),
      JSON.stringify([{ ...more, value: "less" }]),
    );
    let restored: boolean | undefined;
    act(() => {
      restored = result.current.undo();
    });
    expect(restored).toBe(false);
    expect(result.current.preferences[0].value).toBe("less");
    expect(result.current.canUndo).toBe(false);
  });
  it("merges newest saved choices, keeps 64 bounded entries and never sends requests", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const { result } = renderHook(() => useRecommendationTopics("one"));
    localStorage.setItem(topicPreferenceStorageKey("one"), JSON.stringify([more]));
    act(() => result.current.update("AI", "less"));
    expect(result.current.preferences.map((entry) => entry.topic)).toEqual(["ai", "unity"]);
    for (let index = 0; index < 80; index++)
      act(() => result.current.update(`tag-${index}`, "more"));
    expect(result.current.preferences).toHaveLength(64);
    expect(result.current.preferences[0].topic).toBe("tag-79");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("handles malformed storage and quota failures without losing session undo", () => {
    localStorage.setItem(topicPreferenceStorageKey("one"), "null");
    const { result } = renderHook(() => useRecommendationTopics("one"));
    expect(result.current.preferences).toEqual([]);
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    act(() => result.current.update("Unity", "more"));
    expect(result.current.persisted).toBe(false);
    act(() => result.current.update("AI", "less"));
    expect(result.current.preferences).toHaveLength(2);
    act(() => result.current.undo());
    expect(result.current.preferences).toEqual([more]);
    act(() => window.dispatchEvent(new Event("focus")));
    expect(result.current.preferences).toEqual([more]);
  });
  it("preserves undo on a focus refresh with identical saved choices", () => {
    const { result } = renderHook(() => useRecommendationTopics("one"));
    act(() => result.current.update("Unity", "more"));
    act(() => window.dispatchEvent(new Event("focus")));
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.preferences).toEqual([]);
  });
});
