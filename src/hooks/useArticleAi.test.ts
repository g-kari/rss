/**
 * useAiOperation — 記事切替 (reset → abort) 後の stale 結果防止 spec。
 *
 * server-fetch path は apiFetch resolve 後の `await res.json()` まで abort recheck がないと、
 * 記事 A の AI 結果が記事 B の view に表示される race が起きる (local-processor path の
 * signal.aborted guard と非対称)。各 await 後の abort recheck + abort-aware finally を固定する。
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/api-fetch", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../lib/api-fetch";
import { LruCache } from "../lib/lru-cache";
import { useAiOperation } from "./useArticleAi";

const mockApiFetch = vi.mocked(apiFetch);

let cacheKeySeq = 0;
function makeCache(): LruCache {
  // テストごとにユニークキーで cache 汚染を防ぐ
  cacheKeySeq += 1;
  return new LruCache(`test-ai-cache-${cacheKeySeq}`, 10);
}

describe("useAiOperation 記事切替後の stale 結果防止 (#abort-guard)", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reset (記事切替) 後に server 応答が来ても stale result を setResult しない", async () => {
    // apiFetch を手動 resolve できる deferred promise にする
    let resolveFetch: ((res: Response) => void) | null = null;
    mockApiFetch.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const { result } = renderHook(() =>
      useAiOperation("/api/ai/summarize", makeCache(), "AI 失敗"),
    );

    act(() => {
      void result.current.run("https://a.example.com", "article-A");
    });
    await waitFor(() => expect(result.current.loading).toBe(true));

    // 記事切替 (reset) で進行中 run を abort
    act(() => {
      result.current.reset();
    });
    expect(result.current.result).toBeNull();

    // 遅れて server が記事 A の結果を返す (abort 後)
    await act(async () => {
      resolveFetch?.(new Response(JSON.stringify({ result: "記事 A の要約" }), { status: 200 }));
      await Promise.resolve();
      await Promise.resolve();
    });

    // abort recheck により stale result は適用されない
    expect(result.current.result).toBeNull();
  });

  it("reset 後の finally は loading を false に戻さない (新 run の loading=true を clobber しない)", async () => {
    let resolveFetch: ((res: Response) => void) | null = null;
    mockApiFetch.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const { result } = renderHook(() =>
      useAiOperation("/api/ai/summarize", makeCache(), "AI 失敗"),
    );

    act(() => {
      void result.current.run("https://a.example.com", "article-A");
    });
    await waitFor(() => expect(result.current.loading).toBe(true));

    act(() => {
      result.current.reset(); // abort + loading=false
    });
    expect(result.current.loading).toBe(false);

    // 新 run B が loading=true をセット
    mockApiFetch.mockReturnValue(
      new Promise<Response>(() => {
        /* 永久 pending */
      }),
    );
    act(() => {
      void result.current.run("https://b.example.com", "article-B");
    });
    await waitFor(() => expect(result.current.loading).toBe(true));

    // 旧 run A の server 応答が遅れて到達 → finally は abort 済なので loading を触らない
    await act(async () => {
      resolveFetch?.(new Response(JSON.stringify({ result: "記事 A の要約" }), { status: 200 }));
      await Promise.resolve();
      await Promise.resolve();
    });

    // 新 run B の loading=true が維持される
    expect(result.current.loading).toBe(true);
  });

  it("abort なしの通常完了では result が正しくセットされる (regression)", async () => {
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ result: "通常の要約" }), { status: 200 }),
    );

    const { result } = renderHook(() =>
      useAiOperation("/api/ai/summarize", makeCache(), "AI 失敗"),
    );

    await act(async () => {
      await result.current.run("https://a.example.com", "article-A");
    });

    await waitFor(() => expect(result.current.result?.text).toBe("通常の要約"));
    expect(result.current.loading).toBe(false);
  });

  it("2xx の論理エラーは再試行不能として返す", async () => {
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "対象記事を処理できません" }), { status: 200 }),
    );

    const { result } = renderHook(() =>
      useAiOperation("/api/ai/summarize", makeCache(), "AI 失敗"),
    );

    await act(async () => {
      await result.current.run("https://a.example.com", "article-A");
    });

    expect(result.current.error).toMatchObject({
      type: "unknown",
      message: "対象記事を処理できません",
      retryable: false,
    });
  });
});
