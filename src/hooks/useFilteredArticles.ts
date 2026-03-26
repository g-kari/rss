import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { Article, DateRange } from '../types';
import { STORAGE_KEYS, storageGet, storageSet } from '../lib/storage';
import { useDebounce } from './useDebounce';

const PAGE_SIZE = 30;

/** boolean state をトグルして localStorage に保存するステート更新関数を返す */
function boolToggleWithStorage(key: string) {
  return (v: boolean): boolean => {
    const next = !v;
    storageSet(key, next ? '1' : '0');
    return next;
  };
}

interface Options {
  articles: Article[];
  feedId: string | null;
  readIds: Set<string>;
  bookmarkIds: Set<string>;
  readingListIds: Set<string>;
  selectedArticleId?: string | null;
}

export type SortOrder = 'newest' | 'oldest';

function getDateRangeStart(range: DateRange): Date | null {
  if (range === 'all') return null;
  const now = new Date();
  if (range === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (range === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  // month
  const d = new Date(now);
  d.setMonth(d.getMonth() - 1);
  return d;
}

export function useFilteredArticles({ articles, feedId, readIds, bookmarkIds, readingListIds, selectedArticleId }: Options) {
  const [unreadOnly, setUnreadOnly] = useState(() => storageGet(STORAGE_KEYS.UNREAD_ONLY) === '1');
  const [bookmarkOnly, setBookmarkOnly] = useState(() => storageGet(STORAGE_KEYS.BOOKMARK_ONLY) === '1');
  const [rawQuery, setRawQuery] = useState('');  // 入力値（即時更新）
  const query = useDebounce(rawQuery, 300);       // デバウンス済みクエリ（フィルター・ハイライト用）
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    const v = storageGet(STORAGE_KEYS.SORT_ORDER);
    return v === 'oldest' ? 'oldest' : 'newest';
  });
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const v = storageGet(STORAGE_KEYS.DATE_RANGE);
    const valid: DateRange[] = ['all', 'today', 'week', 'month'];
    return valid.includes(v as DateRange) ? (v as DateRange) : 'all';
  });
  const searchRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 直前に選択していた記事を一定時間フィルター対象外にする（未読フィルター中でも前の記事に戻れるように）
  const [gracePeriodId, setGracePeriodId] = useState<string | null>(null);
  const gracePeriodTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSelectedIdRef = useRef<string | null | undefined>(selectedArticleId);
  useEffect(() => {
    const prev = prevSelectedIdRef.current;
    prevSelectedIdRef.current = selectedArticleId;
    if (prev && prev !== selectedArticleId) {
      setGracePeriodId(prev);
      if (gracePeriodTimerRef.current) clearTimeout(gracePeriodTimerRef.current);
      gracePeriodTimerRef.current = setTimeout(() => setGracePeriodId(null), 5000);
    }
  }, [selectedArticleId]);

  // フィード切り替え時にページ・検索クエリをリセット
  useEffect(() => {
    setPage(1);
    setRawQuery('');
  }, [feedId]);

  const toggleUnreadOnly = useCallback(() => {
    setUnreadOnly(boolToggleWithStorage(STORAGE_KEYS.UNREAD_ONLY));
    setPage(1);
  }, []);

  const toggleBookmarkOnly = useCallback(() => {
    setBookmarkOnly(boolToggleWithStorage(STORAGE_KEYS.BOOKMARK_ONLY));
    setPage(1);
  }, []);

  const updateQuery = useCallback((q: string) => {
    setRawQuery(q);
    setPage(1);
  }, []);

  const toggleSortOrder = useCallback(() => {
    setSortOrder((v) => {
      const next = v === 'newest' ? 'oldest' : 'newest';
      storageSet(STORAGE_KEYS.SORT_ORDER, next);
      return next;
    });
    setPage(1);
  }, []);

  const cycleDateRange = useCallback(() => {
    const cycle: DateRange[] = ['all', 'today', 'week', 'month'];
    setDateRange((v) => {
      const next = cycle[(cycle.indexOf(v) + 1) % cycle.length];
      storageSet(STORAGE_KEYS.DATE_RANGE, next);
      return next;
    });
    setPage(1);
  }, []);

  const loadMore = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '120px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const filtered = useMemo(() => {
    // 現在表示中の記事は既読でもリストに残す（前後ナビが消えないようにするため）
    // gracePeriodId: 直前まで表示していた記事を5秒間保持（未読フィルター中でも前の記事に戻れるように）
    const isActive = (id: string) => id === selectedArticleId || id === gracePeriodId;
    const q = query.trim().toLowerCase();
    const rangeStart = getDateRangeStart(dateRange);

    let list = articles.filter((a) => {
      // フィード絞り込み
      if (feedId === '__bookmarks__') { if (!bookmarkIds.has(a.id)) return false; }
      else if (feedId === '__reading_list__') { if (!readingListIds.has(a.id)) return false; }
      else if (feedId && a.feedHash !== feedId) return false;

      // 未読フィルター
      if (unreadOnly && readIds.has(a.id) && !isActive(a.id)) return false;

      // ブックマークフィルター
      if (bookmarkOnly && !bookmarkIds.has(a.id) && !isActive(a.id)) return false;

      // 検索クエリ（スペース区切りで複数ワード AND 検索）
      if (q) {
        const terms = q.split(/\s+/).filter(Boolean);
        const titleL = a.title.toLowerCase();
        const summaryL = a.summary.toLowerCase();
        if (!terms.every((t) => titleL.includes(t) || summaryL.includes(t))) return false;
      }

      // 日付範囲
      if (rangeStart && (!a.publishedAt || new Date(a.publishedAt) < rangeStart)) return false;

      return true;
    });

    if (sortOrder === 'oldest') {
      list = [...list].reverse();
    }
    return list;
  }, [articles, feedId, readIds, bookmarkIds, readingListIds, unreadOnly, bookmarkOnly, query, sortOrder, dateRange, selectedArticleId, gracePeriodId]);

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < filtered.length;

  return {
    filtered,
    visible,
    hasMore,
    unreadOnly,
    toggleUnreadOnly,
    bookmarkOnly,
    toggleBookmarkOnly,
    sortOrder,
    toggleSortOrder,
    dateRange,
    cycleDateRange,
    query,        // デバウンス済み（フィルター・ハイライト用）
    rawQuery,     // 即時値（検索 input の value 用）
    updateQuery,
    searchRef,
    sentinelRef,
  };
}
