"use client";

import { type RefObject } from "react";
import { useSyncedRef } from "./useSyncedRef";
import { useEventListener } from "./useEventListener";
import type {
  Article,
  Feed,
  FontFamily,
  FontSize,
  Layout,
  DateRange,
  SortOrder,
  ReadingTimeRange,
} from "../types";
import { getShortcutDef, type ShortcutContext } from "../config/shortcuts";

interface KeyboardNavOptions {
  filteredArticles: Article[];
  feeds: Feed[];
  pinnedFeedIds: Set<string>;
  selectedFeedId: string | null;
  selectedArticle: Article | null;
  readIds: Set<string>;
  readBeforeTimestamp: string | null;
  readingListIds: Set<string>;
  likeIds: Set<string>;
  setSelectedArticle: (article: Article) => void;
  onSelectFeed: (id: string | null) => void;
  markRead: (id: string) => void;
  markBulkRead: (ids: string[]) => void;
  markAllRead: (feedId: string | null) => void;
  toggleBookmark: (id: string) => void;
  toggleRead: (id: string) => void;
  toggleReadingList: (id: string) => void;
  toggleLike: (id: string) => void;
  showToast: (msg: string) => void;
  fontSize: FontSize;
  onChangeFontSize: (size: FontSize) => void;
  fontFamily: FontFamily;
  onChangeFontFamily: (family: FontFamily) => void;
  layout: Layout;
  onChangeLayout: (layout: Layout) => void;
  unreadOnly: boolean;
  toggleUnreadOnly: () => void;
  bookmarkOnly: boolean;
  toggleBookmarkOnly: () => void;
  readingListOnly: boolean;
  toggleReadingListOnly: () => void;
  likeOnly: boolean;
  toggleLikeOnly: () => void;
  digestMode: boolean;
  toggleDigestMode: () => void;
  toggleSortOrder: () => SortOrder;
  cycleDateRange: () => DateRange;
  cycleReadingTimeRange: () => ReadingTimeRange;
  readingTimeRange: ReadingTimeRange;
  searchRef: RefObject<HTMLInputElement | null>;
  refreshFeeds: () => Promise<void>;
  retryFeed: (feedId: string) => Promise<void>;
  snoozeArticle: (articleId: string, durationMs: number) => void;
  onShowSnoozeMenu: (articleId: string) => void;
  onShowFeedSwitcher: () => void;
}

function buildContext(opts: KeyboardNavOptions): ShortcutContext {
  const list = opts.filteredArticles;
  const idx = opts.selectedArticle ? list.findIndex((a) => a.id === opts.selectedArticle!.id) : -1;

  return {
    list,
    idx,
    selectedArticle: opts.selectedArticle,
    selectedFeedId: opts.selectedFeedId,
    feeds: opts.feeds,
    pinnedFeedIds: opts.pinnedFeedIds,
    readIds: opts.readIds,
    readBeforeTimestamp: opts.readBeforeTimestamp,
    readingListIds: opts.readingListIds,
    likeIds: opts.likeIds,
    fontSize: opts.fontSize,
    fontFamily: opts.fontFamily,
    layout: opts.layout,
    unreadOnly: opts.unreadOnly,
    bookmarkOnly: opts.bookmarkOnly,
    readingListOnly: opts.readingListOnly,
    likeOnly: opts.likeOnly,
    digestMode: opts.digestMode,
    navigateTo: (article) => {
      if (article) {
        opts.setSelectedArticle(article);
        opts.markRead(article.id);
      }
    },
    onSelectFeed: opts.onSelectFeed,
    markBulkRead: opts.markBulkRead,
    markAllRead: opts.markAllRead,
    toggleBookmark: opts.toggleBookmark,
    toggleRead: opts.toggleRead,
    toggleReadingList: opts.toggleReadingList,
    toggleLike: opts.toggleLike,
    showToast: opts.showToast,
    onChangeFontSize: opts.onChangeFontSize,
    onChangeFontFamily: opts.onChangeFontFamily,
    onChangeLayout: opts.onChangeLayout,
    toggleUnreadOnly: opts.toggleUnreadOnly,
    toggleBookmarkOnly: opts.toggleBookmarkOnly,
    toggleReadingListOnly: opts.toggleReadingListOnly,
    toggleLikeOnly: opts.toggleLikeOnly,
    toggleDigestMode: opts.toggleDigestMode,
    toggleSortOrder: opts.toggleSortOrder,
    cycleDateRange: opts.cycleDateRange,
    cycleReadingTimeRange: opts.cycleReadingTimeRange,
    searchRef: opts.searchRef,
    refreshFeeds: opts.refreshFeeds,
    retryFeed: opts.retryFeed,
    onShowSnoozeMenu: opts.onShowSnoozeMenu,
    onShowFeedSwitcher: opts.onShowFeedSwitcher,
  };
}

export function useKeyboardNav(options: KeyboardNavOptions): void {
  const ref = useSyncedRef(options);

  function handleKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const def = getShortcutDef(e.key);
    if (!def?.handler) return;

    def.handler(buildContext(ref.current), e);
  }

  useEventListener("keydown", handleKeyDown, document);
}
