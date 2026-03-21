import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { Article } from '../types';

const PAGE_SIZE = 30;

interface Options {
  articles: Article[];
  feedId: string | null;
  readIds: Set<string>;
  bookmarkIds: Set<string>;
}

export type SortOrder = 'newest' | 'oldest';

export function useFilteredArticles({ articles, feedId, readIds, bookmarkIds }: Options) {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const searchRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // フィード切り替え時にページ・検索クエリをリセット
  useEffect(() => {
    setPage(1);
    setQuery('');
  }, [feedId]);

  const toggleUnreadOnly = useCallback(() => {
    setUnreadOnly((v) => !v);
    setPage(1);
  }, []);

  const updateQuery = useCallback((q: string) => {
    setQuery(q);
    setPage(1);
  }, []);

  const toggleSortOrder = useCallback(() => {
    setSortOrder((v) => (v === 'newest' ? 'oldest' : 'newest'));
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
        : feedId
          ? articles.filter((a) => a.feedId === feedId)
          : articles;
    if (unreadOnly) list = list.filter((a) => !readIds.has(a.id));
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (a) => a.title.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q),
      );
    }
    if (sortOrder === 'oldest') {
      list = [...list].reverse();
    }
    return list;
  }, [articles, feedId, readIds, bookmarkIds, unreadOnly, query, sortOrder]);

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < filtered.length;

  return {
    filtered,
    visible,
    hasMore,
    unreadOnly,
    toggleUnreadOnly,
    sortOrder,
    toggleSortOrder,
    query,
    updateQuery,
    searchRef,
    sentinelRef,
  };
}
