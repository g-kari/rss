import { useLayoutEffect } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGracePeriod } from "./useGracePeriod";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useGracePeriod", () => {
  it("retains the previous article in every committed navigation render", () => {
    const committed: (string | null)[] = [];
    const { rerender } = renderHook(
      ({ id }) => {
        const previous = useGracePeriod(id);
        useLayoutEffect(() => {
          committed.push(previous);
        });
      },
      { initialProps: { id: "a" } },
    );
    committed.length = 0;
    rerender({ id: "b" });
    expect(committed.length).toBeGreaterThan(0);
    expect(committed.every((id) => id === "a")).toBe(true);

    committed.length = 0;
    rerender({ id: "c" });
    expect(committed.every((id) => id === "b")).toBe(true);
  });

  it("refreshes the timeout during rapid next/previous navigation and expires once", () => {
    const { result, rerender } = renderHook(({ id }) => useGracePeriod(id), {
      initialProps: { id: "a" },
    });
    expect(result.current).toBeNull();
    rerender({ id: "b" });
    act(() => vi.advanceTimersByTime(20_000));
    rerender({ id: "a" });
    expect(result.current).toBe("b");
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current).toBe("b");
    act(() => vi.advanceTimersByTime(20_000));
    expect(result.current).toBeNull();
  });

  it("clears the timer on unmount", () => {
    const { rerender, unmount } = renderHook(({ id }) => useGracePeriod(id), {
      initialProps: { id: "a" },
    });
    rerender({ id: "b" });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
