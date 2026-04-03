import {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  Article,
  DateRange,
  Feed,
  KeywordFilter,
  ReadingTimeRange,
  SortOrder,
} from "../types";
import { useSyncedRef } from "./useSyncedRef";
import { STORAGE_KEYS, storageGet, storageSet } from "../lib/storage";
import { useDebounce } from "./useDebounce";
import { useGracePeriod } from "./useGracePeriod";
import {
  cycleValue,
  DATE_RANGE_CYCLE,
  READING_TIME_RANGE_CYCLE,
  SORT_ORDER_CYCLE,
} from "../lib/article-utils";
import { filterAndSortArticles } from "../lib/article-filter";
import { buildFilterMap, normalizeFilter } from "../lib/keyword-filter";

const PAGE_SIZE = 30;
const EMPTY_SET = new Set<string>();
const EMPTY_STR_ARRAY: string[] = [];
const EMPTY_FEED_ARRAY: Feed[] = [];

/** boolean フィルタートグル + localStorage 保存 + ページリセットを行うコールバックを生成する */
function makeFilterToggle(
  setter: Dispatch<SetStateAction<boolean>>,
  key: string,
  resetPage: () => void,
): () => void {
  return () => {
    setter((v) => {
      const next = !v;
      storageSet(key, next ? "1" : "0");
      return next;
    });
    resetPage();
  };
}

interface Options {
  /** フィルタリング対象の全記事リスト */
  articles: Article[];
  /** フィード一覧（各フィードのキーワードフィルター適用に使用） */
  feeds?: Feed[];
  /** 表示対象のフィード ID。null の場合は全フィード */
  feedId: string | null;
  /** 既読記事 ID のセット */
  readIds: Set<string>;
  /** ブックマーク済み記事 ID のセット */
  bookmarkIds: Set<string>;
  /** 後で読む記事 ID のセット */
  readingListIds: Set<string>;
  /** いいね済み記事 ID のセット */
  likeIds?: Set<string>;
  /** 閲覧履歴にある記事 ID のセット */
  historyIds?: Set<string>;
  /** 閲覧履歴の表示順（記事 ID の配列） */
  historyOrder?: string[];
  /** 現在選択中の記事 ID（フィルターから除外してリストに残すため） */
  selectedArticleId?: string | null;
  /** NSFW コンテンツを表示するかどうか */
  nsfwMode?: boolean;
  /** NSFW 指定されたフィードの ID セット */
  nsfwFeedIds?: Set<string>;
  /** グローバルキーワードフィルター（全フィード共通） */
  globalFilter: KeywordFilter | null;
  /** グローバルキーワードフィルターの更新コールバック */
  setGlobalFilter: (filter: KeywordFilter | null) => void;
  /**
   * この timestamp より前に既読になった記事を未読扱いにするカットオフ点。
   * 「ここまで読んだ」機能で使用し、古い記事を再び未読フィルターに含める。
   */
  readBeforeTimestamp?: string | null;
  /** スヌーズ中の記事 ID → スヌーズ解除 ISO 日時文字列のマップ */
  snoozedUntil?: Record<string, string>;
}

/**
 * 記事リストのフィルタリング・ソート・ページネーションを管理するフック。
 *
 * ## 主な責務
 * - 未読のみ・ブックマーク・後で読む・検索クエリ・日付範囲・ソート順によるフィルタリング
 * - フィード別キーワードフィルター (`feedFilterMap`) とグローバルキーワードフィルターの適用
 * - IntersectionObserver による無限スクロール（`sentinelRef` を画面外端に置くことで発火）
 * - サーバーから過去記事が追加された際の `page` 自動拡張（`notifyArticlesAdded` 経由）
 * - 現在選択中の記事・直前に選択していた記事（猶予期間中）をフィルター対象外に保持
 * - フィルター状態の localStorage 永続化
 *
 * ## ページネーション設計
 * `filtered` が全マッチ記事、`visible` が `page * PAGE_SIZE` 件に切り取った表示用リスト。
 * `sentinelRef` は記事リストの末尾に配置し、画面に入ったとき `loadMore()` を呼び出す。
 *
 * ## サーバーロード後の page 拡張
 * `notifyArticlesAdded()` を呼ぶと `serverLoadCount` がインクリメントされ、
 * 次の render で `filtered.length` を参照して `page` を必要な値まで拡張する。
 * `filtered` を直接 deps に含めると通常のフィルター切り替えでも発火するため意図的に除外している。
 */
