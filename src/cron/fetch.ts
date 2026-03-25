import type { Feed, Article, PushConfig } from '../types';

import { parseFeed, type ParsedItem } from '../lib/xml-parser';
import { isValidFeedUrl } from '../lib/url';
import { fetchFollowSafeRedirects } from '../lib/fetch';
import { sendPushToAll, type PushPayload } from '../lib/web-push';

type FetchEnv = Pick<CloudflareEnv, 'RSS_DATA' | 'FINDME_RSS'>;
import { r2Get, r2Put } from '../lib/r2';

const MAX_ARTICLES = 500;

/** 429 Too Many Requests を表すカスタムエラー。consecutiveErrors にカウントしない */
export class RateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`Rate limited: retry after ${Math.round(retryAfterMs / 1000)}s`);
    this.name = 'RateLimitError';
  }
}

/** Retry-After ヘッダー値（秒数整数または HTTP-date）をミリ秒に変換する */
const DEFAULT_RATE_LIMIT_MS = 60 * 60 * 1000; // デフォルト 1 時間
const MAX_RATE_LIMIT_MS = 24 * 60 * 60 * 1000; // 最大 24 時間

export function parseRetryAfter(header: string | null): number {
  if (!header) return DEFAULT_RATE_LIMIT_MS;

  // 整数秒（例: "3600"、"0" = 即再試行可）
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RATE_LIMIT_MS);
  }

  // HTTP-date 形式（例: "Wed, 01 Jan 2025 00:00:00 GMT"）
  const date = new Date(header);
  if (!isNaN(date.getTime())) {
    const ms = date.getTime() - Date.now();
    if (ms > 0) return Math.min(ms, MAX_RATE_LIMIT_MS);
  }

  return DEFAULT_RATE_LIMIT_MS;
}

/** クロン実行時のフィード並行取得数上限（メモリ・レート制限対策） */
const FEED_FETCH_CONCURRENCY = 5;
/** クロン実行時のユーザー並行処理数上限 */
const USER_FETCH_CONCURRENCY = 3;

/**
 * 並行実行数を上限で制限しつつ Promise.allSettled 相当の結果を返す。
 * 外部サーバーへの同時接続数を抑えレート制限を回避する。
 */
