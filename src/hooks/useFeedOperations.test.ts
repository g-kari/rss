/**
 * useFeedOperations — #840: onError callback による toast 配信を spec で固定。
 *
 * `addFeed` / `deleteFeed` / `renameFeed` 3 action のエラー経路で:
 *   1. `onError?: (msg: string) => void` callback が呼ばれること (新規 toast 経路)
 *   2. 既存の localStorage 風 `error` state も併存セットされること (3 秒テキスト表示の互換維持)
 *
 * 案 A 採用 (推奨案、`useCollections` の `onError` pattern と統一)。
 * 実装は commit f7cdeb72 で先行投入済 (#840 panel)、本 spec は規範整合 + 回帰防止用。
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/api-fetch", () => ({
  apiFetch: vi.fn(),
  apiFetchJson: vi.fn(),
  tryParseErrorBody: vi.fn(async (res: Response) => res.json().catch(() => ({}))),
}));

vi.mock("../lib/sw-cache", () => ({
  invalidateSwCache: vi.fn(),
}));

import { apiFetch, apiFetchJson } from "../lib/api-fetch";
import type { Feed } from "../types";
import { useFeedOperations } from "./useFeedOperations";

const mockApiFetch = vi.mocked(apiFetch);
const mockApiFetchJson = vi.mocked(apiFetchJson);

interface CallbackSpies {
  onFeedAdded: (feed: Feed) => void;
  onFeedDeleted: (id: string) => void;
  onFeedRenamed: (feed: Feed) => void;
  onFeedsImported: (feeds: Feed[]) => void;
  onError: (msg: string) => void;
}

function makeCallbacks(): CallbackSpies {
  return {
    onFeedAdded: vi.fn<(feed: Feed) => void>(),
    onFeedDeleted: vi.fn<(id: string) => void>(),
    onFeedRenamed: vi.fn<(feed: Feed) => void>(),
    onFeedsImported: vi.fn<(feeds: Feed[]) => void>(),
    onError: vi.fn<(msg: string) => void>(),
  };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetchJson.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useFeedOperations — onError callback で toast 配信 (#840 案 A)", () => {
  describe("deleteFeed", () => {
    it("apiFetchJson が reject したとき onError に削除失敗メッセージが渡される", async () => {
      const cb = makeCallbacks();
      mockApiFetchJson.mockRejectedValueOnce(new Error("network error"));
      const { result } = renderHook(() => useFeedOperations(cb));

      await act(async () => {
        await result.current.deleteFeed("feed-1");
      });

      expect(cb.onError).toHaveBeenCalledTimes(1);
      expect(cb.onError).toHaveBeenCalledWith("フィードの削除に失敗しました");
    });

    it("成功時は onError を呼ばず onFeedDeleted のみ呼ばれる", async () => {
      const cb = makeCallbacks();
      mockApiFetchJson.mockResolvedValueOnce({});
      const { result } = renderHook(() => useFeedOperations(cb));

      await act(async () => {
        await result.current.deleteFeed("feed-1");
      });

      expect(cb.onError).not.toHaveBeenCalled();
      expect(cb.onFeedDeleted).toHaveBeenCalledWith("feed-1");
    });

    it("既存の localStorage 風 error state も併存セットされる (3 秒表示用 fallback)", async () => {
      const cb = makeCallbacks();
      mockApiFetchJson.mockRejectedValueOnce(new Error("network error"));
      const { result } = renderHook(() => useFeedOperations(cb));

      await act(async () => {
        await result.current.deleteFeed("feed-1");
      });

      await waitFor(() => {
        expect(result.current.error).toBe("フィードの削除に失敗しました");
      });
    });
  });

  describe("renameFeed", () => {
    it("apiFetchJson が reject したとき onError にタイトル変更失敗メッセージが渡される", async () => {
      const cb = makeCallbacks();
      mockApiFetchJson.mockRejectedValueOnce(new Error("network error"));
      const { result } = renderHook(() => useFeedOperations(cb));

      await act(async () => {
        await result.current.renameFeed("feed-1", "新タイトル");
      });

      expect(cb.onError).toHaveBeenCalledTimes(1);
      expect(cb.onError).toHaveBeenCalledWith("フィードのタイトル変更に失敗しました");
    });

    it("成功時は onError を呼ばず onFeedRenamed のみ呼ばれる", async () => {
      const cb = makeCallbacks();
      const updated = { id: "feed-1", url: "https://example.com/rss", title: "新タイトル" };
      mockApiFetchJson.mockResolvedValueOnce(updated);
      const { result } = renderHook(() => useFeedOperations(cb));

      await act(async () => {
        await result.current.renameFeed("feed-1", "新タイトル");
      });

      expect(cb.onError).not.toHaveBeenCalled();
      expect(cb.onFeedRenamed).toHaveBeenCalledWith(updated);
    });
  });

  describe("addFeed", () => {
    it("apiFetch throw 時 onError にネットワークエラーメッセージが渡される", async () => {
      const cb = makeCallbacks();
      mockApiFetch.mockRejectedValueOnce(new Error("network down"));
      const { result } = renderHook(() => useFeedOperations(cb));

      const onSuccess = vi.fn();
      await act(async () => {
        await result.current.addFeed("https://example.com/rss", onSuccess);
      });

      expect(cb.onError).toHaveBeenCalledTimes(1);
      expect(cb.onError).toHaveBeenCalledWith("ネットワークエラーが発生しました");
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it("server 4xx + error body のとき onError がそのメッセージで呼ばれる", async () => {
      const cb = makeCallbacks();
      const errorBody = { error: "URL がフィードとして認識できません" };
      mockApiFetch.mockResolvedValueOnce(new Response(JSON.stringify(errorBody), { status: 400 }));
      const { result } = renderHook(() => useFeedOperations(cb));

      const onSuccess = vi.fn();
      await act(async () => {
        await result.current.addFeed("https://example.com/rss", onSuccess);
      });

      expect(cb.onError).toHaveBeenCalledTimes(1);
      expect(cb.onError).toHaveBeenCalledWith("URL がフィードとして認識できません");
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it("成功時は onError を呼ばず onFeedAdded + onSuccess のみ呼ばれる", async () => {
      const cb = makeCallbacks();
      const added = { id: "feed-1", url: "https://example.com/rss", title: "Example" };
      mockApiFetch.mockResolvedValueOnce(new Response(JSON.stringify(added), { status: 200 }));
      const { result } = renderHook(() => useFeedOperations(cb));

      const onSuccess = vi.fn();
      await act(async () => {
        await result.current.addFeed("https://example.com/rss", onSuccess);
      });

      expect(cb.onError).not.toHaveBeenCalled();
      expect(cb.onFeedAdded).toHaveBeenCalledWith(added);
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  describe("onError 未指定 (optional)", () => {
    it("onError を渡さなくてもエラー時に throw せず error state だけセットされる (後方互換)", async () => {
      const cb = makeCallbacks();
      mockApiFetchJson.mockRejectedValueOnce(new Error("network error"));
      const { result } = renderHook(() =>
        useFeedOperations({
          onFeedAdded: cb.onFeedAdded,
          onFeedDeleted: cb.onFeedDeleted,
          onFeedRenamed: cb.onFeedRenamed,
          onFeedsImported: cb.onFeedsImported,
          // onError は意図的に渡さない
        }),
      );

      await expect(
        act(async () => {
          await result.current.deleteFeed("feed-1");
        }),
      ).resolves.not.toThrow();

      await waitFor(() => {
        expect(result.current.error).toBe("フィードの削除に失敗しました");
      });
    });
  });
});