export function useFilteredArticles({
  articles,
  feeds = EMPTY_FEED_ARRAY,
  feedId,
  readIds,
  bookmarkIds,
  readingListIds,
  likeIds = EMPTY_SET,
  historyIds = EMPTY_SET,
  historyOrder = EMPTY_STR_ARRAY,
  selectedArticleId,
  nsfwMode = false,
  nsfwFeedIds = EMPTY_SET,
  globalFilter,
  setGlobalFilter,
  readBeforeTimestamp = null,
  snoozedUntil,
}: Options) {
  const [unreadOnly, setUnreadOnly] = useState(() => storageGet(STORAGE_KEYS.UNREAD_ONLY) === "1");
  const [bookmarkOnly, setBookmarkOnly] = useState(
    () => storageGet(STORAGE_KEYS.BOOKMARK_ONLY) === "1",
  );
  const [readingListOnly, setReadingListOnly] = useState(
    () => storageGet(STORAGE_KEYS.READING_LIST_ONLY) === "1",
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
    return DATE_RANGE_CYCLE.includes(v as DateRange) ? (v as DateRange) : "all";
  });
  const [readingTimeRange, setReadingTimeRange] = useState<ReadingTimeRange>(() => {
    const v = storageGet(STORAGE_KEYS.READING_TIME_RANGE);
    return READING_TIME_RANGE_CYCLE.includes(v as ReadingTimeRange)
      ? (v as ReadingTimeRange)
      : "all";
  });
  const searchRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const dateRangeRef = useSyncedRef(dateRange);
  const readingTimeRangeRef = useSyncedRef(readingTimeRange);

  // 直前に選択していた記事を一定時間フィルター対象外にする（未読フィルター中でも前の記事に戻れるように）
  const gracePeriodId = useGracePeriod(selectedArticleId);

  // フィード切り替え時にページ・検索クエリをリセット
  useEffect(() => {
    setPage(1);
    setRawQuery("");
  }, [feedId]);

  const { toggleUnreadOnly, toggleBookmarkOnly, toggleReadingListOnly } = useMemo(() => {
    const resetPage = () => setPage(1);
    return {
      toggleUnreadOnly: makeFilterToggle(setUnreadOnly, STORAGE_KEYS.UNREAD_ONLY, resetPage),
      toggleBookmarkOnly: makeFilterToggle(setBookmarkOnly, STORAGE_KEYS.BOOKMARK_ONLY, resetPage),
      toggleReadingListOnly: makeFilterToggle(
        setReadingListOnly,
        STORAGE_KEYS.READING_LIST_ONLY,
        resetPage,
      ),
    };
  }, []);

  const updateQuery = useCallback((q: string) => {
    setRawQuery(q);
    setPage(1);
  }, []);

  const toggleSortOrder = useCallback(() => {
    setSortOrder((v) => {
      const next = cycleValue(SORT_ORDER_CYCLE, v);
      storageSet(STORAGE_KEYS.SORT_ORDER, next);
      return next;
    });
    setPage(1);
  }, []);

  const cycleDateRange = useCallback((): DateRange => {
    const next = cycleValue(DATE_RANGE_CYCLE, dateRangeRef.current);
    storageSet(STORAGE_KEYS.DATE_RANGE, next);
    setDateRange(next);
    setPage(1);
    return next;
  }, []);

  const cycleReadingTimeRange = useCallback((): ReadingTimeRange => {
    const next = cycleValue(READING_TIME_RANGE_CYCLE, readingTimeRangeRef.current);
    storageSet(STORAGE_KEYS.READING_TIME_RANGE, next);
    setReadingTimeRange(next);
    setPage(1);
    return next;
  }, []);

  const loadMore = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  // サーバーから過去記事が追加された後、filtered の全記事が visible になるよう page を拡張する。
  // LoadMoreButton 経由のサーバーロード完了後に呼び出すことで、
  // IntersectionObserver が発火しなかった場合でも新着記事が確実に表示される。
  const [serverLoadCount, setServerLoadCount] = useState(0);
  const notifyArticlesAdded = useCallback(() => {
    setServerLoadCount((c) => c + 1);
  }, []);
  useEffect(() => {
    if (serverLoadCount === 0) return;
    // filtered は React の render 後に最新値になるため、ここで正しい長さが得られる
    setPage((prev) => Math.max(prev, Math.ceil(filtered.length / PAGE_SIZE) || 1));
    // filtered を deps に含めると filter 切り替え時にも発火してしまうため意図的に除外する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverLoadCount]);

  // 現在表示中の記事は既読でもリストに残す（前後ナビが消えないようにするため）
  // gracePeriodId: 直前まで表示していた記事を5秒間保持（未読フィルター中でも前の記事に戻れるように）
  const activeIds = useMemo(() => {
    const ids = new Set<string>();
    if (selectedArticleId) ids.add(selectedArticleId);
    if (gracePeriodId) ids.add(gracePeriodId);
    return ids;
  }, [selectedArticleId, gracePeriodId]);

  // feeds が変わったときだけ再構築（フィルター変更時や既読切り替えでは再利用される）
  const feedFilterMap = useMemo(() => buildFilterMap(feeds, (f) => f.id), [feeds]);
  // globalFilter も feedFilterMap と同様に変更時だけ正規化（filterAndSortArticles の hot path から除外）
  const normalizedGlobalFilter = useMemo(
    () => (globalFilter ? normalizeFilter(globalFilter) : null),
    [globalFilter],
  );

  const filtered = useMemo(
    () =>
      filterAndSortArticles(articles, {
        feedId,
        feedFilterMap,
        readIds,
        bookmarkIds,
        readingListIds,
        likeIds,
        historyIds,
        historyOrder,
        unreadOnly,
        bookmarkOnly,
        readingListOnly,
        query,
        sortOrder,
        dateRange,
        activeIds,
        nsfwMode,
        nsfwFeedIds,
        globalFilter: normalizedGlobalFilter,
        readBeforeTimestamp,
        snoozedUntil,
        readingTimeRange,
      }),
    [
      articles,
      feedId,
      feedFilterMap,
      readIds,
      bookmarkIds,
      readingListIds,
      likeIds,
      historyIds,
      historyOrder,
      unreadOnly,
      bookmarkOnly,
      readingListOnly,
      query,
      sortOrder,
      dateRange,
      activeIds,
      nsfwMode,
      nsfwFeedIds,
      normalizedGlobalFilter,
      readBeforeTimestamp,
      snoozedUntil,
      readingTimeRange,
    ],
  );

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
    readingListOnly,
    toggleReadingListOnly,
    sortOrder,
    toggleSortOrder,
    dateRange,
    cycleDateRange,
    query, // デバウンス済み（フィルター・ハイライト用）
    rawQuery, // 即時値（検索 input の value 用）
    updateQuery,
    searchRef,
    sentinelRef,
    globalFilter,
    setGlobalFilter,
    notifyArticlesAdded,
    readingTimeRange,
    cycleReadingTimeRange,
  };
}
