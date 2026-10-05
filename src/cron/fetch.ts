import { removeExpiredPushSubscriptions } from "../lib/push-config";
import type { Article, SharedFeedMeta, PushConfig, FeedArticleCommit } from "../types";

import { parseFeed, type ParsedItem } from "../lib/xml-parser";
import { scrapeFeed } from "../lib/llm-feed-generator";
import { isValidFeedUrl } from "../lib/url";
import {
  fetchFollowSafeRedirects,
  readResponseText,
  FEED_MAX_BYTES,
  computeNextFetchEarliestAt,
  RSS_USER_AGENT,
} from "../lib/fetch";
import { sendPushToAll, type PushPayload } from "../lib/web-push";
import { parseRetryAfter as parseRetryAfterRaw } from "../lib/retry-after";
import { r2Get, r2Put, userPushKey, feedLastFetchedKey } from "../lib/r2";
import { formatError } from "../lib/serialize-error";
import {
  computeFeedHash,
  computePrivateFeedHash,
  computeArticleId,
  readFeedMeta,
  repairFeedArticleMetadata,
  writeFeedMeta,
  createFeedMeta,
  mergeNewArticlesWithChanges,
  readUserSubscriptions,
  buildFeedUserMapCached,
  readLatestArticles,
  assembleClientFeed,
} from "../lib/shared-feed";
import { createConcurrencyLimiter, pMapSettled, rotateBatchStart } from "../lib/concurrency";
import { INACTIVE_FEED_DAYS } from "../lib/article-ttl";
import { serializeError } from "../lib/serialize-error";
import { appendAccessKeyIfRsshub, getRSSHubInstance, getRSSHubAccessKey } from "../lib/rsshub";
import { isInSilentHours } from "../lib/push-silent-hours";
import {
  createSearchIndexBudget,
  ensureFeedSearchIndex,
  withSearchIndexBudget,
} from "../lib/article-search-index";

import { assertFeedWritesAllowed, isFeedWritesPaused } from "../lib/feed-write-maintenance";
import { isArticleSearchIndexEnabled, isArticleStorageV2Enabled } from "../lib/feed-rollout";
import { LegacyArticleWriteConflictError } from "../lib/shared-feed-legacy";

type FetchEnv = Pick<
  CloudflareEnv,
  | "RSS_DATA"
  | "FINDME_RSS"
  | "RATE_LIMIT"
  | "ARTICLE_SEARCH"
  | "RSS_FEED_WRITES_PAUSED"
  | "RSS_ARTICLE_STORAGE_V2"
  | "RSS_ARTICLE_SEARCH_INDEX"
>;

/** One D1 budget for the whole invocation, shared by all feed workers (Paid plan). */
function withMaintenanceBudget(env: FetchEnv): FetchEnv {
  return isArticleSearchIndexEnabled(env) && env.ARTICLE_SEARCH
    ? {
        ...env,
        ARTICLE_SEARCH: withSearchIndexBudget(env.ARTICLE_SEARCH, createSearchIndexBudget()),
      }
    : env;
}

const CONSECUTIVE_ERROR_SKIP_THRESHOLD = 5;
const FEED_ERROR_RETRY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 時間
const FETCH_TIMEOUT_MS = 15_000;
/** 1 フィードあたりの最大記事数。巨大フィードの初回取得で R2 操作が爆発しないよう制限 */
const FEED_MAX_ITEMS = 1000;

/** メタデータ確認・スキップ判定の並行数。上流 fetch は下の共有 permit 内でのみ開始する。 */
const FEED_WORKER_CONCURRENCY = 20;
/** fetch 開始から本文読み込み・パース・保存までの並行数。未読 Response を待機列に置かない。 */
const FEED_PIPELINE_CONCURRENCY = 2;
/** cron 実行時のユーザー並行処理数上限（Push 通知用） */
const USER_FETCH_CONCURRENCY = 3;

// ── エラー型 ──────────────────────────────────────────────────────

/** 429 Too Many Requests を表すカスタムエラー */
export class RateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`Rate limited: retry after ${Math.round(retryAfterMs / 1000)}s`);
    this.name = "RateLimitError";
  }
}

