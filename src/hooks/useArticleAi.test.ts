/**
 * useAiOperation — 記事切替 (reset → abort) 後の stale 結果防止 spec。
 *
 * server-fetch path は apiFetch resolve 後の `await res.json()` まで abort recheck がないと、
 * 記事 A の AI 結果が記事 B の view に表示される race が起きる (local-processor path の
 * signal.aborted guard と非対称)。各 await 後の abort recheck + abort-aware finally を固定する。
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
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

describe("useAiOperation AI の実行先とキャッシュ", () => {
  const auto = {
    provider: "auto",
    model: "@cf/meta/llama-3.1-8b-instruct",
    userId: "user-a",
  } as const;
  const cloud = { ...auto, provider: "workers-ai" } as const;
  const browser = { ...auto, provider: "browser" } as const;

  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(
      async () => new Response(JSON.stringify({ result: "cloud result" })),
    );
  });

  it("クラウド指定は利用可能な Chrome AI を呼ばない", async () => {
    const local = vi.fn(async () => ({
      text: "local result",
      isHtml: false,
      provider: "browser" as const,
    }));
    const { result } = renderHook(() =>
      useAiOperation("/api/ai/summarize", makeCache(), "失敗", local, cloud),
    );
    await act(async () => result.current.run("https://example.com/1", "1", "article"));
    expect(local).not.toHaveBeenCalled();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(result.current.result?.provider).toBe("workers-ai");
  });

  it.each(["unavailable", "throws", "empty", "no-input"])(
    "Chrome 指定 (%s) はクラウドへ黙って切り替えない",
    async (state) => {
      const local = vi.fn(async () => {
        if (state === "throws") throw new Error("unavailable");
        return state === "empty" ? { text: "", isHtml: false, provider: "browser" as const } : null;
      });
      const { result } = renderHook(() =>
        useAiOperation("/api/ai/translate", makeCache(), "失敗", local, browser),
      );
      await act(async () =>
        result.current.run(
          "https://example.com/1",
          "1",
          state === "no-input" ? undefined : "article",
        ),
      );
      expect(mockApiFetch).not.toHaveBeenCalled();
      expect(result.current.error?.message).toContain("Chrome");
      expect(result.current.result).toBeNull();
      expect(result.current.loading).toBe(false);
    },
  );

  it("自動では Chrome 成功時は端末上の結果を使い、利用不可ならクラウドへ切り替える", async () => {
    const local = vi
      .fn()
      .mockResolvedValueOnce({ text: "local result", isHtml: false, provider: "browser" })
      .mockResolvedValueOnce(null);
    const cache = makeCache();
    const { result } = renderHook(() =>
      useAiOperation("/api/ai/summarize", cache, "失敗", local, auto),
    );
    await act(async () => result.current.run("https://example.com/1", "1", "article"));
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(result.current.result?.provider).toBe("browser");
    await act(async () => result.current.run("https://example.com/2", "2", "article"));
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(result.current.result?.provider).toBe("workers-ai");
  });

  it("実行先・モデル・ユーザーの変更では前の結果を再利用しない", async () => {
    const local = vi.fn(async () => ({
      text: "local result",
      isHtml: false,
      provider: "browser" as const,
    }));
    const cache = makeCache();
    const { result, rerender } = renderHook(
      ({ prefs }) => useAiOperation("/api/ai/summarize", cache, "失敗", local, prefs),
      {
        initialProps: { prefs: { ...auto } as import("../lib/ai-preferences").AiPreferences },
      },
    );
    await act(async () => result.current.run("https://example.com/1", "1", "article"));
    rerender({ prefs: cloud });
    expect(result.current.result).toBeNull();
    await act(async () => result.current.run("https://example.com/1", "1", "article"));
    expect(result.current.result?.text).toBe("cloud result");
    expect(local).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    await act(async () => result.current.run("https://example.com/1", "1", "article"));
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    rerender({ prefs: { ...cloud, model: "@cf/meta/llama-3.2-3b-instruct" } });
    await act(async () => result.current.run("https://example.com/1", "1", "article"));
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(mockApiFetch.mock.calls[1][1]?.body as string).model).toBe(
      "@cf/meta/llama-3.2-3b-instruct",
    );
    rerender({ prefs: { ...cloud, userId: "user-b" } });
    await act(async () => result.current.run("https://example.com/1", "1", "article"));
    expect(mockApiFetch).toHaveBeenCalledTimes(3);
  });

  it("出所が不明な旧 article-only キャッシュを指定プロバイダーの結果にしない", async () => {
    const cache = makeCache();
    cache.set("1", JSON.stringify({ text: "legacy local", provider: "browser" }));
    const { result } = renderHook(() =>
      useAiOperation("/api/ai/summarize", cache, "失敗", undefined, cloud),
    );
    await act(async () => result.current.run("https://example.com/1", "1"));
    expect(result.current.result?.text).toBe("cloud result");
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it("Chrome 待機中にクラウドへ変更しても古い結果を表示・フォールバックしない", async () => {
    let rejectLocal: ((error: Error) => void) | undefined;
    const local = vi.fn(
      () =>
        new Promise<null>((_, reject) => {
          rejectLocal = reject;
        }),
    );
    const cache = makeCache();
    const { result, rerender } = renderHook(
      ({ prefs }) => useAiOperation("/api/ai/summarize", cache, "失敗", local, prefs),
      {
        initialProps: { prefs: { ...auto } as import("../lib/ai-preferences").AiPreferences },
      },
    );
    act(() => {
      void result.current.run("https://example.com/1", "1", "article");
    });
    rerender({ prefs: cloud });
    await act(async () => {
      rejectLocal?.(new Error("old local failure"));
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

afterEach(cleanup);

describe("useAiOperation 遅れて到着した本文取得 callback", () => {
  it("実行先・モデル・アカウント・記事が変わったあとは古い run を開始しない", async () => {
    mockApiFetch.mockReset();
    const local = vi.fn(async () => ({
      text: "local",
      isHtml: false,
      provider: "browser" as const,
    }));
    const cache = makeCache();
    const { result, rerender, unmount } = renderHook(
      ({ prefs, article }) =>
        useAiOperation("/api/ai/summarize", cache, "失敗", local, prefs, article),
      {
        initialProps: {
          prefs: {
            provider: "auto",
            model: "@cf/meta/llama-3.1-8b-instruct",
            userId: "user-a",
          } as import("../lib/ai-preferences").AiPreferences,
          article: "article-a",
        },
      },
    );
    const pendingContentCallback = result.current.run;
    rerender({
      prefs: { provider: "workers-ai", model: "@cf/meta/llama-3.2-3b-instruct", userId: "user-b" },
      article: "article-b",
    });
    await act(async () =>
      pendingContentCallback("https://example.com/a", "article-a", "late content"),
    );
    expect(local).not.toHaveBeenCalled();
    expect(mockApiFetch).not.toHaveBeenCalled();
    const pendingBeforeUnmount = result.current.run;
    unmount();
    await act(async () =>
      pendingBeforeUnmount("https://example.com/b", "article-b", "late content"),
    );
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe("useAiOperation 自動処理の端末限定", () => {
  it("Auto で端末限定なら Chrome が途中で失敗してもクラウドへ切り替えない", async () => {
    mockApiFetch.mockReset();
    const cache = makeCache();
    const local = vi.fn(async () => null);
    const { result } = renderHook(() => useAiOperation("/api/ai/summarize", cache, "失敗", local));
    await act(async () =>
      result.current.run("https://example.com", "a", "content", { browserOnly: true }),
    );
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(result.current.error?.message).toContain("Chrome");
  });
});
