"use client";

import { useCallback, useState } from "react";
import { STORAGE_KEYS, loadSet, toggleSetItem } from "../lib/storage";

const loadPinnedFeedIds = () => loadSet(STORAGE_KEYS.PINNED_FEED_IDS);
const loadCollapsedCategories = () => loadSet(STORAGE_KEYS.COLLAPSED_CATEGORIES);

/**
 * ピン留めフィード ID と折りたたみカテゴリ名を管理するフック。
 * どちらも要素数が小さい Set なので localStorage 同期保存（deferred=false）でよい。
 */
export function usePinnedAndCategories(): {
  pinnedFeedIds: Set<string>;
  togglePinFeed: (feedId: string) => void;
  collapsedCategories: Set<string>;
  toggleCollapseCategory: (category: string) => void;
} {
  const [pinnedFeedIds, setPinnedFeedIds] = useState<Set<string>>(loadPinnedFeedIds);
  const [collapsedCategories, setCollapsedCategories] =
    useState<Set<string>>(loadCollapsedCategories);

  const togglePinFeed = useCallback((feedId: string) => {
    toggleSetItem(setPinnedFeedIds, STORAGE_KEYS.PINNED_FEED_IDS, feedId, false);
  }, []);

  const toggleCollapseCategory = useCallback((category: string) => {
    toggleSetItem(setCollapsedCategories, STORAGE_KEYS.COLLAPSED_CATEGORIES, category, false);
  }, []);

  return { pinnedFeedIds, togglePinFeed, collapsedCategories, toggleCollapseCategory };
}