const DEFAULT_RATE_LIMIT_MS = 60 * 60 * 1000;
const MAX_RATE_LIMIT_MS = 24 * 60 * 60 * 1000;

/** cron 用 Retry-After パーサー（デフォルト 1 時間待機） */
export function parseRetryAfter(header: string | null): number {
  return parseRetryAfterRaw(header, {
    fallbackMs: DEFAULT_RATE_LIMIT_MS,
    maxMs: MAX_RATE_LIMIT_MS,
  });
}

// ── サービスバインディング ────────────────────────────────────────

const SERVICE_BINDING_HOSTS: Partial<Record<string, keyof FetchEnv>> = {
  "findme-rss.0g0.xyz": "FINDME_RSS",
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
export async function buildArticle(
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
    categories: item.categories.length > 0 ? item.categories : existing?.categories,
    metadata: item.metadata.length > 0 ? item.metadata : existing?.metadata,
  };
}

/** latest.json から既存記事マップを構築し、items を Article に変換して返す（createdAt 保持 + 二重 R2 GET 回避） */
async function buildArticlesFromItems(
  bucket: R2Bucket,
  meta: SharedFeedMeta,
  items: ParsedItem[],
): Promise<{ articles: Article[]; existingLatest: Article[] }> {
  const existingLatest = await readLatestArticles(bucket, meta.feedHash);
  const existingById = new Map<string, Article>();
  for (const article of existingLatest) existingById.set(article.id, article);
  const articles = await Promise.all(
    items.map((item) => buildArticle(item, meta.feedHash, meta.url, existingById)),
  );
  return { articles, existingLatest };
}

// ── フィードメタ更新ヘルパー ──────────────────────────────────────

function resetFeedSuccessState(meta: SharedFeedMeta): void {
  meta.lastFetchedAt = new Date().toISOString();
  meta.fetchError = null;
  meta.consecutiveErrors = 0;
  meta.lastErrorAt = null;
  meta.rateLimitedUntil = null;
}

export function applyFeedSuccess(meta: SharedFeedMeta, parsed: ReturnType<typeof parseFeed>): void {
  meta.title = parsed.title || meta.title;
  meta.siteUrl = parsed.siteUrl || meta.siteUrl;
  resetFeedSuccessState(meta);
}

export function applyFeedRateLimit(meta: SharedFeedMeta, error: RateLimitError): void {
  meta.rateLimitedUntil = new Date(Date.now() + error.retryAfterMs).toISOString();
  meta.fetchError = error.message;
  console.warn("Feed rate limited", {
    feedHash: meta.feedHash,
    url: meta.url,
    rateLimitedUntil: meta.rateLimitedUntil,
  });
}

export function applyFeedError(meta: SharedFeedMeta, error: unknown): void {
  meta.consecutiveErrors = Math.min(
    (meta.consecutiveErrors ?? 0) + 1,
    CONSECUTIVE_ERROR_SKIP_THRESHOLD,
  );
  meta.fetchError = formatError(error);
  meta.lastErrorAt = new Date().toISOString();
  // Cloudflare Workers のログは Error オブジェクトを JSON.stringify する際に
  // name / message / stack が non-enumerable のため `{}` になってしまう。
  // 明示的にプレーンオブジェクトへ展開して原因特定可能な形でログする。
  console.error("Feed fetch failed", {
    feedHash: meta.feedHash,
    url: meta.url,
    consecutiveErrors: meta.consecutiveErrors,
    error: serializeError(error),
  });
}

// ── フィード取得（共有ストレージ向け）────────────────────────────

interface FetchedFeedArticles {
  articles: Article[];
  existingLatest: Article[] | null;
}

type ConsumeFeedArticles = (fetched: FetchedFeedArticles) => Promise<Article[]>;

