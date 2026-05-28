/**
 * useAsyncFetch — #839: 複数 hook (useReadingStats / useEngagementEntries /
 * useRecommendations / useFeedGroups) で重複していた loading + error + try/finally
 * ボイラープレートを集約する汎用 fetch hook の spec。
 *
 * 案 A に基づく signature:
 *   useAsyncFetch<T>(endpoint, options?) => { data, loading, error, refetch, setData }
 *
 * 既存 4 hook の挙動を完全に再現できる最小 API を担保する:
 *   - endpoint fetch 成功 → data state 更新
 *   - fetch 失敗 → error state 設定 + loading false
 *   - loading state 切替 (fetch 中は true、終了で false)
 *   - endpoint or deps 変更時の re-fetch (auto mode)
 *   - lazy mode (default): refetch() を呼ばないと fetch しない
 *   - transform / fetcher / onError option の挙動
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/api-fetch", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../lib/api-fetch";
import { useAsyncFetch } from "./useAsyncFetch";

const mockApiFetch = vi.mocked(apiFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useAsyncFetch — lazy mode (default)", () => {
  it("初期状態は data=null / loading=false / error=null で fetch しない", () => {
    const { result } = renderHook(() => useAsyncFetch<{ foo: string }>("/api/x"));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("refetch() 呼出で endpoint を fetch し data state を更新する", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ foo: "bar" }));
    const { result } = renderHook(() => useAsyncFetch<{ foo: string }>("/api/x"));

    await act(async () => {
      await result.current.refetch();
    });

    expect(mockApiFetch).toHaveBeenCalledWith("/api/x", expect.objectContaining({}));
    expect(result.current.data).toEqual({ foo: "bar" });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("HTTP 失敗時は error state を設定し loading=false に戻す", async () => {
    mockApiFetch.mockResolvedValueOnce(new Response("Internal", { status: 500 }));
    const { result } = renderHook(() => useAsyncFetch<{ foo: string }>("/api/x"));

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toContain("500");
    expect(result.current.loading).toBe(false);
  });

  it("fetch 例外時も error state を設定し loading=false に戻す", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("network down"));
    const { result } = renderHook(() => useAsyncFetch<{ foo: string }>("/api/x"));

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.error).toBe("network down");
    expect(result.current.loading).toBe(false);
  });

  it("endpoint が null のとき refetch() しても fetch を呼ばない", async () => {
    const { result } = renderHook(() => useAsyncFetch<unknown>(null));
    await act(async () => {
      await result.current.refetch();
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
  });
});

describe("useAsyncFetch — auto mode", () => {
  it("auto=true で mount 時に自動 fetch を実行する", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ value: 1 }));
    const { result } = renderHook(() => useAsyncFetch<{ value: number }>("/api/y", { auto: true }));

    await waitFor(() => {
      expect(result.current.data).toEqual({ value: 1 });
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it("auto=true + endpoint=null では fetch しない", () => {
    renderHook(() => useAsyncFetch<unknown>(null, { auto: true }));
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("auto=true で endpoint が変わると re-fetch する", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ value: 1 }));
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ value: 2 }));
    const { result, rerender } = renderHook(
      ({ ep }: { ep: string }) => useAsyncFetch<{ value: number }>(ep, { auto: true }),
      { initialProps: { ep: "/api/y?id=1" } },
    );

    await waitFor(() => {
      expect(result.current.data).toEqual({ value: 1 });
    });

    rerender({ ep: "/api/y?id=2" });

    await waitFor(() => {
      expect(result.current.data).toEqual({ value: 2 });
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it("auto=true で deps が変わると re-fetch する", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ value: "a" }));
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ value: "b" }));
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string }) =>
        useAsyncFetch<{ value: string }>("/api/z", { auto: true, deps: [uid] }),
      { initialProps: { uid: "u1" } },
    );

    await waitFor(() => {
      expect(result.current.data).toEqual({ value: "a" });
    });

    rerender({ uid: "u2" });

    await waitFor(() => {
      expect(result.current.data).toEqual({ value: "b" });
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });
});

describe("useAsyncFetch — transform option", () => {
  it("transform で raw json を T に変換する (useEngagementEntries 互換)", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ entries: [1, 2, 3] }));
    const { result } = renderHook(() =>
      useAsyncFetch<number[]>("/api/e", {
        transform: (raw) => (raw as { entries: number[] }).entries ?? [],
      }),
    );

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.data).toEqual([1, 2, 3]);
  });
});

describe("useAsyncFetch — onError option", () => {
  it("onError コールバックは error メッセージで呼ばれる", async () => {
    const onError = vi.fn();
    mockApiFetch.mockRejectedValueOnce(new Error("kaboom"));
    const { result } = renderHook(() =>
      useAsyncFetch<unknown>("/api/x", { onError, formatError: () => "整形済メッセージ" }),
    );

    await act(async () => {
      await result.current.refetch();
    });

    expect(onError).toHaveBeenCalledWith("整形済メッセージ");
    expect(result.current.error).toBe("整形済メッセージ");
  });
});

describe("useAsyncFetch — fetcher option (custom)", () => {
  it("fetcher 指定時はデフォルト apiFetch+json+transform をバイパスする", async () => {
    const customFetcher = vi.fn().mockResolvedValue({ custom: true });
    const { result } = renderHook(() =>
      useAsyncFetch<{ custom: boolean }>("/api/custom", { fetcher: customFetcher }),
    );

    await act(async () => {
      await result.current.refetch();
    });

    expect(customFetcher).toHaveBeenCalledTimes(1);
    expect(customFetcher.mock.calls[0]?.[0]).toBe("/api/custom");
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(result.current.data).toEqual({ custom: true });
  });
});

describe("useAsyncFetch — setData (manual mutation)", () => {
  it("setData で外部から data を差し替えられる (CRUD パターン用)", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse([1, 2]));
    const { result } = renderHook(() => useAsyncFetch<number[]>("/api/list"));

    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.data).toEqual([1, 2]);

    act(() => {
      result.current.setData([1, 2, 3]);
    });
    expect(result.current.data).toEqual([1, 2, 3]);
  });
});

describe("useAsyncFetch — initialData", () => {
  it("initialData=[] を渡すと初期 data が空配列になる", () => {
    const { result } = renderHook(() => useAsyncFetch<number[]>("/api/list", { initialData: [] }));
    expect(result.current.data).toEqual([]);
  });
});
