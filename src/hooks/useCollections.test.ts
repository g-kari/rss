/**
 * useCollections#addArticlesToCollection の差分 rollback spec (#1087 Finding 2)。
 *
 * 旧実装は一括追加の PATCH 失敗時に `articleIds: snapshot` で配列全体を pre-add に復元して
 * いたため、一括追加 in-flight 中に確定した別の追加/削除が巻き戻されて消失していた。
 * 「今回追加した addedIds だけを最新 state から除去」する差分復元で window 中の別操作が
 * 保持されることを固定する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

vi.mock("../lib/api-fetch", () => ({
  apiFetch: vi.fn(),
  apiFetchJson: vi.fn(),
  tryParseErrorBody: vi.fn(async (res: Response) => res.json().catch(() => ({}))),
}));

import { apiFetch, apiFetchJson } from "../lib/api-fetch";
import type { Collection, UserProfile } from "../types";
import { useCollections } from "./useCollections";

const mockApiFetch = vi.mocked(apiFetch);
const mockApiFetchJson = vi.mocked(apiFetchJson);

const user = { id: "u1", sub: "sub1" } as UserProfile;

function collection(id: string, articleIds: string[]): Collection {
  return { id, name: id, articleIds, createdAt: "", order: 0 };
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCollections#addArticlesToCollection 差分 rollback (#1087)", () => {
  it("一括追加 失敗時、in-flight 中に確定した別記事追加を rollback で巻き戻さない", async () => {
    // mount fetch: c1 は a0 を保持
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => [collection("c1", ["a0"])],
    } as Response);

    // apiFetchJson: 一括追加 (addArticleIds に a1,a2 を含む) は deferred reject、
    // 単体追加 (a3) は即時 resolve
    let rejectBulk: ((e: unknown) => void) | null = null;
    mockApiFetchJson.mockImplementation((_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      const addIds: string[] = body.addArticleIds ?? [];
      if (addIds.includes("a1")) {
        return new Promise((_resolve, reject) => {
          rejectBulk = reject;
        });
      }
      return Promise.resolve({});
    });

    const { result } = renderHook(() => useCollections(user));
    await waitFor(() => expect(result.current.collections.length).toBe(1));

    // 一括追加 [a1, a2] 開始 (楽観的に c1.articleIds = [a0, a1, a2])。PATCH は pending。
    let bulkPromise: Promise<void>;
    act(() => {
      bulkPromise = result.current.addArticlesToCollection("c1", ["a1", "a2"]);
    });
    expect(result.current.collections[0]?.articleIds).toEqual(["a0", "a1", "a2"]);

    // window 中: 別記事 a3 を単体追加で確定
    await act(async () => {
      await result.current.addArticleToCollection("c1", "a3");
    });
    expect(result.current.collections[0]?.articleIds).toContain("a3");

    // 一括追加 PATCH 失敗 → rollback
    await act(async () => {
      rejectBulk?.(new Error("bulk add failed"));
      await bulkPromise.catch(() => {});
    });

    const ids = result.current.collections[0]?.articleIds ?? [];
    // 一括追加した a1/a2 は除去される
    expect(ids).not.toContain("a1");
    expect(ids).not.toContain("a2");
    // 元々の a0 と window 中の a3 は保持される (旧実装では snapshot [a0] 丸ごと復元で a3 が消えていた)
    expect(ids).toContain("a0");
    expect(ids).toContain("a3");
  });
});
