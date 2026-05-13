"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Article, Feed, UserProfile } from "../types";
import { useOnlineStatus } from "./useOnlineStatus";
import { apiFetchJson } from "../lib/api-fetch";
import { compareByDateDesc } from "../lib/article-utils";
import { pMapSettled } from "../lib/concurrency";
import { devError } from "../lib/dev-log";
import { useSyncedRef } from "./useSyncedRef";

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const HIDDEN_POLL_INTERVAL_MS = 15 * 60 * 1000;

type FeedPageResult = { feedId: string; nextPage: number; data: Article[] };

/**
 * 記事配列を id / link / guid の重複排除付きでマージする。
 *
 * **不変性契約 (#693)**: 既存記事のオブジェクトは絶対に mutation せず、新しい配列を返す。
 * `createReadingTimeCache` (article-utils.ts) が「同 article.id のオブジェクトは
 * content / summary が変わらない」前提で memoize しているため、既存記事を mutation
 * 更新すると stale な readingTime が永続キャッシュされる。新フィールドを追加したい
 * 場合は必ず `{ ...existing, newField: value }` で新オブジェクトを生成すること。
 */
function mergeUniqueArticles(existing: Article[], incoming: Article[]): Article[] {
  if (incoming.length === 0) return existing;

  const knownKeys = new Set<string>();
  for (const a of existing) {
    knownKeys.add(a.id);
    const linkKey = a.link || a.guid || a.id;
    if (linkKey && linkKey !== a.id) knownKeys.add(linkKey);
  }

  const brandNew: Article[] = [];
  for (const a of incoming) {
    if (knownKeys.has(a.id)) continue;
    const linkKey = a.link || a.guid || a.id;
    if (linkKey && knownKeys.has(linkKey)) continue;
    knownKeys.add(a.id);
    if (linkKey && linkKey !== a.id) knownKeys.add(linkKey);
    brandNew.push(a);
  }

  if (brandNew.length === 0) return existing;
  return [...existing, ...brandNew].sort(compareByDateDesc);
}

interface ArticleDataState {
  articles: Article[];
  loadingArticles: boolean;
  newArticleCount: number;
  loadedFeedPages: Map<string, number>;
  fetchError: boolean;
  fetchAndSetArticles: () => Promise<Article[]>;
  mergeArticles: (fresh: Article[]) => void;
  removeArticlesByFeed: (feedId: string) => void;
  prependArticle: (article: Article) => void;
  dismissNewArticles: () => void;
  loadMoreFeedArticles: (feedId: string) => Promise<void>;
  loadMoreAllFeedsArticles: (feeds: Feed[]) => Promise<void>;
  skipRemainingPages: (feedId: string | null, feeds: Feed[]) => void;
  setFetchError: Dispatch<SetStateAction<boolean>>;
  setLoadingArticles: Dispatch<SetStateAction<boolean>>;
}

