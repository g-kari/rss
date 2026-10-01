import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDelayedGalleryItems } from "./useDelayedGalleryItems";
const getId = (id: string) => id;
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("useDelayedGalleryItems motion policy", () => {
  it("removes items immediately and schedules no presentation timers in instant mode", () => {
    const { result, rerender } = renderHook(
      ({ items, motion }) => useDelayedGalleryItems(items, getId, 250, motion),
      { initialProps: { items: ["a", "b"], motion: false } },
    );
    rerender({ items: ["b"], motion: false });
    expect(result.current.displayItems).toEqual(["b"]);
    expect(result.current.deletingIds.size).toBe(0);
    expect(result.current.newIds.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("retains the bounded visual exit but finishes immediately when motion is disabled", () => {
    const { result, rerender } = renderHook(
      ({ items, motion }) => useDelayedGalleryItems(items, getId, 250, motion),
      { initialProps: { items: ["a", "b"], motion: true } },
    );
    rerender({ items: ["b"], motion: true });
    expect(result.current.deletingIds.has("a")).toBe(true);
    rerender({ items: ["b"], motion: false });
    expect(result.current.displayItems).toEqual(["b"]);
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.runAllTimers());
    expect(result.current.displayItems).toEqual(["b"]);
  });
  it("replaces feed results immediately instead of retaining the old scope", () => {
    const { result, rerender } = renderHook(
      ({ items }) => useDelayedGalleryItems(items, getId, 250, true),
      { initialProps: { items: ["a", "b"] } },
    );
    rerender({ items: ["c", "d"] });
    expect(result.current.displayItems).toEqual(["c", "d"]);
    expect(result.current.deletingIds.size).toBe(0);
  });
});
