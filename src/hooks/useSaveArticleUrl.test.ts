import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useSaveArticleUrl } from "./useSaveArticleUrl";
import { useReadStatePersistence } from "./useReadStatePersistence";
import { apiFetch } from "../lib/api-fetch";
import { STORAGE_KEYS, saveSet, flushDeferredSaves } from "../lib/storage";
import type { Article } from "../types";

vi.mock("../lib/api-fetch", () => ({ apiFetch: vi.fn() }));
const article: Article = {
  id: "synthetic-saved",
  feedHash: "__saved__",
  title: "Synthetic article",
  guid: "saved",
  link: "https://example.test/read",
  summary: "",
  publishedAt: "2026-10-04T00:00:00Z",
  createdAt: "2026-10-04T00:00:00Z",
};
function setup() {
  const toast = { success: vi.fn(), error: vi.fn() };
  const prependArticle = vi.fn();
  const schedule = vi.fn();
  const immediate = vi.fn();
  const hook = renderHook(() => {
    const state = useReadStatePersistence([], undefined, schedule, immediate);
    const save = useSaveArticleUrl({
      prependArticle,
      addBookmark: state.addBookmark,
      addReadingList: state.addReadingList,
      toast,
    });
    return { save, state };
  });
  return { ...hook, toast, prependArticle, schedule, immediate };
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  flushDeferredSaves();
  vi.useRealTimers();
});
describe("URL保存の明示結果と登録状態", () => {
  it.each([429, 422, 503])(
    "HTTP %iをinline表示できる失敗として返し、記事・状態・toastを変更しない",
    async (status) => {
      vi.mocked(apiFetch).mockResolvedValue(
        new Response(JSON.stringify({ error: "Synthetic failure" }), {
          status,
          headers: { "Retry-After": "5" },
        }),
      );
      const { result, prependArticle, toast, schedule } = setup();
      let response;
      await act(async () => {
        response = await result.current.save(article.link, "bookmark");
      });
      expect(response).toMatchObject({ ok: false, error: expect.any(String) });
      expect(prependArticle).not.toHaveBeenCalled();
      expect(schedule).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    },
  );
  it.each(["null", "{}", "not json", '{"error":42}'])(
    "不正な成功応答 %sを形式失敗として返す",
    async (body) => {
      vi.mocked(apiFetch).mockResolvedValue(new Response(body, { status: 200 }));
      const { result, prependArticle } = setup();
      await expect(result.current.save(article.link, "reading_list")).resolves.toEqual({
        ok: false,
        error: "保存に失敗しました (サーバー応答形式不正)",
      });
      expect(prependArticle).not.toHaveBeenCalled();
    },
  );
  it("非JSONのHTTP失敗もステータスで分類する", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response("temporarily unavailable", { status: 503 }));
    const { result } = setup();
    await expect(result.current.save(article.link, "bookmark")).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("サーバー"),
    });
  });
  it("通信失敗を返し、そのまま再試行して成功できる", async () => {
    vi.mocked(apiFetch)
      .mockRejectedValueOnce(new TypeError("Synthetic offline"))
      .mockResolvedValueOnce(new Response(JSON.stringify(article)));
    const { result, toast } = setup();
    await expect(result.current.save(article.link, "bookmark")).resolves.toMatchObject({
      ok: false,
      error: expect.any(String),
    });
    await act(async () => {
      expect(await result.current.save(article.link, "bookmark")).toEqual({ ok: true });
    });
    expect(result.current.state.bookmarkIds.has(article.id)).toBe(true);
    expect(toast.success).toHaveBeenCalledOnce();
    expect(toast.error).not.toHaveBeenCalled();
  });
  it.each(["bookmark", "reading_list"] as const)(
    "%sへの初回・連続・既登録の保存はaddのみで、通常toggleは解除できる",
    async (mode) => {
      vi.useFakeTimers();
      saveSet(STORAGE_KEYS.READ_IDS, new Set(["read-existing"]));
      saveSet(STORAGE_KEYS.LIKE_IDS, new Set(["like-existing"]));
      const key = mode === "bookmark" ? STORAGE_KEYS.BOOKMARK_IDS : STORAGE_KEYS.READING_LIST_IDS;
      const opposite =
        mode === "bookmark" ? STORAGE_KEYS.READING_LIST_IDS : STORAGE_KEYS.BOOKMARK_IDS;
      saveSet(opposite, new Set(["opposite-existing"]));
      vi.mocked(apiFetch).mockImplementation(async () => new Response(JSON.stringify(article)));
      const { result, immediate, toast } = setup();
      await act(async () => {
        await Promise.all([
          result.current.save(article.link, mode),
          result.current.save(article.link, mode),
        ]);
      });
      await act(async () => {
        await result.current.save(article.link, mode);
      });
      const kind = mode === "bookmark" ? "bookmarks" : "readingList";
      expect(result.current.state.stateRef.current[kind].has(article.id)).toBe(true);
      expect(result.current.state.pendingAddedRef.current[kind].has(article.id)).toBe(true);
      expect(result.current.state.pendingRemovedRef.current[kind].size).toBe(0);
      expect(immediate).not.toHaveBeenCalled();
      act(() => {
        vi.runAllTimers();
      });
      expect(JSON.parse(localStorage.getItem(key)!)).toEqual([article.id]);
      expect(JSON.parse(localStorage.getItem(opposite)!)).toEqual(["opposite-existing"]);
      expect(result.current.state.readIds).toEqual(new Set(["read-existing"]));
      expect(result.current.state.likeIds).toEqual(new Set(["like-existing"]));
      expect(toast.success).toHaveBeenCalledTimes(3);
      act(() => {
        (mode === "bookmark"
          ? result.current.state.toggleBookmark
          : result.current.state.toggleReadingList)(article.id);
      });
      expect(result.current.state.stateRef.current[kind].has(article.id)).toBe(false);
      expect(result.current.state.pendingAddedRef.current[kind].has(article.id)).toBe(false);
      expect(result.current.state.pendingRemovedRef.current[kind].has(article.id)).toBe(true);
      expect(immediate).toHaveBeenCalledOnce();
      await act(async () => {
        await result.current.save(article.link, mode);
      });
      expect(result.current.state.stateRef.current[kind].has(article.id)).toBe(true);
      expect(result.current.state.pendingRemovedRef.current[kind].has(article.id)).toBe(false);
    },
  );
});