/** CSS セレクタが設定されている生成フィードの HTML をスクレイプして記事を取得する。 */
async function fetchAndScrapeWithSelectors(
  env: FetchEnv,
  meta: SharedFeedMeta,
  consume: ConsumeFeedArticles,
  requestCookie?: string,
): Promise<Article[]> {
  const selectors = meta.cssSelectors!;
  const headers: Record<string, string> = { "User-Agent": RSS_USER_AGENT };
  if (requestCookie) headers["Cookie"] = requestCookie;
  const fetchUrl = appendAccessKeyIfRsshub(meta.url, getRSSHubInstance(), getRSSHubAccessKey());
  const res = await fetchViaBinding(env, fetchUrl, { headers });
  if (!res.ok) {
    void res.body?.cancel().catch(() => {});
    if (res.status === 429)
      throw new RateLimitError(parseRetryAfter(res.headers.get("Retry-After")));
    throw new Error(`${res.status} ${meta.url}`);
  }

  const html = await readResponseText(res, FEED_MAX_BYTES, FETCH_TIMEOUT_MS);
  const parsed = scrapeFeed(html, selectors, meta.siteUrl || meta.url, meta.title);
  applyFeedSuccess(meta, parsed);
  return consume(await buildArticlesFromItems(env.RSS_DATA, meta, parsed.items));
}

/**
 * 単一フィードをフェッチしてパースし、Article[] を返す。
 * meta を副作用で更新する（呼び出し元が writeFeedMeta する）。
 * 304 Not Modified の場合は空配列を返す。
 * エラー時は RateLimitError またはその他 Error をスローする。
 */
async function fetchAndParseFeed(
  env: FetchEnv,
  meta: SharedFeedMeta,
  options: { conditional?: boolean; requestCookie?: string },
  consume: ConsumeFeedArticles,
): Promise<Article[]> {
  // LLM 生成フィード（CSS セレクタが設定されている場合）はスクレイピングで取得
  if (meta.cssSelectors) {
    return fetchAndScrapeWithSelectors(env, meta, consume, options.requestCookie);
  }

  const reqHeaders: Record<string, string> = { "User-Agent": RSS_USER_AGENT };
  if (options.requestCookie) reqHeaders["Cookie"] = options.requestCookie;
  if (options.conditional) {
    if (meta.etag) reqHeaders["If-None-Match"] = meta.etag;
    if (meta.lastModified) reqHeaders["If-Modified-Since"] = meta.lastModified;
  }
  // RSSHub インスタンスへのリクエストなら ACCESS_KEY を動的付与（保存 URL には含めない）
  const fetchUrl = appendAccessKeyIfRsshub(meta.url, getRSSHubInstance(), getRSSHubAccessKey());
  const res = await fetchViaBinding(env, fetchUrl, { headers: reqHeaders });
  if (res.status === 304) {
    resetFeedSuccessState(meta);
    applyCacheControl(meta, res.headers.get("Cache-Control"));
    void res.body?.cancel().catch(() => {});
    return [];
  }
  if (!res.ok) {
    void res.body?.cancel().catch(() => {});
    if (res.status === 429)
      throw new RateLimitError(parseRetryAfter(res.headers.get("Retry-After")));
    throw new Error(`${res.status} ${meta.url}`);
  }

  const xml = await readResponseText(res, FEED_MAX_BYTES, FETCH_TIMEOUT_MS);
  // Preserve the newest-item policy while avoiding content conversion for losing items.
  // The complete XML tree and nested-content preservation still run before selection.
  const parsed = parseFeed(xml, { maxItems: FEED_MAX_ITEMS });

  applyFeedSuccess(meta, parsed);
  const lastModified = res.headers.get("Last-Modified");
  const etag = res.headers.get("ETag");
  // CRLF を含む値は後続の fetch ヘッダーインジェクションや DoS の原因になるため除去する。
  // RFC 7232 では ETag は最大数百文字程度が想定されるため 512 文字で切り詰める。
  if (lastModified) meta.lastModified = lastModified.replace(/[\r\n]/g, "").slice(0, 128);
  if (etag) meta.etag = etag.replace(/[\r\n]/g, "").slice(0, 512);
  applyCacheControl(meta, res.headers.get("Cache-Control"));

  // 保存が詰まっても、解析済み記事がネットワーク並行数分たまらないよう permit を保持する。
  return consume(await buildArticlesFromItems(env.RSS_DATA, meta, parsed.items));
}

/**
 * レスポンス Cache-Control を meta.cacheControl / meta.nextFetchEarliestAt に反映する。
 * ヘッダーが欠落・不正・no-store のときは nextFetchEarliestAt を null にリセット。
 */