async function allSettledWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < tasks.length) {
      const i = next++;
      try {
        results[i] = { status: 'fulfilled', value: await tasks[i]() };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/**
 * 連続エラー回数がこの閾値以上のフィードはクロン実行時にスキップする。
 * ただし FEED_ERROR_RETRY_INTERVAL_MS 経過後は再試行を行う。
 * 手動リフレッシュ (forceRetry=true) は常に再試行する。
 */
const CONSECUTIVE_ERROR_SKIP_THRESHOLD = 5;

/**
 * 連続エラーで一時スキップされたフィードを再試行するまでの待機時間（ミリ秒）。
 * 復旧したフィードを自動検出するため、この間隔で 1 回だけ再試行する。
 */
const FEED_ERROR_RETRY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 時間

/** 外部フェッチのタイムアウト（ミリ秒）。ハング防止のため設定する */
const FETCH_TIMEOUT_MS = 15_000;

/**
 * ホスト名 → サービスバインディングキーのマッピング。
 * 同一アカウントの Worker は HTTP を経由しないため Bot 検出を回避できる。
 */
const SERVICE_BINDING_HOSTS: Partial<Record<string, keyof FetchEnv>> = {
  'findme-rss.0g0.xyz': 'FINDME_RSS',
};

/**
 * サービスバインディングまたはグローバル fetch でリクエストを送る。
 * 外部フェッチには FETCH_TIMEOUT_MS のタイムアウトを適用する。
 * サービスバインディング（同一アカウント内 Worker）はタイムアウトを設けない。
 */
function fetchViaBinding(env: FetchEnv, url: string, init?: RequestInit): Promise<Response> {
  const hostname = new URL(url).hostname;
  const bindingKey = SERVICE_BINDING_HOSTS[hostname];
  if (bindingKey) {
    const binding = env[bindingKey] as Fetcher | undefined;
    if (binding) return binding.fetch(url, init);
  }
  return fetchFollowSafeRedirects(url, init ?? {}, FETCH_TIMEOUT_MS);
}

/**
 * フィード ID と GUID を組み合わせた複合キーを生成する。
 * 複数フィードが同じ GUID を持つ場合に記事が上書きされるのを防ぐ。
 */
function articleKey(feedId: string, guid: string): string {
  return `${feedId}|${guid}`;
}

/** パース済みアイテムを Article に変換する */
function buildArticle(item: ParsedItem, feedId: string, existingByKey: Map<string, Article>): Article {
  const existing = existingByKey.get(articleKey(feedId, item.guid));
  return {
    id: existing?.id ?? crypto.randomUUID(),
    feedId,
    guid: item.guid,
    title: item.title,
    link: item.link,
    summary: item.summary,
    // content は articles.json に保存しない（JSON 肥大化を防ぐ）
    // 表示時は /api/content 経由でオンデマンド取得する
    ogImage: item.ogImage || existing?.ogImage,
    author: item.author || existing?.author,
    publishedAt: item.publishedAt,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
}

/** フィード取得成功時のメタデータを更新する */
function applyFeedSuccess(feed: Feed, parsed: ReturnType<typeof parseFeed>): void {
  feed.title = parsed.title || feed.title;
  feed.siteUrl = parsed.siteUrl || feed.siteUrl;
  feed.lastFetchedAt = new Date().toISOString();
  feed.fetchError = null;
  feed.consecutiveErrors = 0;
  feed.lastErrorAt = null;
  feed.rateLimitedUntil = null;
}

/**
 * 429 レートリミット時のメタデータを更新する。
 * consecutiveErrors はカウントしない（一時的な制限のため）。
 */
function applyFeedRateLimit(feed: Feed, error: RateLimitError): void {
  feed.rateLimitedUntil = new Date(Date.now() + error.retryAfterMs).toISOString();
  feed.fetchError = error.message;
  console.warn('Feed rate limited', {
    feedId: feed.id,
    url: feed.url,
    rateLimitedUntil: feed.rateLimitedUntil,
  });
}

/**
 * 304 Not Modified 時のメタデータを更新する。
 * フィードは正常アクセス可能なので consecutiveErrors をリセットし lastFetchedAt を更新する。
 */
function applyFeedNotModified(feed: Feed): void {
  feed.lastFetchedAt = new Date().toISOString();
  feed.fetchError = null;
  feed.consecutiveErrors = 0;
  feed.lastErrorAt = null;
  feed.rateLimitedUntil = null;
}

/** フィード取得失敗時のメタデータを更新する */
function applyFeedError(feed: Feed, error: unknown): void {
  feed.consecutiveErrors = Math.min(
    (feed.consecutiveErrors ?? 0) + 1,
    CONSECUTIVE_ERROR_SKIP_THRESHOLD,
  );
  feed.fetchError = error instanceof Error ? error.message : String(error);
  feed.lastErrorAt = new Date().toISOString();
  console.error('Feed fetch failed', {
    feedId: feed.id,
    url: feed.url,
    consecutiveErrors: feed.consecutiveErrors,
    error,
  });
}

/** publishedAt 降順ソート + 最大件数でスライス。publishedAt が null の場合は createdAt にフォールバック */
function sortAndSlice(articles: Iterable<Article>): Article[] {
  return [...articles]
    .sort((a, b) => {
      const at = new Date(a.publishedAt ?? a.createdAt).getTime();
      const bt = new Date(b.publishedAt ?? b.createdAt).getTime();
      return bt - at;
    })
    .slice(0, MAX_ARTICLES);
}

async function fetchUserArticles(env: FetchEnv, userId: string, forceRetry = false): Promise<void> {
  const feeds = await r2Get<Feed[]>(env.RSS_DATA, `users/${userId}/feeds.json`, []);
  if (feeds.length === 0) return;

  const existing = await r2Get<Article[]>(env.RSS_DATA, `users/${userId}/articles.json`, []);
  // feedId と guid の複合キーで管理し、異なるフィード間での GUID 衝突を防ぐ
  const existingByKey = new Map(existing.map((a) => [articleKey(a.feedId, a.guid), a]));

  const results = await allSettledWithConcurrency(
    feeds.map((feed) => async () => {
      // クロン実行時: レートリミット中のフィードは解除時刻まではスキップ
      if (!forceRetry && feed.rateLimitedUntil) {
        if (new Date(feed.rateLimitedUntil).getTime() > Date.now()) {
          return [];
        }
      }
      // クロン実行時: 連続エラーが閾値以上のフィードは原則スキップ（4xx 等の永続的エラーを無限リトライしない）
      // ただし FEED_ERROR_RETRY_INTERVAL_MS 以上経過している場合は自動回復の可能性があるため再試行する
      if (!forceRetry && (feed.consecutiveErrors ?? 0) >= CONSECUTIVE_ERROR_SKIP_THRESHOLD) {
        const lastErrorMs = feed.lastErrorAt ? new Date(feed.lastErrorAt).getTime() : 0;
        if (Date.now() - lastErrorMs < FEED_ERROR_RETRY_INTERVAL_MS) {
          return [];
        }
      }
      if (!isValidFeedUrl(feed.url)) throw new Error(`Invalid feed URL: ${feed.url}`); // SSRF 対策
      const reqHeaders: Record<string, string> = { 'User-Agent': 'rss-reader/1.0' };
      // クロン実行時のみ条件付きリクエストを送信（手動リフレッシュは常に最新データを取得）
      if (!forceRetry) {
        if (feed.etag) reqHeaders['If-None-Match'] = feed.etag;
        if (feed.lastModified) reqHeaders['If-Modified-Since'] = feed.lastModified;
      }
      const res = await fetchViaBinding(env, feed.url, { headers: reqHeaders });
      if (res.status === 429) throw new RateLimitError(parseRetryAfter(res.headers.get('Retry-After')));
      // 304 Not Modified: フィードは変更なし — エラー状態をリセットして空配列を返す
      if (res.status === 304) {
        applyFeedNotModified(feed);
        return [];
      }
      if (!res.ok) throw new Error(`${res.status} ${feed.url}`);
      const xml = await res.text();
      const parsed = parseFeed(xml);

      applyFeedSuccess(feed, parsed);
      // 次回の条件付きリクエスト用にキャッシュバリデータを保存
      const lastModified = res.headers.get('Last-Modified');
      const etag = res.headers.get('ETag');
      if (lastModified) feed.lastModified = lastModified;
      if (etag) feed.etag = etag;
      return parsed.items.map((item) => buildArticle(item, feed.id, existingByKey));
    }),
    FEED_FETCH_CONCURRENCY,
  );

  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      if (result.reason instanceof RateLimitError) {
        applyFeedRateLimit(feeds[i], result.reason);
      } else {
        applyFeedError(feeds[i], result.reason);
      }
    }
  });

  await r2Put(env.RSS_DATA, `users/${userId}/feeds.json`, feeds);

  const fresh: Article[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') fresh.push(...r.value);
    else void 0; // already logged above
  }

  // 全フィードがスキップ・失敗・空だった場合は articles.json の更新をスキップ
  // merged の内容が existingByKey と同一になるため、不要な R2 書き込みを避ける
  if (fresh.length === 0) return;

  // 新着記事（既存 Map に存在しなかったもの）を検出
  const newArticles = fresh.filter((a) => !existingByKey.has(articleKey(a.feedId, a.guid)));

  const merged = new Map<string, Article>(existingByKey);
  for (const a of fresh) merged.set(articleKey(a.feedId, a.guid), a);

  await r2Put(env.RSS_DATA, `users/${userId}/articles.json`, sortAndSlice(merged.values()));

  // 新着記事がある場合は Push 通知を送信
  if (newArticles.length > 0) {
    await sendPushNotificationsForUser(env, userId, newArticles, feeds);
  }
}

