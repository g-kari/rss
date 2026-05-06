"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Article, Feed, UserProfile } from "../types";
import { useOnlineStatus } from "./useOnlineStatus";
import { apiFetchJson } from "../lib/api-fetch";
import { compareByDateDesc } from "../lib/article-utils";
import { useSyncedRef } from "./useSyncedRef";

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const HIDDEN_POLL_INTERVAL_MS = 15 * 60 * 1000;

type FeedPageResult = { feedId: string; nextPage: number; data: Article[] };

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
  setFetchError: React.Dispatch<React.SetStateAction<boolean>>;
  setLoadingArticles: React.Dispatch<React.SetStateAction<boolean>>;
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
  const onErrorRef = useSyncedRef(onError);
  const isOnlineRef = useSyncedRef(isOnline);
  const onErrRef = useRef((err: unknown, msg: string) => {
    if (process.env.NODE_ENV !== "production") console.error(err);
    onErrorRef.current?.(msg);
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
        onErrRef.current(err, "記事の読み込みに失敗しました");
        setFetchError(true);
      })
      .finally(() => {
        setLoadingArticles(false);
      });
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
      if (process.env.NODE_ENV !== "production")
        console.error("[polling] 新着記事の取得に失敗:", err);
      onErrorRef.current?.("新着記事の取得に失敗しました");
    } finally {
      isPollingRef.current = false;
    }
  }, [mergeArticles, onErrorRef]);

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
      onErrRef.current(err, "過去の記事の読み込みに失敗しました");
    } finally {
      loadingFeedIdsRef.current.delete(feedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadedFeedPagesRef・loadingFeedIdsRef・onErrRef は ref 経由で最新値を参照するため deps 不要
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
    const results = await Promise.allSettled(
      targets.map(async (f) => {
        const nextPage = nextPages.get(f.id) ?? 2;
        const data = await apiFetchJson<Article[]>(`/api/articles?feed=${f.id}&page=${nextPage}`);
        return { feedId: f.id, nextPage, data };
      }),
    );
    const succeeded = results.filter(
      (r): r is PromiseFulfilledResult<FeedPageResult> => r.status === "fulfilled",
    );
    if (succeeded.length < results.length) {
      onErrRef.current(
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadedFeedPagesRef・loadingFeedIdsRef・onErrRef は ref 経由で最新値を参照するため deps 不要
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
