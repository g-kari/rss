/**
 * useFeedPatch の field 単位マージ rollback spec (#1087 Finding 1)。
 *
 * 旧実装は `updateFeed(feed)` (full Feed 置換) で rollback していたため、同一 feed の別フィールドの
 * 並行 PATCH を巻き戻していた。変更フィールドのみを最新 state にマージ/rollback することで
 * 並行更新を clobber しないことを固定する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("../lib/api-fetch", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../lib/api-fetch";
import type { Feed } from "../types";
import { useFeedPatch } from "./useFeedPatch";

const mockApiFetch = vi.mocked(apiFetch);

function makeFeed(id: string, extra: Partial<Feed> = {}): Feed {
  return {
    id,
    feedHash: id,
    url: `https://example.com/${id}`,
    title: id,
    nsfw: false,
    ...extra,
  } as Feed;
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useFeedPatch field 単位マージ rollback (#1087)", () => {
  it("category PATCH 失敗時、in-flight 中に確定した priority 変更を rollback で巻き戻さない", async () => {
    // ローカル feeds state を mergeFeedFields mock で保持
    let feeds: Feed[] = [makeFeed("f1")];
    const mergeFeedFields = vi.fn((id: string, fields: Partial<Feed>) => {
      feeds = feeds.map((f) => (f.id === id ? { ...f, ...fields } : f));
    });

    // category PATCH は deferred reject
    let rejectCategory: ((e: unknown) => void) | null = null;
    mockApiFetch.mockImplementation((_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      if ("category" in body) {
        return new Promise((_resolve, reject) => {
          rejectCategory = reject;
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    const { result } = renderHook(() => useFeedPatch(mergeFeedFields));

    // category を "tech" に変更開始 (楽観的 merge {category:"tech"})。PATCH は pending。
    let categoryPromise: Promise<void>;
    act(() => {
      categoryPromise = result.current.setCategoryFeed(feeds[0]!, "tech");
    });
    expect(feeds[0]?.category).toBe("tech");

    // window 中: 別フィールド priority が並行で確定 (= 別操作の commit を模擬)
    act(() => {
      mergeFeedFields("f1", { priority: "high" });
    });
    expect(feeds[0]?.priority).toBe("high");

    // category PATCH 失敗 → rollback (category のみ元値に戻す)
    await act(async () => {
      rejectCategory?.(new Error("category patch failed"));
      await categoryPromise;
    });

    // category は元値 (undefined) に戻る
    expect(feeds[0]?.category).toBeUndefined();
    // 並行で確定した priority は保持される (旧実装では full Feed 置換で undefined に戻っていた)
    expect(feeds[0]?.priority).toBe("high");
  });
});