/**
 * ユーザーの Push サブスクリプションに新着記事の通知を送る。
 * 失効したサブスクリプション (404/410) は自動的に削除する。
 */
async function sendPushNotificationsForUser(
  env: FetchEnv,
  userId: string,
  newArticles: Article[],
  feeds: Feed[],
): Promise<void> {
  const pushKey = `users/${userId}/push.json`;
  const config = await r2Get<PushConfig>(env.RSS_DATA, pushKey, { subscriptions: [] });
  if (config.subscriptions.length === 0) return;

  const payload = buildPushPayload(newArticles, feeds);
  const remaining = await sendPushToAll(config.subscriptions, payload);

  // 失効したサブスクリプションを除去して書き戻す
  if (remaining.length !== config.subscriptions.length) {
    config.subscriptions = remaining;
    await r2Put(env.RSS_DATA, pushKey, config);
  }
}

/** 新着記事リストから通知ペイロードを生成する */
function buildPushPayload(newArticles: Article[], feeds: Feed[]): PushPayload {
  const count = newArticles.length;

  if (count === 1) {
    const article = newArticles[0];
    const feed = feeds.find((f) => f.id === article.feedId);
    const feedName = feed?.title ?? 'RSS';
    return {
      title: feedName,
      body: article.title || '新着記事',
      url: '/',
    };
  }

  // 全記事が同一フィードの場合
  const feedIds = [...new Set(newArticles.map((a) => a.feedId))];
  if (feedIds.length === 1) {
    const feed = feeds.find((f) => f.id === feedIds[0]);
    const feedName = feed?.title ?? 'RSS';
    return {
      title: feedName,
      body: `${count} 件の新着記事`,
      url: '/',
    };
  }

  return {
    title: 'RSS Reader',
    body: `${count} 件の新着記事`,
    url: '/',
  };
}

