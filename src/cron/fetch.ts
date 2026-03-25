import type { Article, SharedFeedMeta, PushConfig, UserSubscription } from '../types';

import { parseFeed, type ParsedItem } from '../lib/xml-parser';
import { isValidFeedUrl } from '../lib/url';
import { fetchFollowSafeRedirects } from '../lib/fetch';
import { sendPushToAll, type PushPayload } from '../lib/web-push';
import { r2Get, r2Put, sha256Hex } from '../lib/r2';
import {
  computeFeedHash,
  computeArticleId,
  readFeedMeta,
  writeFeedMeta,
  createFeedMeta,
  mergeNewArticles,
  readUserSubscriptions,
  writeUserSubscriptions,
  listAllFeedHashes,
  buildFeedUserMap,
  readLatestArticles,
  assembleClientFeed,
} from '../lib/shared-feed';

type FetchEnv = Pick<CloudflareEnv, 'RSS_DATA' | 'FINDME_RSS'>;

const CONSECUTIVE_ERROR_SKIP_THRESHOLD = 5;
const FEED_ERROR_RETRY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 時間
const FETCH_TIMEOUT_MS = 15_000;

/** cron 実行時のフィード並行取得数上限 */
const FEED_FETCH_CONCURRENCY = 5;
/** cron 実行時のユーザー並行処理数上限（Push 通知用） */
const USER_FETCH_CONCURRENCY = 3;

// ── エラー型 ──────────────────────────────────────────────────────

/** 429 Too Many Requests を表すカスタムエラー */
export class RateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`Rate limited: retry after ${Math.round(retryAfterMs / 1000)}s`);
    this.name = 'RateLimitError';
  }
}

const DEFAULT_RATE_LIMIT_MS = 60 * 60 * 1000;
const MAX_RATE_LIMIT_MS = 24 * 60 * 60 * 1000;

export function parseRetryAfter(header: string | null): number {
  if (!header) return DEFAULT_RATE_LIMIT_MS;
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RATE_LIMIT_MS);
  }
  const date = new Date(header);
  if (!isNaN(date.getTime())) {
    const ms = date.getTime() - Date.now();
    if (ms > 0) return Math.min(ms, MAX_RATE_LIMIT_MS);
  }
  return DEFAULT_RATE_LIMIT_MS;
}

// ── 並行制限 ─────────────────────────────────────────────────────

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

// ── サービスバインディング ────────────────────────────────────────

const SERVICE_BINDING_HOSTS: Partial<Record<string, keyof FetchEnv>> = {
  'findme-rss.0g0.xyz': 'FINDME_RSS',
};

function fetchViaBinding(env: FetchEnv, url: string, init?: RequestInit): Promise<Response> {
  const hostname = new URL(url).hostname;
  const bindingKey = SERVICE_BINDING_HOSTS[hostname];
  if (bindingKey) {
    const binding = env[bindingKey] as Fetcher | undefined;
    if (binding) return binding.fetch(url, init);
  }
  return fetchFollowSafeRedirects(url, init ?? {}, FETCH_TIMEOUT_MS);
}

// ── 記事ビルド ────────────────────────────────────────────────────

