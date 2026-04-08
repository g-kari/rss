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
import { STORAGE_KEYS, storageGet, storageSet, loadStoredEnum } from "../lib/storage";
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

/** 列挙値を循環させて localStorage に保存し、ページをリセットするコールバックを生成する */
function makeCycler<T extends string>(
  cycle: readonly T[],
  ref: { current: T },
  storageKey: string,
  setter: Dispatch<SetStateAction<T>>,
  resetPage: () => void,
): () => T {
  return () => {
    const next = cycleValue(cycle, ref.current);
    storageSet(storageKey, next);
    setter(next);
    resetPage();
    return next;
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
  /** ミュート中のフィード ID セット — 全フィード表示時に記事を除外 */
  mutedFeedIds?: Set<string>;
  /** メモ記録（記事 ID → メモ内容） */
  notes?: Record<string, string>;
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
  mutedFeedIds,
  notes,
}: Options) {
  const [unreadOnly, setUnreadOnly] = useState(() => storageGet(STORAGE_KEYS.UNREAD_ONLY) === "1");
  const [bookmarkOnly, setBookmarkOnly] = useState(
    () => storageGet(STORAGE_KEYS.BOOKMARK_ONLY) === "1",
  );
  const [readingListOnly, setReadingListOnly] = useState(
    () => storageGet(STORAGE_KEYS.READING_LIST_ONLY) === "1",
  );
  const [likeOnly, setLikeOnly] = useState(() => storageGet(STORAGE_KEYS.LIKE_ONLY) === "1");
  const [noteOnly, setNoteOnly] = useState(() => storageGet(STORAGE_KEYS.NOTE_ONLY) === "1");
  const [authorFilter, setAuthorFilter] = useState<string | null>(null);
  const [rawQuery, setRawQuery] = useState(""); // 入力値（即時更新）
  const query = useDebounce(rawQuery, 300); // デバウンス済みクエリ（フィルター・ハイライト用）
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<SortOrder>(() =>
    loadStoredEnum(STORAGE_KEYS.SORT_ORDER, SORT_ORDER_CYCLE, "newest"),
  );
  const [dateRange, setDateRange] = useState<DateRange>(() =>
    loadStoredEnum(STORAGE_KEYS.DATE_RANGE, DATE_RANGE_CYCLE, "all"),
  );
  const [readingTimeRange, setReadingTimeRange] = useState<ReadingTimeRange>(() =>
    loadStoredEnum(STORAGE_KEYS.READING_TIME_RANGE, READING_TIME_RANGE_CYCLE, "all"),
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const sortOrderRef = useSyncedRef(sortOrder);
  const dateRangeRef = useSyncedRef(dateRange);
  const readingTimeRangeRef = useSyncedRef(readingTimeRange);

  // 直前に選択していた記事を一定時間フィルター対象外にする（未読フィルター中でも前の記事に戻れるように）
  const gracePeriodId = useGracePeriod(selectedArticleId);

  // フィード切り替え時にページ・検索クエリ・著者フィルターをリセット
  useEffect(() => {
    setPage(1);
    setRawQuery("");
    setAuthorFilter(null);
  }, [feedId]);

  const {
    toggleUnreadOnly,
    toggleBookmarkOnly,
    toggleReadingListOnly,
    toggleLikeOnly,
    toggleNoteOnly,
  } = useMemo(() => {
    const resetPage = () => setPage(1);
    return {
      toggleUnreadOnly: makeFilterToggle(setUnreadOnly, STORAGE_KEYS.UNREAD_ONLY, resetPage),
      toggleBookmarkOnly: makeFilterToggle(setBookmarkOnly, STORAGE_KEYS.BOOKMARK_ONLY, resetPage),
      toggleReadingListOnly: makeFilterToggle(
        setReadingListOnly,
        STORAGE_KEYS.READING_LIST_ONLY,
        resetPage,
      ),
      toggleLikeOnly: makeFilterToggle(setLikeOnly, STORAGE_KEYS.LIKE_ONLY, resetPage),
      toggleNoteOnly: makeFilterToggle(setNoteOnly, STORAGE_KEYS.NOTE_ONLY, resetPage),
    };
  }, []);

  const updateQuery = useCallback((q: string) => {
    setRawQuery(q);
    setPage(1);
  }, []);

  const { toggleSortOrder, cycleDateRange, cycleReadingTimeRange } = useMemo(() => {
    const resetPage = () => setPage(1);
    return {
      toggleSortOrder: makeCycler(
        SORT_ORDER_CYCLE,
        sortOrderRef,
        STORAGE_KEYS.SORT_ORDER,
        setSortOrder,
        resetPage,
      ),
      cycleDateRange: makeCycler(
        DATE_RANGE_CYCLE,
        dateRangeRef,
        STORAGE_KEYS.DATE_RANGE,
        setDateRange,
        resetPage,
      ),
      cycleReadingTimeRange: makeCycler(
        READING_TIME_RANGE_CYCLE,
        readingTimeRangeRef,
        STORAGE_KEYS.READING_TIME_RANGE,
        setReadingTimeRange,
        resetPage,
      ),
    };
  }, [sortOrderRef, dateRangeRef, readingTimeRangeRef]);

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
  // 現在表示中の記事は既読でもリストに残す（前後ナビが消えないようにするため）
  // gracePeriodId: 直前まで表示していた記事を5秒間保持（未読フィルター中でも前の記事に戻れるように）
  const activeIds = useMemo(() => {
    const ids = new Set<string>();
    if (selectedArticleId) ids.add(selectedArticleId);
    if (gracePeriodId) ids.add(gracePeriodId);
    return ids;
  }, [selectedArticleId, gracePeriodId]);

  // メモがある記事 ID のセット（noteOnly フィルターで使用）
  const noteIds = useMemo(() => new Set(Object.keys(notes ?? {})), [notes]);

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
        likeOnly,
        noteOnly,
        noteIds,
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
        mutedFeedIds,
        authorFilter,
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
      likeOnly,
      noteOnly,
      noteIds,
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
      mutedFeedIds,
      authorFilter,
    ],
  );

  const filteredRef = useSyncedRef(filtered);
  useEffect(() => {
    if (serverLoadCount === 0) return;
    setPage((prev) => Math.max(prev, Math.ceil(filteredRef.current.length / PAGE_SIZE) || 1));
  }, [serverLoadCount, filteredRef]);

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < filtered.length;

  // loadMore / hasMore は ref 経由で参照することで、
  // hasMore が変化するたびに observer が disconnect/reconnect される問題を回避する。
  // sentinel が可視状態のまま再登録されると交差変化イベントが発火しないため、
  // observer は sentinel のマウント時に一度だけ登録する。
  const loadMoreRef = useSyncedRef(loadMore);
  const hasMoreRef = useSyncedRef(hasMore);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current) loadMoreRef.current();
      },
      { rootMargin: "120px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // sentinelRef は安定参照のため deps から除外。loadMoreRef / hasMoreRef は ref なので不要。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    likeOnly,
    toggleLikeOnly,
    noteOnly,
    toggleNoteOnly,
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
    authorFilter,
    setAuthorFilter,
  };
}
