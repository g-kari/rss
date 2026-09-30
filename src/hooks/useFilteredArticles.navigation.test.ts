import { useLayoutEffect } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeArticle } from "../../e2e/helpers/article";
import { makeFeed } from "../../e2e/helpers/feed";
import type { Article } from "../types";
import { useFilteredArticles } from "./useFilteredArticles";
import { useDelayedGalleryItems } from "./useDelayedGalleryItems";
import { useArticleNavigation } from "./useArticleNavigation";

const EMPTY = new Set<string>();
const getId = (article: Article) => article.id;
const noop = () => {};
const articles = ["a", "b", "c", "d"].map((id, index) =>
  makeArticle({
    id,
    guid: id,
    feedHash: "feed",
    link: `https://example.com/${id}`,
    publishedAt: `2026-09-30T12:0${4 - index}:00Z`,
  }),
);
const feeds = [makeFeed({ id: "feed" })];

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("unread article navigation", () => {
  it.each([250, 300])(
    "does not remove/re-add the previous selection (%i ms list/gallery delay)",
    (delay) => {
      const committed: { filtered: string[]; newIds: string[]; deletingIds: string[] }[] = [];
      const { result, rerender } = renderHook(
        ({ selected, readIds }) => {
          const filter = useFilteredArticles({
            articles,
            feeds,
            feedId: null,
            readIds,
            bookmarkIds: EMPTY,
            readingListIds: EMPTY,
            globalFilter: null,
            setGlobalFilter: noop,
            selectedArticleId: selected.id,
          });
          // All four articles fit on one page. Keep the parent/child array boundary
          // stable here: pagination slices visible again when this test hook renders.
          const display = useDelayedGalleryItems(filter.filtered, getId, delay);
          const navigation = useArticleNavigation(selected, filter.filtered);
          useLayoutEffect(() => {
            committed.push({
              filtered: filter.filtered.map(getId),
              newIds: [...display.newIds],
              deletingIds: [...display.deletingIds],
            });
          });
          return { filter, display, navigation };
        },
        { initialProps: { selected: articles[0], readIds: new Set(["a"]) } },
      );
      act(() => result.current.filter.toggleUnreadOnly());
      committed.length = 0;
      rerender({ selected: articles[1], readIds: new Set(["a", "b"]) });
      expect(committed.every((entry) => entry.filtered.includes("a"))).toBe(true);
      expect(committed.every((entry) => !entry.newIds.includes("a"))).toBe(true);
      expect(committed.every((entry) => !entry.deletingIds.includes("a"))).toBe(true);
      expect(result.current.navigation.prevArticle?.id).toBe("a");
      expect(result.current.navigation.nextArticle?.id).toBe("c");

      committed.length = 0;
      rerender({ selected: articles[2], readIds: new Set(["a", "b", "c"]) });
      expect(committed.every((entry) => entry.filtered.includes("b"))).toBe(true);
      expect(committed.every((entry) => !entry.newIds.includes("b"))).toBe(true);
      expect(committed.every((entry) => !entry.deletingIds.includes("b"))).toBe(true);
      expect(result.current.display.displayItems.map(getId)).toEqual(["a", "b", "c", "d"]);
      act(() => vi.advanceTimersByTime(delay));
      expect(result.current.display.displayItems.map(getId)).toEqual(["b", "c", "d"]);
      expect(result.current.navigation.prevArticle?.id).toBe("b");
      expect(result.current.navigation.nextArticle?.id).toBe("d");

      committed.length = 0;
      rerender({ selected: articles[1], readIds: new Set(["a", "b", "c"]) });
      expect(committed.every((entry) => entry.filtered.includes("c"))).toBe(true);
      expect(committed.every((entry) => !entry.newIds.includes("c"))).toBe(true);
      expect(committed.every((entry) => !entry.deletingIds.includes("c"))).toBe(true);
      expect(result.current.display.displayItems.map(getId)).toEqual(["b", "c", "d"]);
      expect(result.current.navigation.nextArticle?.id).toBe("c");
    },
  );
});