export function useArticleData(
  user: UserProfile | null | undefined,
  onError?: (msg: string) => void,
): ArticleDataState {
  const isOnline = useOnlineStatus();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [newArticleCount, setNewArticleCount] = useState(0);
  const [fetchError, setFetchError] = useState(false);
  const [loadedFeedPages, setLoadedFeedPages] = useState<Map<string, number>>(() => new Map());

  const loadedFeedPagesRef = useSyncedRef(loadedFeedPages);
  const loadingFeedIdsRef = useRef(new Set<string>());
  const isOnlineRef = useSyncedRef(isOnline);
  const logErrorRef = useSyncedRef((err: unknown, msg: string) => {
    devError(err);
    onError?.(msg);
  });
  const latestArticleIdRef = useRef<string | null>(null);
  const isPollingRef = useRef(false);
  const prevIsOnlineRef = useRef(isOnline);
  const lastPollTimeRef = useRef<number | null>(null);

  const userId = user?.id ?? null;

  const fetchAndSetArticles = useCallback(async (): Promise<Article[]> => {
    const fetchedAt = Date.now();
    const data = await apiFetchJson<Article[]>("/api/articles");
    setArticles(data);
    setLoadedFeedPages(new Map());
    latestArticleIdRef.current = data[0]?.id ?? null;
    lastPollTimeRef.current = fetchedAt;
    return data;
  }, []);

  const mergeArticles = useCallback((fresh: Article[]) => {
    if (fresh.length > 0) latestArticleIdRef.current = fresh[0].id;
    setArticles((prev) => mergeUniqueArticles(prev, fresh));
  }, []);

  useEffect(() => {
    if (!userId) return;
    setLoadingArticles(true);
    setFetchError(false);
    fetchAndSetArticles()
      .catch((err) => {
        logErrorRef.current(err, "記事の読み込みに失敗しました");
        setFetchError(true);
      })
      .finally(() => {
        setLoadingArticles(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- logErrorRef は useSyncedRef で安定した ref
  }, [userId, fetchAndSetArticles]);

  const pollNow = useCallback(async () => {
    const prevTopId = latestArticleIdRef.current;
    if (prevTopId === null) return;
    if (isPollingRef.current) return;
    isPollingRef.current = true;
    const pollStartTime = Date.now();
    try {
      const since = lastPollTimeRef.current;
      const url = since !== null ? `/api/articles?since=${since}` : "/api/articles";
      const fresh = await apiFetchJson<Article[]>(url);
      mergeArticles(fresh);
      if (since !== null) {
        if (fresh.length > 0) setNewArticleCount((prev) => prev + fresh.length);
      } else {
        const newIdx = fresh.findIndex((a) => a.id === prevTopId);
        if (newIdx > 0) setNewArticleCount((prev) => prev + newIdx);
      }
      lastPollTimeRef.current = pollStartTime;
    } catch (err) {
      devError("[polling] 新着記事の取得に失敗:", err);
      logErrorRef.current(err, "新着記事の取得に失敗しました");
    } finally {
      isPollingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- logErrorRef は useSyncedRef で安定した ref
  }, [mergeArticles]);

  const pollNowRef = useSyncedRef(pollNow);

  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setInterval>;
    const startTimer = () => {
      clearInterval(timer);
      const interval = document.hidden ? HIDDEN_POLL_INTERVAL_MS : POLL_INTERVAL_MS;
      timer = setInterval(() => {
        if (!isOnlineRef.current) return;
        void pollNowRef.current();
      }, interval);
    };
    startTimer();
    document.addEventListener("visibilitychange", startTimer);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", startTimer);
    };
  }, [userId, isOnlineRef, pollNowRef]);

  useEffect(() => {
    if (!userId) return;
    if (!isOnline) {
      prevIsOnlineRef.current = false;
      return;
    }
    const wasOffline = !prevIsOnlineRef.current;
    prevIsOnlineRef.current = true;
    if (!wasOffline) return;
    void pollNowRef.current();
  }, [userId, isOnline, pollNowRef]);

  const removeArticlesByFeed = useCallback((feedId: string) => {
    setArticles((prev) => prev.filter((a) => a.feedHash !== feedId));
  }, []);

  const prependArticle = useCallback((article: Article) => {
    setArticles((prev) => {
      if (prev.some((a) => a.id === article.id)) return prev;
      return [article, ...prev];
    });
  }, []);

  const dismissNewArticles = useCallback(() => {
    setNewArticleCount(0);
  }, []);

  const loadMoreFeedArticles = useCallback(async (feedId: string): Promise<void> => {
    if (loadingFeedIdsRef.current.has(feedId)) return;
    const nextPage = (loadedFeedPagesRef.current.get(feedId) ?? 1) + 1;
    loadingFeedIdsRef.current.add(feedId);
    try {
      const data = await apiFetchJson<Article[]>(`/api/articles?feed=${feedId}&page=${nextPage}`);
      setLoadedFeedPages((prev) => new Map(prev).set(feedId, nextPage));
      if (data.length === 0) return;
      setArticles((prev) => mergeUniqueArticles(prev, data));
    } catch (err) {
      logErrorRef.current(err, "過去の記事の読み込みに失敗しました");
    } finally {
      loadingFeedIdsRef.current.delete(feedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadedFeedPagesRef・loadingFeedIdsRef・logErrorRef は ref 経由で最新値を参照するため deps 不要
  }, []);

  const loadMoreAllFeedsArticles = useCallback(async (feeds: Feed[]): Promise<void> => {
    const targets = feeds.filter((f) => {
      if (!f.pageCount) return false;
      if (loadingFeedIdsRef.current.has(f.id)) return false;
      const loaded = loadedFeedPagesRef.current.get(f.id) ?? 1;
      return loaded <= f.pageCount;
    });
    if (targets.length === 0) return;
    const nextPages = new Map(
      targets.map((f) => [f.id, (loadedFeedPagesRef.current.get(f.id) ?? 1) + 1]),
    );
    for (const f of targets) loadingFeedIdsRef.current.add(f.id);
    // #778: pMapSettled で concurrency=4 に制限。
    // 旧 Promise.allSettled は targets.length 並列 (20 feeds 購読時に 20 並列発射) で
    // ブラウザ 6 並列上限超過分が queue 滞留 + サーバー側 KV/R2 競合を起こしていた。
    // pMapSettled は failure を rejected 結果に収集するため、既存の Promise.allSettled
    // 互換セマンティクス (個別 failure を全体 fail にしない) を維持する。
    const results = await pMapSettled(
      targets,
      async (f) => {
        const nextPage = nextPages.get(f.id) ?? 2;
        const data = await apiFetchJson<Article[]>(`/api/articles?feed=${f.id}&page=${nextPage}`);
        return { feedId: f.id, nextPage, data };
      },
      4,
    );
    const succeeded = results.filter(
      (r): r is PromiseFulfilledResult<FeedPageResult> => r.status === "fulfilled",
    );
    if (succeeded.length < results.length) {
      logErrorRef.current(
        "loadMoreAllFeedsArticles: some feeds failed",
        "過去の記事の読み込みに失敗しました",
      );
    }
    if (succeeded.length > 0) {
      setLoadedFeedPages((prev) => {
        const next = new Map(prev);
        for (const { value } of succeeded) next.set(value.feedId, value.nextPage);
        return next;
      });
    }
    for (const f of targets) loadingFeedIdsRef.current.delete(f.id);
    if (succeeded.length === 0) return;
    const newArticles = succeeded.flatMap(({ value }) => value.data);
    if (newArticles.length > 0) setArticles((prev) => mergeUniqueArticles(prev, newArticles));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadedFeedPagesRef・loadingFeedIdsRef・logErrorRef は ref 経由で最新値を参照するため deps 不要
  }, []);

  const skipRemainingPages = useCallback((feedId: string | null, feeds: Feed[]) => {
    const targets = feedId ? feeds.filter((f) => f.id === feedId) : feeds;
    setLoadedFeedPages((prev) => {
      const next = new Map(prev);
      for (const f of targets) {
        if (f.pageCount) next.set(f.id, f.pageCount + 1);
      }
      return next;
    });
  }, []);

  return {
    articles,
    loadingArticles,
    newArticleCount,
    loadedFeedPages,
    fetchError,
    fetchAndSetArticles,
    mergeArticles,
    removeArticlesByFeed,
    prependArticle,
    dismissNewArticles,
    loadMoreFeedArticles,
    loadMoreAllFeedsArticles,
    skipRemainingPages,
    setFetchError,
    setLoadingArticles,
  };
}
