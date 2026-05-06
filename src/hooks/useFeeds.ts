"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Feed, Article, UserProfile } from "../types";
import { useOnlineStatus } from "./useOnlineStatus";
import { apiFetch, apiFetchJson } from "../lib/api-fetch";
import { compareByDateDesc } from "../lib/article-utils";
import { useSyncedRef } from "./useSyncedRef";

/** 記事新着確認のポーリング間隔（アクティブ時: 5分 / 非アクティブ時: 15分） */
const POLL_INTERVAL_MS = 5 * 60 * 1000; // アクティブ時: 5分
const HIDDEN_POLL_INTERVAL_MS = 15 * 60 * 1000; // タブ非表示時: 15分

/** `loadMoreAllFeedsArticles` での 1 フィード分の取得結果 */
type FeedPageResult = { feedId: string; nextPage: number; data: Article[] };

/** incoming の新規記事を existing にマージして日付降順でソートして返す */
function mergeUniqueArticles(existing: Article[], incoming: Article[]): Article[] {
  if (incoming.length === 0) return existing;

  // id + link キーを1パスで構築（中間配列・第2パスフィルタを排除）
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

/**
 * `useFeeds` フックの戻り値型。
 * フィード・記事データおよびCRUD操作・ページネーション関連の関数を保持する。
 */
interface FeedsState {
  feeds: Feed[];
  articles: Article[];
  loadingFeeds: boolean;
  loadingArticles: boolean;
  refreshing: boolean;
  newArticleCount: number;
  loadedFeedPages: Map<string, number>;
  fetchError: boolean;
  retryInitialLoad: () => void;
  onFeedAdded: (feed: Feed) => void;
  prependArticle: (article: Article) => void;
  removeFeed: (id: string) => void;
  updateFeed: (feed: Feed) => void;
  appendFeeds: (feeds: Feed[]) => Promise<void>;
  refreshFeeds: () => Promise<void>;
  retryFeed: (feedId: string) => Promise<void>;
  reinferFeed: (feedId: string) => Promise<void>;
  dismissNewArticles: () => void;
  loadMoreFeedArticles: (feedId: string) => Promise<void>;
  loadMoreAllFeedsArticles: (feeds: Feed[]) => Promise<void>;
  skipRemainingPages: (feedId: string | null) => void;
}

/**
 * フィードと記事の取得・管理を行うフック。
 * ログイン後に /api/feeds と /api/articles を取得し、5分ごとの新着ポーリング、
 * オンライン復帰時の即時同期、フィードの追加・削除・更新・過去ページの追加読み込みを提供する。
 *
 * @param user - ログイン中のユーザー情報（`null`/`undefined` のときはデータ取得を行わない）
 * @param onError - エラー発生時に呼び出すコールバック（ユーザー向けメッセージを渡す）
 * @returns フィード・記事データと各種操作関数
 */
export function useFeeds(
  user: UserProfile | null | undefined,
  onError?: (msg: string) => void,
): FeedsState {
  const isOnline = useOnlineStatus();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loadingFeeds, setLoadingFeeds] = useState(false);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [newArticleCount, setNewArticleCount] = useState(0);
  const [fetchError, setFetchError] = useState(false);
  const [loadedFeedPages, setLoadedFeedPages] = useState<Map<string, number>>(() => new Map());
  const loadedFeedPagesRef = useSyncedRef(loadedFeedPages);
  // 現在フェッチ中のフィード ID を追跡（二重フェッチ防止）
  const loadingFeedIdsRef = useRef(new Set<string>());
  // コールバックを ref 化して useCallback/useEffect の依存配列から除外する
  const onErrorRef = useSyncedRef(onError);
  // isOnline を ref 化してポーリング effect の deps から除外し、タイマー再生成を防ぐ
  const isOnlineRef = useSyncedRef(isOnline);
  // useRef で安定化して deps から除外する（onErrorRef 経由で最新コールバックを参照するため再生成不要）
  const onErrRef = useRef((err: unknown, msg: string) => {
    if (process.env.NODE_ENV !== "production") console.error(err);
    onErrorRef.current?.(msg);
  });
  const latestArticleIdRef = useRef<string | null>(null);
  const isPollingRef = useRef(false);
  const prevIsOnlineRef = useRef(isOnline);
  // 最後にポーリングを完了した時刻（ミリ秒）。since パラメータとして使用する
  const lastPollTimeRef = useRef<number | null>(null);

  const fetchAndSetArticles = useCallback(async () => {
    const fetchedAt = Date.now();
    const data = await apiFetchJson<Article[]>("/api/articles");
    setArticles(data);
    // 記事を全件置き換えるためページ読み込み状態もリセットする。
    // リセットしないと古い loadedPage が残り、次回「過去記事を読み込み」で
    // 誤ったページ番号（ページ飛ばし）が発生する。
    setLoadedFeedPages(new Map());
    latestArticleIdRef.current = data[0]?.id ?? null;
    // 初回フェッチ完了時刻を記録して、次回ポーリングの since 基準時刻にする
    lastPollTimeRef.current = fetchedAt;
    return data;
  }, []);

  const mergeArticles = useCallback((fresh: Article[]) => {
    if (fresh.length > 0) latestArticleIdRef.current = fresh[0].id;
    setArticles((prev) => mergeUniqueArticles(prev, fresh));
  }, []);

  // user オブジェクト参照ではなく userId (string | null) を依存値にする。
  // useAuth の checkAuth() はトークンリフレッシュのたびに setUser(新オブジェクト) を呼ぶため、
  // user を依存配列に含めると fetchAndSetArticles が再実行されて過去記事が上書きされてしまう。
  const userId = user?.id ?? null;
  const doInitialLoad = useCallback(() => {
    setFetchError(false);
    setLoadingFeeds(true);
    setLoadingArticles(true);
    let feedsFailed = false;
    let articlesFailed = false;
    apiFetchJson<Feed[]>("/api/feeds")
      .then(setFeeds)
      .catch((err) => {
        feedsFailed = true;
        onErrRef.current(err, "フィードの読み込みに失敗しました");
      })
      .finally(() => {
        setLoadingFeeds(false);
        if (feedsFailed) setFetchError(true);
      });
    fetchAndSetArticles()
      .catch((err) => {
        articlesFailed = true;
        onErrRef.current(err, "記事の読み込みに失敗しました");
      })
      .finally(() => {
        setLoadingArticles(false);
        if (articlesFailed) setFetchError(true);
      });
  }, [fetchAndSetArticles]);

  useEffect(() => {
    if (!userId) return;
    doInitialLoad();
  }, [userId, doInitialLoad]);

  const retryInitialLoad = useCallback(() => {
    doInitialLoad();
  }, [doInitialLoad]);

  // 新着確認フェッチ: 既存記事は消さずに新着のみ追加する（閲覧中の記事を守る）
  // since パラメータを付与して差分のみ取得し、ネットワーク帯域とパースコストを削減する
  const pollNow = useCallback(async () => {
    const prevTopId = latestArticleIdRef.current;
    if (prevTopId === null) return; // 初回ロード前はスキップ
    if (isPollingRef.current) return; // 前回のフェッチが完了していない場合はスキップ
    isPollingRef.current = true;
    const pollStartTime = Date.now();
    try {
      // since が確定している場合は差分取得、未確定なら全件取得
      const since = lastPollTimeRef.current;
      const url = since !== null ? `/api/articles?since=${since}` : "/api/articles";
      const fresh = await apiFetchJson<Article[]>(url);
      mergeArticles(fresh);
      // since 付き差分取得の場合、返却される記事はすべて新着なので length で判断
      // since なし（フォールバック）の場合は従来の prevTopId で判断
      if (since !== null) {
        if (fresh.length > 0) setNewArticleCount((prev) => prev + fresh.length);
      } else {
        const newIdx = fresh.findIndex((a) => a.id === prevTopId);
        if (newIdx > 0) setNewArticleCount((prev) => prev + newIdx);
      }
      // ポーリング成功時に次回の since 基準を更新する
      lastPollTimeRef.current = pollStartTime;
    } catch (err) {
      if (process.env.NODE_ENV !== "production")
        console.error("[polling] 新着記事の取得に失敗:", err);
      onErrorRef.current?.("新着記事の取得に失敗しました");
    } finally {
      isPollingRef.current = false;
    }
  }, [mergeArticles, onErrorRef]);

  // pollNow は ref 経由で参照し、ポーリング effect の deps から除外してタイマー再生成を防ぐ
  const pollNowRef = useSyncedRef(pollNow);

  // タブがアクティブな間は5分、非アクティブ時は15分ごとに記事を再取得して新着件数を通知する
  // visibilitychange のたびにタイマーを再生成して適切な間隔を適用する
  // isOnline / pollNow は ref 経由で参照するため deps から除外し、タイマー再生成を防ぐ
  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setInterval>;
    const startTimer = () => {
      clearInterval(timer);
      const interval = document.hidden ? HIDDEN_POLL_INTERVAL_MS : POLL_INTERVAL_MS;
      timer = setInterval(() => {
        if (!isOnlineRef.current) return; // オフライン時はスキップ
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

  // オンライン復帰時に即座にポーリングを実行する
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

  const onFeedAdded = useCallback((feed: Feed) => {
    setFeeds((prev) => [...prev, feed]);
  }, []);

  /** 単一記事をリスト先頭に追加する（URL 保存機能で使用） */
  const prependArticle = useCallback((article: Article) => {
    setArticles((prev) => {
      if (prev.some((a) => a.id === article.id)) return prev;
      return [article, ...prev];
    });
  }, []);

  // フィード削除: feeds と articles からエントリを除去する。
  // 選択状態のクリアは呼び出し元 (App) が担当する。
  const removeFeed = useCallback((id: string) => {
    setFeeds((prev) => prev.filter((f) => f.id !== id));
    setArticles((prev) => prev.filter((a) => a.feedHash !== id));
  }, []);

  const updateFeed = useCallback((feed: Feed) => {
    setFeeds((prev) => prev.map((f) => (f.id === feed.id ? feed : f)));
  }, []);

  const appendFeeds = useCallback(
    async (newFeeds: Feed[]) => {
      setFeeds((prev) => [...prev, ...newFeeds]);
      // インポート後に記事を再取得する
      setLoadingArticles(true);
      try {
        await fetchAndSetArticles();
      } catch (err) {
        onErrRef.current(err, "記事の読み込みに失敗しました");
      } finally {
        setLoadingArticles(false);
      }
    },
    [fetchAndSetArticles],
  );

  const refreshFeeds = useCallback(async () => {
    setRefreshing(true);
    try {
      await apiFetch("/api/feeds/refresh", { method: "POST" });
      const [fresh, feedsData] = await Promise.all([
        apiFetchJson<Article[]>("/api/articles"),
        apiFetchJson<Feed[]>("/api/feeds"),
      ]);
      setFeeds(feedsData);
      mergeArticles(fresh);
    } catch (err) {
      onErrRef.current(err, "更新に失敗しました");
    } finally {
      setRefreshing(false);
    }
  }, [mergeArticles]);

  /** フィードエンドポイントに POST し、フィードと記事を更新する共通実装 */
  const feedActionWithRefresh = useCallback(
    async (feedId: string, endpoint: string, errorMessage: string): Promise<void> => {
      try {
        const feed = await apiFetchJson<Feed>(`/api/feeds/${feedId}/${endpoint}`, {
          method: "POST",
        });
        setFeeds((prev) => prev.map((f) => (f.id === feed.id ? feed : f)));
        mergeArticles(await apiFetchJson<Article[]>("/api/articles"));
      } catch (err) {
        if (process.env.NODE_ENV !== "production")
          console.error(`[${endpoint}] feed action failed:`, err);
        onErrorRef.current?.(errorMessage);
      }
    },
    [mergeArticles, onErrorRef],
  );

  const retryFeed = useCallback(
    (feedId: string) => feedActionWithRefresh(feedId, "refresh", "フィードの再取得に失敗しました"),
    [feedActionWithRefresh],
  );

  const reinferFeed = useCallback(
    (feedId: string) => feedActionWithRefresh(feedId, "reinfer", "セレクタの再推論に失敗しました"),
    [feedActionWithRefresh],
  );

  const dismissNewArticles = useCallback(() => {
    setNewArticleCount(0);
  }, []);

  // フィードの過去ページを追加読み込みする
  const loadMoreFeedArticles = useCallback(async (feedId: string): Promise<void> => {
    if (loadingFeedIdsRef.current.has(feedId)) return;
    const nextPage = (loadedFeedPagesRef.current.get(feedId) ?? 1) + 1;
    loadingFeedIdsRef.current.add(feedId);
    try {
      const data = await apiFetchJson<Article[]>(`/api/articles?feed=${feedId}&page=${nextPage}`);
      // 空ページでもページ番号を更新して「もっと読む」ボタンが消えるようにする
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

  // 全フィード表示時: 未読み込みページが残っている全フィードの次ページを一括取得する
  const loadMoreAllFeedsArticles = useCallback(async (feeds: Feed[]): Promise<void> => {
    const targets = feeds.filter((f) => {
      if (!f.pageCount) return false;
      if (loadingFeedIdsRef.current.has(f.id)) return false;
      const loaded = loadedFeedPagesRef.current.get(f.id) ?? 1;
      return loaded <= f.pageCount;
    });
    if (targets.length === 0) return;
    // nextPage を同期的に確定する。非同期処理中に ref が変わっても正しいページを取得できる。
    // また、個別の finally でロック解放すると setLoadedFeedPages より先に解放されてしまい、
    // 同ページが二重フェッチされる race condition が発生するため、ロック解放は一括で行う。
    const nextPages = new Map(
      targets.map((f) => [f.id, (loadedFeedPagesRef.current.get(f.id) ?? 1) + 1]),
    );
    for (const f of targets) loadingFeedIdsRef.current.add(f.id);
    // Promise.allSettled は reject しないため try/catch 不要
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
    // 空ページでもページ番号を更新して繰り返しリクエストを防ぐ（1回の setState に集約）
    if (succeeded.length > 0) {
      setLoadedFeedPages((prev) => {
        const next = new Map(prev);
        for (const { value } of succeeded) next.set(value.feedId, value.nextPage);
        return next;
      });
    }
    // setLoadedFeedPages の後にロックを解放することで、ref 更新前に別のロードが
    // 開始されて同ページを二重フェッチするのを防ぐ
    for (const f of targets) loadingFeedIdsRef.current.delete(f.id);
    if (succeeded.length === 0) return;
    const newArticles = succeeded.flatMap(({ value }) => value.data);
    if (newArticles.length > 0) setArticles((prev) => mergeUniqueArticles(prev, newArticles));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadedFeedPagesRef・loadingFeedIdsRef・onErrRef は ref 経由で最新値を参照するため deps 不要
  }, []);

  // markAllRead 実行後に呼び出し、残りのサーバーページをスキップして
  // LoadMoreButton が表示されないようにする（古い未読記事が再出現するのを防ぐ）
  const skipRemainingPages = useCallback(
    (feedId: string | null) => {
      const targets = feedId ? feeds.filter((f) => f.id === feedId) : feeds;
      setLoadedFeedPages((prev) => {
        const next = new Map(prev);
        for (const f of targets) {
          if (f.pageCount) next.set(f.id, f.pageCount + 1);
        }
        return next;
      });
    },
    [feeds],
  );

  return {
    feeds,
    articles,
    loadingFeeds,
    loadingArticles,
    refreshing,
    newArticleCount,
    loadedFeedPages,
    fetchError,
    retryInitialLoad,
    onFeedAdded,
    prependArticle,
    removeFeed,
    updateFeed,
    appendFeeds,
    refreshFeeds,
    retryFeed,
    reinferFeed,
    dismissNewArticles,
    loadMoreFeedArticles,
    loadMoreAllFeedsArticles,
    skipRemainingPages,
  };
}
