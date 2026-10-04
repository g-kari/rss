import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReadState } from "./useReadState";
import { useSaveArticleUrl } from "./useSaveArticleUrl";
import { apiFetch } from "../lib/api-fetch";
import { saveReadState, fetchReadState } from "../lib/read-state-sync-api";
import { saveSet, STORAGE_KEYS, flushDeferredSaves } from "../lib/storage";
import type { Article, ReadState, UserProfile } from "../types";
vi.mock("../lib/api-fetch", () => ({ apiFetch: vi.fn() }));
vi.mock("../lib/read-state-sync-api", () => ({ saveReadState: vi.fn(), fetchReadState: vi.fn() }));
const article: Article = {
  id: "saved-review",
  feedHash: "__saved__",
  title: "Synthetic",
  guid: "saved",
  link: "https://example.test/read",
  summary: "",
  publishedAt: "2026-10-04T00:00:00Z",
  createdAt: "2026-10-04T00:00:00Z",
};
const user: UserProfile = {
  id: "review-user",
  sub: "review-user",
  name: "Synthetic",
  email: "synthetic@example.test",
  picture: null,
};
let completeOldSync!: (response: { ok: boolean; state?: ReadState }) => void;
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.useFakeTimers();
  vi.mocked(fetchReadState).mockResolvedValue(null);
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify(article)));
  vi.mocked(saveReadState)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completeOldSync = resolve;
        }),
    )
    .mockResolvedValue({ ok: false });
});
afterEach(() => {
  cleanup();
  flushDeferredSaves();
  vi.useRealTimers();
});
describe("independent URL-save and failed in-flight removal boundary", () => {
  it.each(["bookmark", "reading_list"] as const)(
    "%s re-save should not restore an obsolete queued removal",
    async (mode) => {
      const key = mode === "bookmark" ? STORAGE_KEYS.BOOKMARK_IDS : STORAGE_KEYS.READING_LIST_IDS;
      const payloadKey = mode === "bookmark" ? "bookmarkIds" : "readingListIds";
      saveSet(key, new Set([article.id]));
      const { result } = renderHook(() => {
        const state = useReadState(user, []);
        const save = useSaveArticleUrl({
          prependArticle: () => {},
          addBookmark: state.addBookmark,
          addReadingList: state.addReadingList,
          toast: { success: () => {} },
        });
        return { state, save };
      });
      await act(async () => {
        await Promise.resolve();
      });
      act(() =>
        (mode === "bookmark"
          ? result.current.state.toggleBookmark
          : result.current.state.toggleReadingList)(article.id),
      );
      act(() => vi.advanceTimersByTime(1));
      expect(saveReadState).toHaveBeenCalledTimes(1);
      const first = JSON.parse(vi.mocked(saveReadState).mock.calls[0][0]);
      expect(first.removedIds[payloadKey]).toContain(article.id);
      await act(async () => {
        expect(await result.current.save(article.link, mode)).toEqual({ ok: true });
      });
      expect(
        (mode === "bookmark"
          ? result.current.state.bookmarkIds
          : result.current.state.readingListIds
        ).has(article.id),
      ).toBe(true);
      await act(async () => {
        completeOldSync({ ok: false });
        await Promise.resolve();
      });
      act(() => window.dispatchEvent(new Event("online")));
      expect(saveReadState).toHaveBeenCalledTimes(2);
      const retry = JSON.parse(vi.mocked(saveReadState).mock.calls[1][0]);
      expect(retry[payloadKey]).toContain(article.id);
      expect(retry.removedIds[payloadKey]).not.toContain(article.id);
    },
  );
});

describe("independent non-overlapping recovery control", () => {
  it.each(["bookmark", "reading_list"] as const)(
    "%s save after old removal failure clears that removal",
    async (mode) => {
      const key = mode === "bookmark" ? STORAGE_KEYS.BOOKMARK_IDS : STORAGE_KEYS.READING_LIST_IDS;
      const payloadKey = mode === "bookmark" ? "bookmarkIds" : "readingListIds";
      saveSet(key, new Set([article.id]));
      const { result } = renderHook(() => {
        const state = useReadState(user, []);
        const save = useSaveArticleUrl({
          prependArticle: () => {},
          addBookmark: state.addBookmark,
          addReadingList: state.addReadingList,
          toast: { success: () => {} },
        });
        return { state, save };
      });
      await act(async () => {
        await Promise.resolve();
      });
      act(() =>
        (mode === "bookmark"
          ? result.current.state.toggleBookmark
          : result.current.state.toggleReadingList)(article.id),
      );
      act(() => vi.advanceTimersByTime(1));
      await act(async () => {
        completeOldSync({ ok: false });
        await Promise.resolve();
      });
      await act(async () => {
        expect(await result.current.save(article.link, mode)).toEqual({ ok: true });
      });
      act(() => window.dispatchEvent(new Event("online")));
      const retry = JSON.parse(vi.mocked(saveReadState).mock.calls[1][0]);
      expect(retry[payloadKey]).toContain(article.id);
      expect(retry.removedIds[payloadKey]).not.toContain(article.id);
    },
  );
});

describe("newer ordinary removal wins over failed in-flight save addition", () => {
  it.each(["bookmark", "reading_list"] as const)(
    "%s retains the later removal intent",
    async (mode) => {
      const payloadKey = mode === "bookmark" ? "bookmarkIds" : "readingListIds";
      const { result } = renderHook(() => {
        const state = useReadState(user, []);
        const save = useSaveArticleUrl({
          prependArticle: () => {},
          addBookmark: state.addBookmark,
          addReadingList: state.addReadingList,
          toast: { success: () => {} },
        });
        return { state, save };
      });
      await act(async () => {
        await result.current.save(article.link, mode);
      });
      act(() => vi.advanceTimersByTime(5000));
      expect(saveReadState).toHaveBeenCalledTimes(1);
      act(() =>
        (mode === "bookmark"
          ? result.current.state.toggleBookmark
          : result.current.state.toggleReadingList)(article.id),
      );
      act(() => vi.advanceTimersByTime(1));
      await act(async () => {
        completeOldSync({ ok: false });
        await Promise.resolve();
      });
      expect(saveReadState).toHaveBeenCalledTimes(2);
      const retry = JSON.parse(vi.mocked(saveReadState).mock.calls[1][0]);
      expect(retry[payloadKey]).not.toContain(article.id);
      expect(retry.removedIds[payloadKey]).toContain(article.id);
      expect(
        (mode === "bookmark"
          ? result.current.state.bookmarkIds
          : result.current.state.readingListIds
        ).has(article.id),
      ).toBe(false);
    },
  );
});
