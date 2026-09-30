/** The 3-second API-error throttle survives toast-state renders and provider callback replacement. */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./useAuth", () => ({
  getAuthReady: () => Promise.resolve(),
  getTokenExpiry: () => null,
}));

import { apiFetch } from "../lib/api-fetch";
import { useApiErrorToast } from "./useApiErrorToast";
import { useToastState } from "./useToast";
import { useArticleContent } from "./useArticleContent";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-30T00:00:00Z"));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function failRequest(): Promise<void> {
  await act(async () => {
    await apiFetch("/api/content");
  });
}

describe("useApiErrorToast throttle", () => {
  it("does not show an error when article navigation cancels its full-content request", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(
      ({ id, link }) => {
        const toast = useToastState();
        useApiErrorToast(toast);
        const content = useArticleContent(id, link, "https://example.com/image.png");
        return { toast, content };
      },
      { initialProps: { id: "a", link: "https://speakerdeck.com/test/deck-a" } },
    );
    let request = Promise.resolve();
    await act(async () => {
      request = result.current.content.fetchFullContent();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    rerender({ id: "b", link: "https://speakerdeck.com/test/deck-b" });
    await act(async () => request);
    expect(result.current.content.fetchError).toBe("");
    expect(result.current.toast.toasts).toHaveLength(0);
  });

  it("does not reset the throttle when showing a toast rerenders its state", async () => {
    const { result } = renderHook(() => {
      const toast = useToastState();
      useApiErrorToast(toast);
      return toast;
    });
    await failRequest();
    expect(result.current.toasts).toHaveLength(1);
    act(() => vi.advanceTimersByTime(100));
    await failRequest();
    expect(result.current.toasts).toHaveLength(1);
    act(() => vi.advanceTimersByTime(2900));
    await failRequest();
    expect(result.current.toasts).toHaveLength(2);
  });

  it("keeps the window when a provider replaces its callback and uses the new callback next time", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ error }) => useApiErrorToast({ error }), {
      initialProps: { error: first },
    });
    await failRequest();
    expect(first).toHaveBeenCalledTimes(1);
    rerender({ error: second });
    act(() => vi.advanceTimersByTime(100));
    await failRequest();
    expect(second).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(2900));
    await failRequest();
    expect(second).toHaveBeenCalledWith("通信エラー: サーバーエラー（時間をおいて再試行）");
  });

  it("accepts the first error even when the clock starts at zero", async () => {
    vi.setSystemTime(0);
    const error = vi.fn();
    renderHook(() => useApiErrorToast({ error }));
    await failRequest();
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes on unmount", async () => {
    const error = vi.fn();
    const { unmount } = renderHook(() => useApiErrorToast({ error }));
    unmount();
    await failRequest();
    expect(error).not.toHaveBeenCalled();
  });
});
