import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useRecommendationDismissals } from "./useRecommendationDismissals";
import { STORAGE_KEYS } from "../lib/storage";

const NOW = Date.parse("2026-09-30T12:00:00Z");
const key = (userId: string) => `${STORAGE_KEYS.ARTICLE_RECOMMENDATION_DISMISSALS}:${userId}`;
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useRecommendationDismissals", () => {
  it("dismisses only the selected article, persists, and can undo", () => {
    const { result, unmount } = renderHook(() => useRecommendationDismissals("one"));
    act(() => result.current.dismiss("article"));
    expect(result.current.dismissedIds.has("article")).toBe(true);
    expect(result.current.dismissedIds.has("another")).toBe(false);
    unmount();
    const restored = renderHook(() => useRecommendationDismissals("one"));
    expect(restored.result.current.dismissedIds.has("article")).toBe(true);
    act(() => restored.result.current.restore("article"));
    expect(restored.result.current.dismissedIds.size).toBe(0);
    expect(JSON.parse(localStorage.getItem(key("one")) ?? "null")).toEqual([]);
  });
  it("isolates account switches and never copies old entries to the new account", () => {
    const { result, rerender } = renderHook(({ userId }) => useRecommendationDismissals(userId), {
      initialProps: { userId: "one" },
    });
    act(() => result.current.dismiss("one-only"));
    rerender({ userId: "two" });
    expect(result.current.dismissedIds.size).toBe(0);
    act(() => result.current.dismiss("two-only"));
    rerender({ userId: "one" });
    expect([...result.current.dismissedIds]).toEqual(["one-only"]);
    expect(JSON.parse(localStorage.getItem(key("two")) ?? "null")).toEqual([
      { articleId: "two-only", dismissedAt: NOW },
    ]);
  });
  it.each(["{broken", "null", "{}", '[null,{},1,{"articleId":3,"dismissedAt":0}]'])(
    "tolerates corrupt storage: %s",
    (raw) => {
      localStorage.setItem(key("one"), raw);
      const { result } = renderHook(() => useRecommendationDismissals("one"));
      expect(result.current.dismissedIds.size).toBe(0);
    },
  );
  it("ignores expired/future timestamps and caps restored data at 200", () => {
    localStorage.setItem(
      key("one"),
      JSON.stringify([
        { articleId: "expired", dismissedAt: NOW - 30 * 86400000 },
        { articleId: "future", dismissedAt: NOW + 1 },
        ...Array.from({ length: 205 }, (_, i) => ({ articleId: `a${i}`, dismissedAt: NOW - i })),
      ]),
    );
    const { result } = renderHook(() => useRecommendationDismissals("one"));
    expect(result.current.dismissedIds.size).toBe(200);
    expect(result.current.dismissedIds.has("expired")).toBe(false);
    expect(result.current.dismissedIds.has("future")).toBe(false);
    act(() => result.current.dismiss("new"));
    expect(result.current.dismissedIds.size).toBe(200);
    expect(result.current.dismissedIds.has("a199")).toBe(false);
    expect(JSON.parse(localStorage.getItem(key("one")) ?? "[]")).toHaveLength(200);
  });
  it("reset restores all dismissed articles", () => {
    const { result } = renderHook(() => useRecommendationDismissals("one"));
    act(() => {
      result.current.dismiss("a");
      result.current.dismiss("b");
    });
    act(() => result.current.reset());
    expect(result.current.dismissedIds.size).toBe(0);
  });
  it("preserves another tab's feedback and responds to storage changes", () => {
    const first = renderHook(() => useRecommendationDismissals("one"));
    const second = renderHook(() => useRecommendationDismissals("one"));
    act(() => first.result.current.dismiss("a"));
    act(() => second.result.current.dismiss("b"));
    expect(
      JSON.parse(localStorage.getItem(key("one")) ?? "[]").map(
        (entry: { articleId: string }) => entry.articleId,
      ),
    ).toEqual(["b", "a"]);
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: key("one") })));
    expect([...first.result.current.dismissedIds]).toEqual(["b", "a"]);
    act(() => first.result.current.restore("a"));
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: key("one") })));
    expect([...second.result.current.dismissedIds]).toEqual(["b"]);
    act(() => second.result.current.reset());
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: key("one") })));
    expect(first.result.current.dismissedIds.size).toBe(0);
  });
  it("keeps the Set stable across ordinary renders and expires on its TTL boundary", () => {
    localStorage.setItem(
      key("one"),
      JSON.stringify([{ articleId: "expiring", dismissedAt: NOW - 30 * 86400000 + 2000 }]),
    );
    const { result, rerender } = renderHook(() => useRecommendationDismissals("one"));
    const before = result.current.dismissedIds;
    act(() => vi.advanceTimersByTime(100));
    rerender();
    expect(result.current.dismissedIds).toBe(before);
    act(() => vi.advanceTimersByTime(1901));
    expect(result.current.dismissedIds.size).toBe(0);
  });
});