// フィード追加・手動リフレッシュ時の即時フェッチ（エラー状態に関わらず強制再試行）
export async function fetchArticles(env: FetchEnv, userId: string): Promise<void> {
  await fetchUserArticles(env, userId, true);
}

/**
 * 単一フィードを強制再取得してアーティクルをマージする。
 * エラー状態（consecutiveErrors / fetchError）もリセットを試みる。
 * フィードが見つからない場合は null を返す。
 */
export async function fetchSingleFeed(env: FetchEnv, userId: string, feedId: string): Promise<Feed | null> {
  const feeds = await r2Get<Feed[]>(env.RSS_DATA, `users/${userId}/feeds.json`, []);
  const feedIndex = feeds.findIndex((f) => f.id === feedId);
  if (feedIndex < 0) return null;
  const feed = feeds[feedIndex];

  if (!isValidFeedUrl(feed.url)) throw new Error(`Invalid feed URL: ${feed.url}`);

  const existing = await r2Get<Article[]>(env.RSS_DATA, `users/${userId}/articles.json`, []);
  // feedId と guid の複合キーで管理し、異なるフィード間での GUID 衝突を防ぐ
  const existingByKey = new Map(existing.map((a) => [articleKey(a.feedId, a.guid), a]));

  try {
    const res = await fetchViaBinding(env, feed.url, { headers: { 'User-Agent': 'rss-reader/1.0' } });
    if (res.status === 429) throw new RateLimitError(parseRetryAfter(res.headers.get('Retry-After')));
    if (!res.ok) throw new Error(`${res.status} ${feed.url}`);
    const xml = await res.text();
    const parsed = parseFeed(xml);

    applyFeedSuccess(feed, parsed);
    // 次回の条件付きリクエスト用にキャッシュバリデータを保存
    const lastModified = res.headers.get('Last-Modified');
    const etag = res.headers.get('ETag');
    if (lastModified) feed.lastModified = lastModified;
    if (etag) feed.etag = etag;
    for (const item of parsed.items) {
      const article = buildArticle(item, feed.id, existingByKey);
      existingByKey.set(articleKey(article.feedId, article.guid), article);
    }
  } catch (e) {
    if (e instanceof RateLimitError) {
      applyFeedRateLimit(feed, e);
    } else {
      applyFeedError(feed, e);
    }
  }

  await r2Put(env.RSS_DATA, `users/${userId}/feeds.json`, feeds);
  await r2Put(env.RSS_DATA, `users/${userId}/articles.json`, sortAndSlice(existingByKey.values()));

  return feed;
}

// Cron: 全ユーザーをフェッチ
export async function fetchAllUsers(env: FetchEnv): Promise<void> {
  const userIds: string[] = [];
  let cursor: string | undefined;
  do {
    const listed = await env.RSS_DATA.list({ prefix: 'users/', delimiter: '/', cursor });
    userIds.push(...listed.delimitedPrefixes.map((p: string) => p.slice('users/'.length, -1)));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  await allSettledWithConcurrency(
    userIds.map((id: string) => () => fetchUserArticles(env, id)),
    USER_FETCH_CONCURRENCY,
  );
}