/** RSS アイテムを Article に変換する（決定論的 ID を使用） */
async function buildArticle(
  item: ParsedItem,
  feedHash: string,
  feedUrl: string,
  existingById: Map<string, Article>,
): Promise<Article> {
  const id = await computeArticleId(feedUrl, item.guid);
  const existing = existingById.get(id);
  return {
    id,
    feedHash,
    guid: item.guid,
    title: item.title,
    link: item.link,
    summary: item.summary,
    ogImage: item.ogImage || existing?.ogImage,
    author: item.author || existing?.author,
    publishedAt: item.publishedAt,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
}

// ── フィードメタ更新ヘルパー ──────────────────────────────────────

function resetFeedSuccessState(meta: SharedFeedMeta): void {
  meta.lastFetchedAt = new Date().toISOString();
  meta.fetchError = null;
  meta.consecutiveErrors = 0;
  meta.lastErrorAt = null;
  meta.rateLimitedUntil = null;
}

function applyFeedSuccess(meta: SharedFeedMeta, parsed: ReturnType<typeof parseFeed>): void {
  meta.title = parsed.title || meta.title;
  meta.siteUrl = parsed.siteUrl || meta.siteUrl;
  resetFeedSuccessState(meta);
}

function applyFeedRateLimit(meta: SharedFeedMeta, error: RateLimitError): void {
  meta.rateLimitedUntil = new Date(Date.now() + error.retryAfterMs).toISOString();
  meta.fetchError = error.message;
  console.warn('Feed rate limited', { feedHash: meta.feedHash, url: meta.url, rateLimitedUntil: meta.rateLimitedUntil });
}

function applyFeedError(meta: SharedFeedMeta, error: unknown): void {
  meta.consecutiveErrors = Math.min(
    (meta.consecutiveErrors ?? 0) + 1,
    CONSECUTIVE_ERROR_SKIP_THRESHOLD,
  );
  meta.fetchError = error instanceof Error ? error.message : String(error);
  meta.lastErrorAt = new Date().toISOString();
  console.error('Feed fetch failed', { feedHash: meta.feedHash, url: meta.url, consecutiveErrors: meta.consecutiveErrors, error });
}

// ── フィード取得（共有ストレージ向け）────────────────────────────

/**
 * 単一フィードをフェッチしてパースし、新着 Article を共有ストレージに書き込む。
 * meta を副作用で更新し（呼び出し元が writeFeedMeta する）、新着記事を返す。
 * 304 Not Modified の場合は空配列を返す。
 * エラー時は RateLimitError またはその他 Error をスローする。
 */
async function fetchAndParseFeed(
  env: FetchEnv,
  meta: SharedFeedMeta,
  options: { conditional?: boolean } = {},
): Promise<{ articles: Article[]; existingLatest: Article[] }> {
  const reqHeaders: Record<string, string> = { 'User-Agent': 'rss-reader/1.0' };
  if (options.conditional) {
    if (meta.etag) reqHeaders['If-None-Match'] = meta.etag;
    if (meta.lastModified) reqHeaders['If-Modified-Since'] = meta.lastModified;
  }
  const res = await fetchViaBinding(env, meta.url, { headers: reqHeaders });
  if (res.status === 429) throw new RateLimitError(parseRetryAfter(res.headers.get('Retry-After')));
  if (res.status === 304) {
    resetFeedSuccessState(meta);
    return { articles: [], existingLatest: [] };
  }
  if (!res.ok) throw new Error(`${res.status} ${meta.url}`);

  const xml = await res.text();
  const parsed = parseFeed(xml);

  applyFeedSuccess(meta, parsed);
  const lastModified = res.headers.get('Last-Modified');
  const etag = res.headers.get('ETag');
  if (lastModified) meta.lastModified = lastModified;
  if (etag) meta.etag = etag;

  // 現在の latest.json から既存記事マップを構築（createdAt 保持用）
  // mergeNewArticles に渡して二重 R2 GET を避ける
  const existingLatest = await readLatestArticles(env.RSS_DATA, meta.feedHash);
  const existingById = new Map(existingLatest.map((a) => [a.id, a]));

  const articles = await Promise.all(
    parsed.items.map((item) => buildArticle(item, meta.feedHash, meta.url, existingById)),
  );
  return { articles, existingLatest };
}

// ── 共有フィード更新（cron / refresh 共用）────────────────────────

/**
 * 1 つの共有フィードを取得してストレージを更新する。
 * 新着記事を返す（Push 通知判定に使用）。
 * forceRetry=true の場合はエラー・レートリミット状態を無視して再試行する。
 */
export async function fetchAndUpdateSharedFeed(
  env: FetchEnv,
  feedHash: string,
  forceRetry = false,
): Promise<{ newArticles: Article[]; meta: SharedFeedMeta | null }> {
  const meta = await readFeedMeta(env.RSS_DATA, feedHash);
  if (!meta) {
    console.warn('fetchAndUpdateSharedFeed: meta not found', { feedHash });
    return { newArticles: [], meta: null };
  }

  if (!forceRetry) {
    if (meta.rateLimitedUntil && new Date(meta.rateLimitedUntil).getTime() > Date.now()) {
      return { newArticles: [], meta };
    }
    if ((meta.consecutiveErrors ?? 0) >= CONSECUTIVE_ERROR_SKIP_THRESHOLD) {
      const lastErrorMs = meta.lastErrorAt ? new Date(meta.lastErrorAt).getTime() : 0;
      if (Date.now() - lastErrorMs < FEED_ERROR_RETRY_INTERVAL_MS) {
        return { newArticles: [], meta };
      }
    }
  }

  if (!isValidFeedUrl(meta.url)) throw new Error(`Invalid feed URL: ${meta.url}`);

  let newArticles: Article[] = [];
  try {
    const { articles: fetched, existingLatest } = await fetchAndParseFeed(env, meta, { conditional: !forceRetry });
    newArticles = await mergeNewArticles(env.RSS_DATA, meta, fetched, existingLatest);
  } catch (e) {
    if (e instanceof RateLimitError) {
      applyFeedRateLimit(meta, e);
    } else {
      applyFeedError(meta, e);
    }
  }

  await writeFeedMeta(env.RSS_DATA, meta);
  return { newArticles, meta };
}

// ── Push 通知 ─────────────────────────────────────────────────────

function buildPushPayload(newArticles: Article[], feedTitle: string): PushPayload {
  const count = newArticles.length;
  if (count === 1) {
    return { title: feedTitle, body: newArticles[0].title || '新着記事', url: '/' };
  }
  const feedHashes = [...new Set(newArticles.map((a) => a.feedHash))];
  if (feedHashes.length === 1) {
    return { title: feedTitle, body: `${count} 件の新着記事`, url: '/' };
  }
  return { title: 'RSS Reader', body: `${count} 件の新着記事`, url: '/' };
}

async function sendPushForUsers(
  env: FetchEnv,
  userIds: string[],
  newArticles: Article[],
  feedTitle: string,
): Promise<void> {
  const payload = buildPushPayload(newArticles, feedTitle);
  await allSettledWithConcurrency(
    userIds.map((userId) => async () => {
      const pushKey = `users/${userId}/push.json`;
      const config = await r2Get<PushConfig>(env.RSS_DATA, pushKey, { subscriptions: [] });
      if (config.subscriptions.length === 0) return;
      const remaining = await sendPushToAll(config.subscriptions, payload);
      if (remaining.length !== config.subscriptions.length) {
        config.subscriptions = remaining;
        await r2Put(env.RSS_DATA, pushKey, config);
      }
    }),
    USER_FETCH_CONCURRENCY,
  );
}

// ── エントリポイント（cron / API ルートから呼ばれる）──────────────

/**
 * 全共有フィードを取得する（cron 用）。
 * 1. feedHash → userId[] の逆引きマップを構築
 * 2. 各フィードを並行取得
 * 3. 新着記事があったフィードの購読ユーザーに Push 通知を送る
 */
export async function fetchAllFeeds(env: FetchEnv): Promise<void> {
  // Push 通知用の逆引きマップを事前に構築
  const feedUserMap = await buildFeedUserMap(env.RSS_DATA);

  const feedHashes = await listAllFeedHashes(env.RSS_DATA);
  if (feedHashes.length === 0) return;

  const results = await allSettledWithConcurrency(
    feedHashes.map((feedHash) => () => fetchAndUpdateSharedFeed(env, feedHash)),
    FEED_FETCH_CONCURRENCY,
  );

  // Push 通知
  for (let i = 0; i < feedHashes.length; i++) {
    const result = results[i];
    if (result.status !== 'fulfilled' || result.value.newArticles.length === 0) continue;
    const { newArticles, meta } = result.value;
    const feedHash = feedHashes[i];
    const userIds = feedUserMap.get(feedHash) ?? [];
    if (userIds.length === 0) continue;
    await sendPushForUsers(env, userIds, newArticles, meta?.title ?? 'RSS');
  }
}

/**
 * 特定ユーザーが購読する全フィードを強制再取得する（手動リフレッシュ用）。
 * エラー・レートリミット状態に関わらず再試行する。
 */
export async function fetchArticles(env: FetchEnv, userId: string): Promise<void> {
  const subs = await readUserSubscriptions(env.RSS_DATA, userId);
  if (subs.length === 0) return;
  await allSettledWithConcurrency(
    subs.map((s) => () => fetchAndUpdateSharedFeed(env, s.feedHash, true)),
    FEED_FETCH_CONCURRENCY,
  );
}

/**
 * 単一フィードを強制再取得する（単体リフレッシュ用）。
 * feedHash が購読に存在すれば更新後の SharedFeedMeta をクライアント向け Feed 形式で返す。
 * 存在しなければ null を返す。
 */
export async function fetchSingleFeed(
  env: FetchEnv,
  userId: string,
  feedHash: string,
): Promise<import('../types').Feed | null> {
  const subs = await readUserSubscriptions(env.RSS_DATA, userId);
  const sub = subs.find((s) => s.feedHash === feedHash);
  if (!sub) return null;

  const { meta } = await fetchAndUpdateSharedFeed(env, feedHash, true);
  if (!meta) return null;

  return assembleClientFeed(meta, sub);
}

/**
 * 新規フィードを共有ストレージに登録してから初回取得する。
 * 既に meta.json が存在する場合はスキップ（別ユーザーが既に登録済み）。
 */
export async function registerAndFetchFeed(
  env: FetchEnv,
  feedUrl: string,
): Promise<void> {
  const feedHash = await computeFeedHash(feedUrl);
  const existing = await readFeedMeta(env.RSS_DATA, feedHash);
  if (!existing) {
    await createFeedMeta(env.RSS_DATA, feedHash, feedUrl);
  }
  await fetchAndUpdateSharedFeed(env, feedHash, true);
}

/**
 * ユーザーの feeds.json（旧形式）から subscriptions.json（新形式）を生成する。
 * マイグレーション・後方互換用。
 */
export async function migrateUserFeedsToSubscriptions(
  env: FetchEnv,
  userId: string,
): Promise<void> {
  const oldFeeds = await r2Get<Array<{
    id: string; url: string; title: string; siteUrl: string;
    lastFetchedAt: string | null; fetchError: string | null;
    consecutiveErrors?: number; lastErrorAt?: string | null;
    rateLimitedUntil?: string | null; lastModified?: string | null; etag?: string | null;
  }>>(env.RSS_DATA, `users/${userId}/feeds.json`, []);

  if (oldFeeds.length === 0) return;

  const existingSubs = await readUserSubscriptions(env.RSS_DATA, userId);
  const existingHashes = new Set(existingSubs.map((s) => s.feedHash));

  const newSubs: UserSubscription[] = [...existingSubs];
  for (const feed of oldFeeds) {
    const feedHash = await computeFeedHash(feed.url);
    if (existingHashes.has(feedHash)) continue;

    // 共有 meta が無ければ作成
    const existingMeta = await readFeedMeta(env.RSS_DATA, feedHash);
    let createdMeta: SharedFeedMeta | undefined;
    if (!existingMeta) {
      createdMeta = {
        feedHash,
        url: feed.url,
        title: feed.title,
        siteUrl: feed.siteUrl,
        lastFetchedAt: feed.lastFetchedAt,
        fetchError: feed.fetchError,
        consecutiveErrors: feed.consecutiveErrors,
        lastErrorAt: feed.lastErrorAt,
        rateLimitedUntil: feed.rateLimitedUntil,
        lastModified: feed.lastModified,
        etag: feed.etag,
        articleCount: 0,
        pageCount: 0,
      };
      await writeFeedMeta(env.RSS_DATA, createdMeta);
    }

    // 旧 title が共有 meta の title と異なる場合はユーザーがカスタマイズしていたと判断
    const existingOrCreatedMeta = existingMeta ?? createdMeta;
    const customTitle =
      existingOrCreatedMeta && feed.title !== existingOrCreatedMeta.title
        ? feed.title
        : undefined;
    newSubs.push({ feedHash, url: feed.url, customTitle, subscribedAt: new Date().toISOString() });
    existingHashes.add(feedHash);
  }

  await writeUserSubscriptions(env.RSS_DATA, userId, newSubs);
}

// ── 後方互換エクスポート ──────────────────────────────────────────

/** worker.ts の scheduled ハンドラから呼ばれる（後方互換） */
export { fetchAllFeeds as fetchAllUsers };

export { computeFeedHash, computeArticleId, readFeedMeta, createFeedMeta };