function applyCacheControl(meta: SharedFeedMeta, headerValue: string | null): void {
  // CRLF 除去と長さ制限（後続のデバッグ表示や再送に備える）
  const sanitized = headerValue ? headerValue.replace(/[\r\n]/g, "").slice(0, 256) : null;
  meta.cacheControl = sanitized;
  const nextMs = computeNextFetchEarliestAt(sanitized, Date.now());
  meta.nextFetchEarliestAt = nextMs === null ? null : new Date(nextMs).toISOString();
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
  requestCookie?: string,
  limitFeed = createConcurrencyLimiter(FEED_PIPELINE_CONCURRENCY),
): Promise<{ newArticles: Article[]; meta: SharedFeedMeta | null }> {
  assertFeedWritesAllowed(env);
  const meta = await readFeedMeta(env.RSS_DATA, feedHash);
  if (!meta) {
    console.warn("fetchAndUpdateSharedFeed: meta not found", { feedHash });
    return { newArticles: [], meta: null };
  }

  // R2 is authoritative. A failed derived-index write must never turn a successful
  // fetch into a feed error or roll back committed articles. The next refresh/cron
  // repairs an absent/stale index, including 304 and upstream cooldown branches.
  const repairSearchIndex = async (commit?: FeedArticleCommit): Promise<void> => {
    if (!isArticleSearchIndexEnabled(env) || !env.ARTICLE_SEARCH) return;
    try {
      await ensureFeedSearchIndex(env.ARTICLE_SEARCH, env.RSS_DATA, meta, commit);
    } catch (error) {
      console.error("Article search index update failed", {
        feedHash,
        error: serializeError(error),
      });
    }
  };

  if (!forceRetry) {
    if (meta.rateLimitedUntil && new Date(meta.rateLimitedUntil).getTime() > Date.now()) {
      if (env.ARTICLE_SEARCH) await limitFeed(() => repairSearchIndex());
      await repairFeedArticleMetadata(env.RSS_DATA, meta);
      return { newArticles: [], meta };
    }
    if ((meta.consecutiveErrors ?? 0) >= CONSECUTIVE_ERROR_SKIP_THRESHOLD) {
      const lastErrorMs = meta.lastErrorAt ? new Date(meta.lastErrorAt).getTime() : 0;
      if (Date.now() - lastErrorMs < FEED_ERROR_RETRY_INTERVAL_MS) {
        if (env.ARTICLE_SEARCH) await limitFeed(() => repairSearchIndex());
        await repairFeedArticleMetadata(env.RSS_DATA, meta);
        return { newArticles: [], meta };
      }
    }
    // Cache-Control: max-age で示されたキャッシュ寿命内なら cron 取得をスキップし
    // 配信元サーバーへの不要なアクセスを抑制する（手動 refresh は forceRetry=true で通す）
    if (meta.nextFetchEarliestAt && new Date(meta.nextFetchEarliestAt).getTime() > Date.now()) {
      if (env.ARTICLE_SEARCH) await limitFeed(() => repairSearchIndex());
      await repairFeedArticleMetadata(env.RSS_DATA, meta);
      return { newArticles: [], meta };
    }
  }

  if (!isValidFeedUrl(meta.url)) throw new Error(`Invalid feed URL: ${meta.url}`);

  // Do not acknowledge upstream validators until the article commit succeeds.
  // Otherwise a failed R2 write followed by 304 would permanently skip that batch.
  const priorFetchState = {
    title: meta.title,
    siteUrl: meta.siteUrl,
    lastFetchedAt: meta.lastFetchedAt,
    fetchError: meta.fetchError,
    consecutiveErrors: meta.consecutiveErrors,
    lastErrorAt: meta.lastErrorAt,
    rateLimitedUntil: meta.rateLimitedUntil,
    etag: meta.etag,
    lastModified: meta.lastModified,
    cacheControl: meta.cacheControl,
    nextFetchEarliestAt: meta.nextFetchEarliestAt,
  };
  let newArticles: Article[] = [];
  let checkedSearchIndex = false;
  let persistedMetadata = false;
  try {
    // Acquire before fetch: queued feeds must not hold unread response bodies.
    newArticles = await limitFeed(() =>
      fetchAndParseFeed(
        env,
        meta,
        { conditional: !forceRetry, requestCookie },
        async ({ articles: fetched, existingLatest }) => {
          const result = await mergeNewArticlesWithChanges(
            env.RSS_DATA,
            meta,
            fetched,
            existingLatest ?? [],
            { allowLegacyMigration: isArticleStorageV2Enabled(env) },
          );
          // Keep the body permit while writing the index: full article arrays must
          // not queue behind D1 outside the memory/concurrency gate.
          await repairSearchIndex(result.commit);
          checkedSearchIndex = true;
          await repairFeedArticleMetadata(env.RSS_DATA, meta);
          await writeFeedMeta(env.RSS_DATA, meta);
          persistedMetadata = true;
          return result.newArticles;
        },
      ),
    );
  } catch (e) {
    Object.assign(meta, priorFetchState);
    // The winner may still be cascading legacy archives. Do not persist our stale
    // counts/validators over its metadata or build an index from a partial cascade.
    if (e instanceof LegacyArticleWriteConflictError) throw e;
    if (e instanceof RateLimitError) {
      applyFeedRateLimit(meta, e);
    } else {
      applyFeedError(meta, e);
    }
  }

  if (!checkedSearchIndex && env.ARTICLE_SEARCH) await limitFeed(() => repairSearchIndex());
  if (!persistedMetadata) {
    await repairFeedArticleMetadata(env.RSS_DATA, meta);
    await writeFeedMeta(env.RSS_DATA, meta);
  }
  return { newArticles, meta };
}

