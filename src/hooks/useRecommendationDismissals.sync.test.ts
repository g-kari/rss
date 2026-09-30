import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useRecommendationDismissals } from "./useRecommendationDismissals";
import { apiFetch } from "../lib/api-fetch";
import { STORAGE_KEYS } from "../lib/storage";

vi.mock("../lib/api-fetch", () => ({ apiFetch: vi.fn() }));
const request = vi.mocked(apiFetch);
const NOW = Date.now();
const record = (articleId: string) => ({ articleId, dismissedAt: NOW });
const response = (data: unknown) => new Response(JSON.stringify(data));
const key = (id: string) => `${STORAGE_KEYS.ARTICLE_RECOMMENDATION_DISMISSALS}:${id}`;
function config(enabled: boolean, ids: string[] = []) {
  return response({ recommendationEnabled: enabled, recommendationDismissals: ids.map(record) });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function configChanged(userId: string, recommendationEnabled: boolean) {
  window.dispatchEvent(
    new CustomEvent("rss-recommendation-push-config", {
      detail: { userId, recommendationEnabled },
    }),
  );
}
const posts = () => request.mock.calls.filter(([, init]) => init?.method === "POST");
beforeEach(() => {
  localStorage.clear();
  request.mockReset();
});
afterEach(cleanup);

describe("recommendation dismissal opt-in synchronization", () => {
  it("does not send or rehydrate dismissals while disabled", async () => {
    request.mockResolvedValue(config(false, ["server"]));
    const { result } = renderHook(() => useRecommendationDismissals("one"));
    await waitFor(() => expect(request).toHaveBeenCalled());
    act(() => result.current.dismiss("local"));
    expect([...result.current.dismissedIds]).toEqual(["local"]);
    expect(posts()).toHaveLength(0);
  });
  it("rehydrates server feedback and syncs only local dismissal IDs and timestamps when opted in", async () => {
    localStorage.setItem(key("one"), JSON.stringify([record("local")]));
    request.mockImplementation(async (_url, init) =>
      init?.method === "POST"
        ? response({ recommendationDismissals: [record("server"), record("local")] })
        : config(true, ["server"]),
    );
    const { result } = renderHook(() => useRecommendationDismissals("one"));
    await waitFor(() =>
      expect([...result.current.dismissedIds].sort()).toEqual(["local", "server"]),
    );
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0][0]).toBe("/api/push/recommendations/dismissals");
    expect(posts()[0][1]?.headers).toMatchObject({ "X-RSS-Account-Id": "one" });
    expect(request.mock.calls[0][1]?.headers).toMatchObject({ "X-RSS-Account-Id": "one" });
    expect(JSON.parse(posts()[0][1]?.body as string)).toEqual({ add: [record("local")] });
  });
  it("preserves undo and reset against a late GET and serializes mutations", async () => {
    const get = deferred<Response>();
    const firstPost = deferred<Response>();
    request
      .mockReturnValueOnce(get.promise)
      .mockReturnValueOnce(firstPost.promise)
      .mockResolvedValue(response({ recommendationDismissals: [] }));
    const { result } = renderHook(() => useRecommendationDismissals("one"));
    act(() => {
      result.current.dismiss("a");
      result.current.restore("a");
    });
    await act(async () => get.resolve(config(true, ["a", "old"])));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(result.current.dismissedIds.has("a")).toBe(false);
    act(() => result.current.reset());
    expect(result.current.dismissedIds.size).toBe(0);
    await act(async () =>
      firstPost.resolve(response({ recommendationDismissals: [record("old")] })),
    );
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(JSON.parse(posts()[1][1]?.body as string)).toEqual({ reset: true });
    expect(result.current.dismissedIds.size).toBe(0);
  });
  it("ignores previous account responses and never posts its pending data under the next account", async () => {
    const old = deferred<Response>();
    request.mockReturnValueOnce(old.promise).mockResolvedValue(config(false));
    const { result, rerender } = renderHook(({ id }) => useRecommendationDismissals(id), {
      initialProps: { id: "one" },
    });
    act(() => result.current.dismiss("one-only"));
    rerender({ id: "two" });
    await act(async () => old.resolve(config(true, ["private-one"])));
    expect(result.current.dismissedIds.size).toBe(0);
    expect(posts()).toHaveLength(0);
    expect(request.mock.calls[1][1]?.headers).toMatchObject({ "X-RSS-Account-Id": "two" });
    expect(localStorage.getItem(key("two")) ?? "").not.toContain("one");
  });
  it("stops syncing on opt-out and ignores a late mutation completion", async () => {
    const post = deferred<Response>();
    request.mockResolvedValueOnce(config(true)).mockReturnValueOnce(post.promise);
    const { result } = renderHook(() => useRecommendationDismissals("one"));
    await act(async () => {});
    act(() => result.current.dismiss("a"));
    await waitFor(() => expect(posts()).toHaveLength(1));
    act(() => configChanged("one", false));
    act(() => result.current.restore("a"));
    await act(async () => post.resolve(response({ recommendationDismissals: [record("a")] })));
    expect(result.current.dismissedIds.size).toBe(0);
    expect(posts()).toHaveLength(1);
  });
  it("retains failed mutations over remount and retries only after opt-in is verified", async () => {
    request.mockResolvedValueOnce(config(true)).mockRejectedValueOnce(new Error("offline"));
    const first = renderHook(() => useRecommendationDismissals("one"));
    await act(async () => {});
    act(() => first.result.current.dismiss("a"));
    await waitFor(() => expect(posts()).toHaveLength(1));
    first.unmount();
    request
      .mockResolvedValueOnce(config(true))
      .mockResolvedValueOnce(response({ recommendationDismissals: [record("a")] }));
    const second = renderHook(() => useRecommendationDismissals("one"));
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(second.result.current.dismissedIds.has("a")).toBe(true);
  });
});

