import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { Article, DateRange, Feed } from "../types";
import { STORAGE_KEYS, storageGet, storageSet } from "../lib/storage";
import { useDebounce } from "./useDebounce";
import { matchesKeywordFilter } from "../lib/keyword-filter";
import { articleMatchesQuery } from "../lib/article-utils";

const PAGE_SIZE = 30;

/** boolean state をトグルして localStorage に保存するステート更新関数を返す */
function boolToggleWithStorage(key: string) {
  return (v: boolean): boolean => {
    const next = !v;
    storageSet(key, next ? "1" : "0");
    return next;
  };
}

interface Options {
  articles: Article[];
  feeds?: Feed[];
  feedId: string | null;
  readIds: Set<string>;
  bookmarkIds: Set<string>;
  readingListIds: Set<string>;
  historyIds?: Set<string>;
  historyOrder?: string[];
  selectedArticleId?: string | null;
  nsfwMode?: boolean;
  nsfwFeedIds?: Set<string>;
}

export type SortOrder = "newest" | "oldest";

function getDateRangeStart(range: DateRange): Date | null {
  if (range === "all") return null;
  const now = new Date();
  if (range === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (range === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  // month
  const d = new Date(now);
  d.setMonth(d.getMonth() - 1);
  return d;
}

export function useFilteredArticles({
  articles,
  feeds = [],
  feedId,
  readIds,
  bookmarkIds,
  readingListIds,
  historyIds = new Set<string>(),
  historyOrder = [],
  selectedArticleId,
  nsfwMode = false,
  nsfwFeedIds = new Set<string>(),
}: Options) {
  const [unreadOnly, setUnreadOnly] = useState(() => storageGet(STORAGE_KEYS.UNREAD_ONLY) === "1");
  const [bookmarkOnly, setBookmarkOnly] = useState(
    () => storageGet(STORAGE_KEYS.BOOKMARK_ONLY) === "1",
  );
  const [rawQuery, setRawQuery] = useState(""); // 入力値（即時更新）
  const query = useDebounce(rawQuery, 300); // デバウンス済みクエリ（フィルター・ハイライト用）
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    const v = storageGet(STORAGE_KEYS.SORT_ORDER);
    return v === "oldest" ? "oldest" : "newest";
  });
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const v = storageGet(STORAGE_KEYS.DATE_RANGE);
    const valid: DateRange[] = ["all", "today", "week", "month"];
    return valid.includes(v as DateRange) ? (v as DateRange) : "all";
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
    return () => {
      if (gracePeriodTimerRef.current) clearTimeout(gracePeriodTimerRef.current);
    };
  }, [selectedArticleId]);

  // フィード切り替え時にページ・検索クエリをリセット
  useEffect(() => {
    setPage(1);
    setRawQuery("");
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
      const next = v === "newest" ? "oldest" : "newest";
      storageSet(STORAGE_KEYS.SORT_ORDER, next);
      return next;
    });
    setPage(1);
  }, []);

  const cycleDateRange = useCallback(() => {
    const cycle: DateRange[] = ["all", "today", "week", "month"];
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

  // フィードごとのキーワードフィルターマップ
  const feedFilterMap = useMemo(() => {
    const map = new Map<string, NonNullable<Feed["filter"]>>();
    for (const f of feeds) {
      if (f.filter && (f.filter.include.length > 0 || f.filter.exclude.length > 0)) {
        map.set(f.id, f.filter);
      }
    }
    return map;
  }, [feeds]);

  const filtered = useMemo(() => {
    // 現在表示中の記事は既読でもリストに残す（前後ナビが消えないようにするため）
    // gracePeriodId: 直前まで表示していた記事を5秒間保持（未読フィルター中でも前の記事に戻れるように）
    const isActive = (id: string) => id === selectedArticleId || id === gracePeriodId;
    const q = query.trim().toLowerCase();
    const rangeStart = getDateRangeStart(dateRange);

    let list = articles.filter((a) => {
      // フィード絞り込み
      if (feedId === "__bookmarks__") {
        if (!bookmarkIds.has(a.id)) return false;
      } else if (feedId === "__reading_list__") {
        if (!readingListIds.has(a.id)) return false;
      } else if (feedId === "__history__") {
        if (!historyIds.has(a.id)) return false;
      } else if (feedId && a.feedHash !== feedId) return false;

      // NSFW フィード — NSFW モードでなければ非表示
      if (!nsfwMode && nsfwFeedIds.has(a.feedHash) && !isActive(a.id)) return false;

      // キーワードフィルター（アクティブな記事はフィルタ対象外）
      if (!isActive(a.id)) {
        const kf = feedFilterMap.get(a.feedHash);
        if (kf && !matchesKeywordFilter(a, kf)) return false;
      }

      // 未読フィルター
      if (unreadOnly && readIds.has(a.id) && !isActive(a.id)) return false;

      // ブックマークフィルター
      if (bookmarkOnly && !bookmarkIds.has(a.id) && !isActive(a.id)) return false;

      // 検索クエリ（title・summary・author・categories を AND 検索）
      if (q && !articleMatchesQuery(a, q)) return false;

      // 日付範囲
      if (rangeStart && (!a.publishedAt || new Date(a.publishedAt) < rangeStart)) return false;

      return true;
    });

    // 履歴モードは viewedAt 降順（最近閲覧順）で固定
    if (feedId === "__history__") {
      const orderMap = new Map(historyOrder.map((id, i) => [id, i]));
      list = [...list].sort(
        (a, b) => (orderMap.get(a.id) ?? Infinity) - (orderMap.get(b.id) ?? Infinity),
      );
    } else if (sortOrder === "oldest") {
      list = [...list].reverse();
    }
    return list;
  }, [
    articles,
    feedId,
    feedFilterMap,
    readIds,
    bookmarkIds,
    readingListIds,
    historyIds,
    historyOrder,
    unreadOnly,
    bookmarkOnly,
    query,
    sortOrder,
    dateRange,
    selectedArticleId,
    gracePeriodId,
    nsfwMode,
    nsfwFeedIds,
  ]);

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < filtered.length;

  // hasMore を依存配列に含めることで、記事が非同期でロードされて
  // sentinel が初めてマウントされたタイミングでも observer をセットアップできる
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "120px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, hasMore]);

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
    query, // デバウンス済み（フィルター・ハイライト用）
    rawQuery, // 即時値（検索 input の value 用）
    updateQuery,
    searchRef,
    sentinelRef,
  };
}