// ── Push 通知 ─────────────────────────────────────────────────────

export interface FeedNewArticles {
  articles: Article[];
  feedTitle: string;
  feedHash: string;
}

/** バッチ完了を待つ間、本文や knownIds を保持しない通知専用の集約値。 */
interface FeedNotificationSummary {
  articleCount: number;
  firstArticleTitle: string;
  feedTitle: string;
  feedHash: string;
}

export function buildBatchedPushPayload(
  feedEntries: Array<FeedNewArticles | FeedNotificationSummary>,
): PushPayload {
  const summaries = feedEntries.map((entry) =>
    "articles" in entry
      ? {
          articleCount: entry.articles.length,
          firstArticleTitle: entry.articles[0]?.title ?? "",
          feedTitle: entry.feedTitle,
          feedHash: entry.feedHash,
        }
      : entry,
  );
  const totalCount = summaries.reduce((sum, e) => sum + e.articleCount, 0);
  if (summaries.length === 1) {
    const { articleCount, firstArticleTitle, feedTitle } = summaries[0];
    const body =
      articleCount === 1 ? firstArticleTitle || "新着記事" : `${articleCount} 件の新着記事`;
    return { title: feedTitle, body, url: "/" };
  }
  return {
    title: "RSS Reader",
    body: `${totalCount} 件の新着記事（${feedEntries.length} フィード）`,
    url: "/",
  };
}

/**
 * disabledFeeds (ユーザーが通知 OFF にした feedHash) を除外する。
 * 新着記事 push と error push の両経路で適用して、通知 OFF フィードからの
 * 通知漏れ (新着・エラーともに) を防ぐ。
 */
export function filterDisabledFeeds<T extends { feedHash: string }>(
  feeds: T[],
  disabledFeeds: Record<string, boolean> | undefined,
): T[] {
  if (!disabledFeeds) return feeds;
  return feeds.filter((f) => !disabledFeeds[f.feedHash]);
}

