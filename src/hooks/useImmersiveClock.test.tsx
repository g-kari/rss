import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useImmersiveClock } from "./useImmersiveClock";
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("starts immediately without animation, holds elapsed across user pause/hidden and completes once", () => {
  const complete = vi.fn();
  const { result, rerender, unmount } = renderHook(
    ({ paused, visible, speed }) => useImmersiveClock(true, paused, visible, speed, 2000, complete),
    { initialProps: { paused: false, visible: true, speed: 1 } },
  );
  act(() => vi.advanceTimersByTime(500));
  expect(result.current).toBe(500);
  rerender({ paused: true, visible: true, speed: 1 });
  act(() => vi.advanceTimersByTime(10000));
  expect(result.current).toBe(500);
  rerender({ paused: true, visible: false, speed: 1 });
  rerender({ paused: true, visible: true, speed: 1 });
  expect(complete).not.toHaveBeenCalled();
  rerender({ paused: false, visible: true, speed: 2 });
  act(() => vi.advanceTimersByTime(800));
  expect(result.current).toBe(2000);
  expect(complete).toHaveBeenCalledOnce();
  act(() => vi.advanceTimersByTime(10000));
  expect(complete).toHaveBeenCalledOnce();
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it("does not count background time or run inactive neighboring cards", () => {
  const complete = vi.fn();
  const { result, rerender } = renderHook(
    ({ active, visible }) => useImmersiveClock(active, false, visible, 1, 1000, complete),
    { initialProps: { active: false, visible: true } },
  );
  act(() => vi.advanceTimersByTime(2000));
  expect(result.current).toBe(0);
  rerender({ active: true, visible: true });
  act(() => vi.advanceTimersByTime(300));
  rerender({ active: true, visible: false });
  act(() => vi.advanceTimersByTime(10000));
  expect(result.current).toBe(300);
  rerender({ active: true, visible: true });
  act(() => vi.advanceTimersByTime(700));
  expect(complete).toHaveBeenCalledOnce();
});
