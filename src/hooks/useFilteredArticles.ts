import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { Article, DateRange } from '../types';
import { STORAGE_KEYS, storageGet, storageSet } from '../lib/storage';

const PAGE_SIZE = 30;

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
  const [query, setQuery] = useState('');         // デバウンス済みクエリ（フィルター・ハイライト用）
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
    setQuery('');
  }, [feedId]);

  // 検索クエリのデバウンス（300ms）：頻繁なキー入力でフィルター再計算が走らないよう遅延させる
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(rawQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  const toggleUnreadOnly = useCallback(() => {
    setUnreadOnly((v) => {
      const next = !v;
      storageSet(STORAGE_KEYS.UNREAD_ONLY, next ? '1' : '0');
      return next;
    });
    setPage(1);
  }, []);

  const toggleBookmarkOnly = useCallback(() => {
    setBookmarkOnly((v) => {
      const next = !v;
      storageSet(STORAGE_KEYS.BOOKMARK_ONLY, next ? '1' : '0');
      return next;
    });
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
    let list =
      feedId === '__bookmarks__'
        ? articles.filter((a) => bookmarkIds.has(a.id))
        : feedId === '__reading_list__'
          ? articles.filter((a) => readingListIds.has(a.id))
          : feedId
            ? articles.filter((a) => a.feedHash === feedId)
            : articles;
    // 現在表示中の記事は既読でもリストに残す（前後ナビが消えないようにするため）
    // gracePeriodId: 直前まで表示していた記事を5秒間保持（未読フィルター中でも前の記事に戻れるように）
    if (unreadOnly) list = list.filter((a) => !readIds.has(a.id) || a.id === selectedArticleId || a.id === gracePeriodId);
    if (bookmarkOnly) list = list.filter((a) => bookmarkIds.has(a.id) || a.id === selectedArticleId || a.id === gracePeriodId);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (a) => a.title.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q),
      );
    }
    const rangeStart = getDateRangeStart(dateRange);
    if (rangeStart) {
      list = list.filter((a) => {
        if (!a.publishedAt) return false;
        return new Date(a.publishedAt) >= rangeStart;
      });
    }
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