async function sendPushAll(
  env: FetchEnv,
  userFeedMap: Map<string, FeedNotificationSummary[]>,
  userFeedErrorMap: Map<string, FeedNotificationSummary[]>,
): Promise<void> {
  const userIds = new Set([...userFeedMap.keys(), ...userFeedErrorMap.keys()]);
  if (userIds.size === 0) return;

  await pMapSettled(
    [...userIds],
    async (userId) => {
      const pushKey = userPushKey(userId);
      const config = await r2Get<PushConfig>(env.RSS_DATA, pushKey, { subscriptions: [] });
      if (config.subscriptions.length === 0) return;

      if (isInSilentHours(config)) return;

      const feedEntries = userFeedMap.get(userId) ?? [];
      const errorFeeds = filterDisabledFeeds(
        userFeedErrorMap.get(userId) ?? [],
        config.disabledFeeds,
      );

      const enabledEntries = filterDisabledFeeds(feedEntries, config.disabledFeeds);

      let remaining = config.subscriptions;

      if (enabledEntries.length > 0) {
        const payload = buildBatchedPushPayload(enabledEntries);
        remaining = await sendPushToAll(remaining, payload);
      }

      if (errorFeeds.length > 0 && config.errorNotificationsEnabled !== false) {
        const payload: PushPayload =
          errorFeeds.length === 1
            ? {
                title: "フィードのエラー",
                body: `「${errorFeeds[0].feedTitle}」の取得に連続して失敗しています`,
                url: "/",
              }
            : {
                title: "フィードのエラー",
                body: `${errorFeeds.length} 件のフィードで取得エラーが続いています`,
                url: "/",
              };
        remaining = await sendPushToAll(remaining, payload);
      }

      if (remaining.length !== config.subscriptions.length) {
        const active = new Set(remaining.map((sub) => sub.endpoint));
        await removeExpiredPushSubscriptions(
          env.RSS_DATA,
          userId,
          config.subscriptions
            .filter((sub) => !active.has(sub.endpoint))
            .map((sub) => sub.endpoint),
        );
      }
    },
    USER_FETCH_CONCURRENCY,
  );
}

/** フィード連続エラーが閾値に達したユーザーへ Push 通知を送る */

// ── エントリポイント（cron / API ルートから呼ばれる）──────────────

/**
 * 全共有フィードを取得する（cron 用）。
 * 1. feedHash → userId[] の逆引きマップを構築
 * 2. 各フィードを並行取得
 * 3. 新着記事があったフィードの購読ユーザーに Push 通知を送る
 */
export async function fetchAllFeeds(env: FetchEnv): Promise<void> {
  if (isFeedWritesPaused(env.RSS_FEED_WRITES_PAUSED)) return;
  env = withMaintenanceBudget(env);
  const { feedUserMap, feedLastAccessMap, feedHasPriority, privateFeedCookies } =
    await buildFeedUserMapCached(env.RSS_DATA, env.RATE_LIMIT);

  // feedUserMap.keys() を使うことで listAllFeedHashes (R2 LIST) を省略する（Issue #402）
  // 購読者がいない孤立フィードは feedUserMap に存在しないため、動作は同一
  const allFeedHashes = [...feedUserMap.keys()];
  if (allFeedHashes.length === 0) return;

  // 非アクティブフィードをスキップ
  const inactiveThresholdMs = INACTIVE_FEED_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let skipped = 0;
  const activeFeedHashes = allFeedHashes.filter((feedHash) => {
    // 高優先度フィード → 常にフェッチ
    if (feedHasPriority.has(feedHash)) return true;
    // lastAccessedAt 未設定（既存ユーザー or 移行期間）→ 安全側でフェッチ
    const lastAccess = feedLastAccessMap.get(feedHash);
    if (!lastAccess) return true;
    // 閾値以上アクセスがない → スキップ
    if (now - new Date(lastAccess).getTime() > inactiveThresholdMs) {
      skipped++;
      return false;
    }
    return true;
  });
  console.log(
    `cron: skipped ${skipped}/${allFeedHashes.length} inactive feeds, fetching ${activeFeedHashes.length}`,
  );

  // 完了済みフィードは通知用のスカラーだけ残す。pMapSettled に Article[] や
  // SharedFeedMeta (knownIds 等) を返すと全フィード分がバッチ終端まで保持される。
  const userFeedMap = new Map<string, FeedNotificationSummary[]>();
  const userFeedErrorMap = new Map<string, FeedNotificationSummary[]>();
  const userTimestamps = new Map<string, Record<string, string>>();
  const limitFeed = createConcurrencyLimiter(FEED_PIPELINE_CONCURRENCY);
  await pMapSettled(
    rotateBatchStart(activeFeedHashes, Math.floor(Date.now() / (30 * 60 * 1000))),
    async (feedHash) => {
      const { newArticles, meta } = await fetchAndUpdateSharedFeed(
        env,
        feedHash,
        false,
        privateFeedCookies.get(feedHash),
        limitFeed,
      );
      if (!meta) return;
      const summary: FeedNotificationSummary = {
        feedHash,
        feedTitle: meta.title ?? "RSS",
        articleCount: newArticles.length,
        firstArticleTitle: newArticles.length === 1 ? newArticles[0].title : "",
      };
      const lastFetchedAt = meta.lastFetchedAt;
      // applyFeedError は閾値でクランプするため、エラースキップ時も従来どおり通知する。
      const justReachedErrorThreshold =
        (meta.consecutiveErrors ?? 0) === CONSECUTIVE_ERROR_SKIP_THRESHOLD &&
        meta.fetchError !== null &&
        summary.articleCount === 0;

      for (const userId of feedUserMap.get(feedHash) ?? []) {
        if (lastFetchedAt) {
          let timestamps = userTimestamps.get(userId);
          if (!timestamps) {
            timestamps = {};
            userTimestamps.set(userId, timestamps);
          }
          timestamps[feedHash] = lastFetchedAt;
        }

        if (summary.articleCount > 0) {
          let entries = userFeedMap.get(userId);
          if (!entries) {
            entries = [];
            userFeedMap.set(userId, entries);
          }
          entries.push(summary);
        }

        if (justReachedErrorThreshold) {
          let errorEntries = userFeedErrorMap.get(userId);
          if (!errorEntries) {
            errorEntries = [];
            userFeedErrorMap.set(userId, errorEntries);
          }
          errorEntries.push(summary);
        }
      }
    },
    FEED_WORKER_CONCURRENCY,
  );

  // feed-last-fetched.json を更新（since フィルタリングの N+1 meta.json 読み込みを排除）
  // 既存値とマージする (GET → merge → PUT)。今回 cycle で fetch されなかった
  // フィード (inactive / cooldown / error skip) の lastFetchedAt が消えると、
  // 次回 /api/articles?since= で当該フィードの meta.json 個別 GET (N+1) が
  // 再発するため、既存タイムスタンプを保持する必要がある。
  await pMapSettled(
    [...userTimestamps.entries()],
    async ([userId, timestamps]) => {
      const key = feedLastFetchedKey(userId);
      const existing = await r2Get<Record<string, string>>(env.RSS_DATA, key, {});
      await r2Put(env.RSS_DATA, key, { ...existing, ...timestamps });
    },
    USER_FETCH_CONCURRENCY,
  );

  await sendPushAll(env, userFeedMap, userFeedErrorMap);
}

