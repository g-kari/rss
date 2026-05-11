/**
 * useArticleListItemProps (#682 Phase B-1 → #634 回帰防止)
 *
 * #634 のバグ:
 *   resolveItemProps が useSyncedRef (bookmarkIdsRef 等) 経由で state を参照していたため、
 *   bookmarkIds 変更時に resolveItemProps の identity が変わらず、memo された
 *   GalleryCardRenderer (Context Consumer) が再描画されない。
 *
 * 修正 (commit 692a42f):
 *   ref ではなく state 直接参照に変更。bookmarkIds / readIds / notes / duplicateInfo を
 *   useCallback の deps 配列に追加。
 *
 * 本 spec の検証:
 *   1. bookmarkIds が変わると resolveItemProps の identity (関数 reference) が変わる
 *   2. resolveItemProps の戻り値 (`isBookmarked` / `isRead` / `hasNote`) が state を正しく反映
 *   3. ref 経由 (旧バグ実装) では deps 変化なしで identity 不変だったことの裏返し
 */
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useArticleListItemProps } from "./useArticleListItemProps";
import type { Article, Feed } from "@/types";

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: "art-1",
    feedHash: "feed-1",
    guid: "art-1",
    title: "Test article",
    link: "https://example.com/a/art-1",
    summary: "",
    publishedAt: "2026-05-12T10:00:00Z",
    createdAt: "2026-05-12T10:00:00Z",
    ...overrides,
  } as Article;
}

function makeFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    id: "feed-1",
    feedHash: "feed-1",
    url: "https://example.com/feed",
    title: "Test Feed",
    siteUrl: "https://example.com",
    subscribedAt: "2026-05-01T00:00:00Z",
    lastFetchedAt: "2026-05-12T09:00:00Z",
    articleCount: 0,
    ...overrides,
  } as Feed;
}

interface SetupParams {
  bookmarkIds?: Set<string>;
  readIds?: Set<string>;
  notes?: Record<string, string>;
}

function defaultParams(overrides: SetupParams = {}) {
  return {
    feedMap: new Map<string, Feed>([["feed-1", makeFeed()]]),
    readIds: overrides.readIds ?? new Set<string>(),
    readBeforeTimestamp: null,
    bookmarkIds: overrides.bookmarkIds ?? new Set<string>(),
    readingListIds: new Set<string>(),
    notes: overrides.notes ?? {},
    showFeedName: false,
    query: "",
    filteredCount: 1,
    ogpCache: {},
    onSelectArticle: () => {},
    onToggleRead: () => {},
    onToggleBookmark: () => {},
    onContextMenu: () => {},
  };
}

describe("useArticleListItemProps (#682 Phase B-1 / #634 回帰防止)", () => {
  it("初回 mount で resolveItemProps が返り、isBookmarked: false / isRead: false", () => {
    const { result } = renderHook(() => useArticleListItemProps(defaultParams()));
    const props = result.current.resolveItemProps(makeArticle(), 0);
    expect(props.isBookmarked).toBe(false);
    expect(props.isRead).toBe(false);
    expect(props.hasNote).toBe(false);
  });

  it("bookmarkIds 変更で resolveItemProps の identity が変わる (#634 回帰防止の核心)", () => {
    const { result, rerender } = renderHook(
      ({ bookmarkIds }) => useArticleListItemProps(defaultParams({ bookmarkIds })),
      { initialProps: { bookmarkIds: new Set<string>() } },
    );
    const firstResolve = result.current.resolveItemProps;

    // bookmarkIds に art-1 を追加して新 Set で rerender
    rerender({ bookmarkIds: new Set<string>(["art-1"]) });

    // 旧バグ (ref 経由) では identity 不変だった。修正後は別 reference になることを assert
    expect(result.current.resolveItemProps).not.toBe(firstResolve);
    // かつ戻り値も isBookmarked: true に切り替わる
    const props = result.current.resolveItemProps(makeArticle(), 0);
    expect(props.isBookmarked).toBe(true);
  });

  it("readIds 変更で identity 変化 + isRead が反映される", () => {
    const { result, rerender } = renderHook(
      ({ readIds }) => useArticleListItemProps(defaultParams({ readIds })),
      { initialProps: { readIds: new Set<string>() } },
    );
    const firstResolve = result.current.resolveItemProps;

    rerender({ readIds: new Set<string>(["art-1"]) });

    expect(result.current.resolveItemProps).not.toBe(firstResolve);
    const props = result.current.resolveItemProps(makeArticle(), 0);
    expect(props.isRead).toBe(true);
  });

  it("notes 変更で identity 変化 + hasNote が反映される", () => {
    const { result, rerender } = renderHook(
      ({ notes }) => useArticleListItemProps(defaultParams({ notes })),
      { initialProps: { notes: {} as Record<string, string> } },
    );
    const firstResolve = result.current.resolveItemProps;

    rerender({ notes: { "art-1": "memo" } });

    expect(result.current.resolveItemProps).not.toBe(firstResolve);
    const props = result.current.resolveItemProps(makeArticle(), 0);
    expect(props.hasNote).toBe(true);
  });

  it("bookmarkIds の Set reference が同一なら identity は維持される (useCallback === 比較)", () => {
    const bookmarkIds = new Set<string>();
    const params = defaultParams({ bookmarkIds });
    const { result, rerender } = renderHook((p) => useArticleListItemProps(p), {
      initialProps: params,
    });
    const firstResolve = result.current.resolveItemProps;

    // 同じ bookmarkIds reference で rerender (他 deps も同一値)
    rerender(params);

    expect(result.current.resolveItemProps).toBe(firstResolve);
  });
});