describe("dismissal race regressions", () => {
  it("pauses feedback writes immediately when another tab changes notification settings", async () => {
    request.mockResolvedValueOnce(config(true)).mockResolvedValueOnce(config(false));
    const { result } = renderHook(() => useRecommendationDismissals("one"));
    await act(async () => {});
    act(() =>
      window.dispatchEvent(new StorageEvent("storage", { key: `${key("one")}:config-change` })),
    );
    act(() => result.current.dismiss("local"));
    await act(async () => {});
    expect(posts()).toHaveLength(0);
  });
  it("does not promote hydrated server data to unsynced local intent on remount", async () => {
    request.mockResolvedValueOnce(config(true, ["server"]));
    const first = renderHook(() => useRecommendationDismissals("one"));
    await waitFor(() => expect(first.result.current.dismissedIds.has("server")).toBe(true));
    first.unmount();
    request.mockResolvedValueOnce(config(true));
    const second = renderHook(() => useRecommendationDismissals("one"));
    await waitFor(() => expect(second.result.current.dismissedIds.size).toBe(0));
    expect(posts()).toHaveLength(0);
  });
  it("does not revive a remotely removed dismissal from an acknowledged local cache", async () => {
    localStorage.setItem(key("one"), JSON.stringify([record("removed-remotely")]));
    localStorage.setItem(`${key("one")}:pending`, "{}");
    request.mockResolvedValue(config(true));
    const { result } = renderHook(() => useRecommendationDismissals("one"));
    await waitFor(() => expect(result.current.dismissedIds.size).toBe(0));
    expect(posts()).toHaveLength(0);
  });
  it("rehydrates after opt-in and ignores another account's config events", async () => {
    request.mockResolvedValueOnce(config(false)).mockResolvedValueOnce(config(true, ["server"]));
    const { result } = renderHook(() => useRecommendationDismissals("one"));
    await act(async () => {});
    act(() => configChanged("two", true));
    expect(request).toHaveBeenCalledTimes(1);
    act(() => configChanged("one", true));
    await waitFor(() => expect(result.current.dismissedIds.has("server")).toBe(true));
  });
  it("a newer disabled config wins over an older enabled response", async () => {
    const first = deferred<Response>();
    request.mockReturnValueOnce(first.promise).mockResolvedValueOnce(config(false));
    const { result } = renderHook(() => useRecommendationDismissals("one"));
    act(() => window.dispatchEvent(new Event("focus")));
    await act(async () => {});
    await act(async () => first.resolve(config(true, ["stale"])));
    act(() => result.current.dismiss("local"));
    expect([...result.current.dismissedIds]).toEqual(["local"]);
    expect(posts()).toHaveLength(0);
  });
  it("preserves undo after reload while disabled and replays it on later opt-in", async () => {
    localStorage.setItem(key("one"), JSON.stringify([record("a")]));
    localStorage.setItem(`${key("one")}:pending`, "{}");
    request.mockResolvedValueOnce(config(false));
    const first = renderHook(() => useRecommendationDismissals("one"));
    await act(async () => {});
    act(() => first.result.current.restore("a"));
    first.unmount();
    request
      .mockResolvedValueOnce(config(true, ["a"]))
      .mockResolvedValueOnce(response({ recommendationDismissals: [] }));
    const second = renderHook(() => useRecommendationDismissals("one"));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(JSON.parse(posts()[0][1]?.body as string)).toEqual({ remove: ["a"] });
    expect(second.result.current.dismissedIds.size).toBe(0);
  });
});