/**
 * 特定ユーザーが購読する全フィードを強制再取得する（手動リフレッシュ用）。
 * エラー・レートリミット状態に関わらず再試行する。
 */
export async function fetchArticles(env: FetchEnv, userId: string): Promise<void> {
  assertFeedWritesAllowed(env);
  env = withMaintenanceBudget(env);
  const subs = await readUserSubscriptions(env.RSS_DATA, userId);
  if (subs.length === 0) return;
  const limitFeed = createConcurrencyLimiter(FEED_PIPELINE_CONCURRENCY);
  await pMapSettled(
    rotateBatchStart(subs, Math.floor(Date.now() / (30 * 60 * 1000))),
    async (s) => {
      await fetchAndUpdateSharedFeed(env, s.feedHash, true, s.requestCookie, limitFeed);
    },
    FEED_WORKER_CONCURRENCY,
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
): Promise<import("../types").Feed | null> {
  assertFeedWritesAllowed(env);
  env = withMaintenanceBudget(env);
  const subs = await readUserSubscriptions(env.RSS_DATA, userId);
  const sub = subs.find((s) => s.feedHash === feedHash);
  if (!sub) return null;

  const { meta } = await fetchAndUpdateSharedFeed(env, feedHash, true, sub.requestCookie);
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
  requestCookie?: string,
  userId?: string,
): Promise<void> {
  assertFeedWritesAllowed(env);
  env = withMaintenanceBudget(env);
  const feedHash =
    requestCookie && userId
      ? await computePrivateFeedHash(feedUrl, userId)
      : await computeFeedHash(feedUrl);
  const existing = await readFeedMeta(env.RSS_DATA, feedHash);
  if (!existing) {
    await createFeedMeta(env.RSS_DATA, feedHash, feedUrl);
  }
  await fetchAndUpdateSharedFeed(env, feedHash, true, requestCookie);
}
