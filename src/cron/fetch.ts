import type { Article, SharedFeedMeta, PushConfig } from "../types";

import { parseFeed, type ParsedItem } from "../lib/xml-parser";
import { compareByPublishedAtDesc } from "../lib/article-utils";
import { scrapeFeed } from "../lib/llm-feed-generator";
import { isValidFeedUrl } from "../lib/url";
import {
  fetchFollowSafeRedirects,
  readBodyBytesPartial,
  computeNextFetchEarliestAt,
} from "../lib/fetch";
import { sendPushToAll, type PushPayload } from "../lib/web-push";
import { parseRetryAfter as parseRetryAfterRaw } from "../lib/retry-after";
import { r2Get, r2Put, userPushKey } from "../lib/r2";
import { formatError } from "../lib/serialize-error";
import {
  computeFeedHash,
  computePrivateFeedHash,
  computeArticleId,
  readFeedMeta,
  writeFeedMeta,
  createFeedMeta,
  mergeNewArticles,
  readUserSubscriptions,
  listAllFeedHashes,
  buildFeedUserMapCached,
  readLatestArticles,
  assembleClientFeed,
} from "../lib/shared-feed";
import { pMapSettled } from "../lib/concurrency";
import { INACTIVE_FEED_DAYS } from "../lib/article-ttl";
import { serializeError } from "../lib/serialize-error";
import { appendAccessKeyIfRsshub, getRSSHubInstance, getRSSHubAccessKey } from "../lib/rsshub";
import { isInSilentHours } from "../lib/push-silent-hours";

type FetchEnv = Pick<CloudflareEnv, "RSS_DATA" | "FINDME_RSS" | "RATE_LIMIT">;

const CONSECUTIVE_ERROR_SKIP_THRESHOLD = 5;
const FEED_ERROR_RETRY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 時間
const FETCH_TIMEOUT_MS = 15_000;
/** フィード XML の最大サイズ（10MB）。超過分は切り捨ててパースする */
const FEED_MAX_BYTES = 10 * 1024 * 1024;
/** 1 フィードあたりの最大記事数。巨大フィードの初回取得で R2 操作が爆発しないよう制限 */
const FEED_MAX_ITEMS = 1000;

/** cron 実行時のフィード並行取得数上限 */
const FEED_FETCH_CONCURRENCY = 5;
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
  const existingById = new Map(existingLatest.map((a) => [a.id, a]));
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

function applyFeedSuccess(meta: SharedFeedMeta, parsed: ReturnType<typeof parseFeed>): void {
  meta.title = parsed.title || meta.title;
  meta.siteUrl = parsed.siteUrl || meta.siteUrl;
  resetFeedSuccessState(meta);
}

function applyFeedRateLimit(meta: SharedFeedMeta, error: RateLimitError): void {
  meta.rateLimitedUntil = new Date(Date.now() + error.retryAfterMs).toISOString();
  meta.fetchError = error.message;
  console.warn("Feed rate limited", {
    feedHash: meta.feedHash,
    url: meta.url,
    rateLimitedUntil: meta.rateLimitedUntil,
  });
}

function applyFeedError(meta: SharedFeedMeta, error: unknown): void {
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

/** CSS セレクタが設定されている生成フィードの HTML をスクレイプして記事を取得する。 */
async function fetchAndScrapeWithSelectors(
  env: FetchEnv,
  meta: SharedFeedMeta,
  requestCookie?: string,
): Promise<{ articles: Article[]; existingLatest: Article[] | null }> {
  const selectors = meta.cssSelectors!;
  const headers: Record<string, string> = { "User-Agent": "rss-reader/1.0" };
  if (requestCookie) headers["Cookie"] = requestCookie;
  const fetchUrl = appendAccessKeyIfRsshub(meta.url, getRSSHubInstance(), getRSSHubAccessKey());
  const res = await fetchViaBinding(env, fetchUrl, { headers });
  if (res.status === 429) throw new RateLimitError(parseRetryAfter(res.headers.get("Retry-After")));
  if (!res.ok) throw new Error(`${res.status} ${meta.url}`);

  const html = await res.text();
  const parsed = scrapeFeed(html, selectors, meta.siteUrl || meta.url, meta.title);
  applyFeedSuccess(meta, parsed);

  return buildArticlesFromItems(env.RSS_DATA, meta, parsed.items);
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
  options: { conditional?: boolean; requestCookie?: string } = {},
): Promise<{ articles: Article[]; existingLatest: Article[] | null }> {
  // LLM 生成フィード（CSS セレクタが設定されている場合）はスクレイピングで取得
  if (meta.cssSelectors) {
    return fetchAndScrapeWithSelectors(env, meta, options.requestCookie);
  }

  const reqHeaders: Record<string, string> = { "User-Agent": "rss-reader/1.0" };
  if (options.requestCookie) reqHeaders["Cookie"] = options.requestCookie;
  if (options.conditional) {
    if (meta.etag) reqHeaders["If-None-Match"] = meta.etag;
    if (meta.lastModified) reqHeaders["If-Modified-Since"] = meta.lastModified;
  }
  // RSSHub インスタンスへのリクエストなら ACCESS_KEY を動的付与（保存 URL には含めない）
  const fetchUrl = appendAccessKeyIfRsshub(meta.url, getRSSHubInstance(), getRSSHubAccessKey());
  const res = await fetchViaBinding(env, fetchUrl, { headers: reqHeaders });
  if (res.status === 429) throw new RateLimitError(parseRetryAfter(res.headers.get("Retry-After")));
  if (res.status === 304) {
    resetFeedSuccessState(meta);
    applyCacheControl(meta, res.headers.get("Cache-Control"));
    return { articles: [], existingLatest: null };
  }
  if (!res.ok) throw new Error(`${res.status} ${meta.url}`);

  const bodyBytes = res.body
    ? await readBodyBytesPartial(res.body, FEED_MAX_BYTES)
    : new Uint8Array();
  const xml = new TextDecoder().decode(bodyBytes);
  const parsed = parseFeed(xml);
  // 巨大フィードの初回取得で cascadeOverflow の R2 操作が爆発しないよう
  // publishedAt 降順で最新 FEED_MAX_ITEMS 件に切り詰める
  if (parsed.items.length > FEED_MAX_ITEMS) {
    parsed.items = parsed.items.sort(compareByPublishedAtDesc).slice(0, FEED_MAX_ITEMS);
  }

  applyFeedSuccess(meta, parsed);
  const lastModified = res.headers.get("Last-Modified");
  const etag = res.headers.get("ETag");
  // CRLF を含む値は後続の fetch ヘッダーインジェクションや DoS の原因になるため除去する。
  // RFC 7232 では ETag は最大数百文字程度が想定されるため 512 文字で切り詰める。
  if (lastModified) meta.lastModified = lastModified.replace(/[\r\n]/g, "").slice(0, 128);
  if (etag) meta.etag = etag.replace(/[\r\n]/g, "").slice(0, 512);
  applyCacheControl(meta, res.headers.get("Cache-Control"));

  return buildArticlesFromItems(env.RSS_DATA, meta, parsed.items);
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
): Promise<{ newArticles: Article[]; meta: SharedFeedMeta | null }> {
  const meta = await readFeedMeta(env.RSS_DATA, feedHash);
  if (!meta) {
    console.warn("fetchAndUpdateSharedFeed: meta not found", { feedHash });
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
    // Cache-Control: max-age で示されたキャッシュ寿命内なら cron 取得をスキップし
    // 配信元サーバーへの不要なアクセスを抑制する（手動 refresh は forceRetry=true で通す）
    if (meta.nextFetchEarliestAt && new Date(meta.nextFetchEarliestAt).getTime() > Date.now()) {
      return { newArticles: [], meta };
    }
  }

  if (!isValidFeedUrl(meta.url)) throw new Error(`Invalid feed URL: ${meta.url}`);

  let newArticles: Article[] = [];
  try {
    const { articles: fetched, existingLatest } = await fetchAndParseFeed(env, meta, {
      conditional: !forceRetry,
      requestCookie,
    });
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

export interface FeedNewArticles {
  articles: Article[];
  feedTitle: string;
  feedHash: string;
}

export function buildBatchedPushPayload(feedEntries: FeedNewArticles[]): PushPayload {
  const totalCount = feedEntries.reduce((sum, e) => sum + e.articles.length, 0);
  if (feedEntries.length === 1) {
    const { articles, feedTitle } = feedEntries[0];
    const body =
      articles.length === 1 ? articles[0].title || "新着記事" : `${articles.length} 件の新着記事`;
    return { title: feedTitle, body, url: "/" };
  }
  return {
    title: "RSS Reader",
    body: `${totalCount} 件の新着記事（${feedEntries.length} フィード）`,
    url: "/",
  };
}

async function sendPushBatched(
  env: FetchEnv,
  userFeedMap: Map<string, FeedNewArticles[]>,
): Promise<void> {
  await pMapSettled(
    [...userFeedMap.entries()],
    async ([userId, feedEntries]) => {
      const pushKey = userPushKey(userId);
      const config = await r2Get<PushConfig>(env.RSS_DATA, pushKey, { subscriptions: [] });
      if (config.subscriptions.length === 0) return;

      if (isInSilentHours(config)) return;

      const enabledEntries = config.disabledFeeds
        ? feedEntries.filter((e) => !config.disabledFeeds![e.feedHash])
        : feedEntries;
      if (enabledEntries.length === 0) return;

      const payload = buildBatchedPushPayload(enabledEntries);
      const remaining = await sendPushToAll(config.subscriptions, payload);
      if (remaining.length !== config.subscriptions.length) {
        config.subscriptions = remaining;
        await r2Put(env.RSS_DATA, pushKey, config);
      }
    },
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
  const { feedUserMap, feedLastAccessMap, feedHasPriority, privateFeedCookies } =
    await buildFeedUserMapCached(env.RSS_DATA, env.RATE_LIMIT);

  const feedHashes = await listAllFeedHashes(env.RSS_DATA);
  if (feedHashes.length === 0) return;

  // 非アクティブフィードをスキップ
  const inactiveThresholdMs = INACTIVE_FEED_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let skipped = 0;
  const activeFeedHashes = feedHashes.filter((feedHash) => {
    // 購読者がいないフィード → スキップ
    if (!feedUserMap.has(feedHash)) {
      skipped++;
      return false;
    }
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
    `cron: skipped ${skipped}/${feedHashes.length} inactive feeds, fetching ${activeFeedHashes.length}`,
  );

  const results = await pMapSettled(
    activeFeedHashes,
    (feedHash) => fetchAndUpdateSharedFeed(env, feedHash, false, privateFeedCookies.get(feedHash)),
    FEED_FETCH_CONCURRENCY,
  );

  // Push 通知: userId → FeedNewArticles[] のマップを構築して一括送信
  const userFeedMap = new Map<string, FeedNewArticles[]>();
  for (let i = 0; i < activeFeedHashes.length; i++) {
    const result = results[i];
    if (result.status !== "fulfilled" || result.value.newArticles.length === 0) continue;
    const { newArticles, meta } = result.value;
    const feedHash = activeFeedHashes[i];
    const userIds = feedUserMap.get(feedHash) ?? [];
    for (const userId of userIds) {
      let entries = userFeedMap.get(userId);
      if (!entries) {
        entries = [];
        userFeedMap.set(userId, entries);
      }
      entries.push({ articles: newArticles, feedTitle: meta?.title ?? "RSS", feedHash });
    }
  }
  if (userFeedMap.size > 0) {
    await sendPushBatched(env, userFeedMap);
  }
}

/**
 * 特定ユーザーが購読する全フィードを強制再取得する（手動リフレッシュ用）。
 * エラー・レートリミット状態に関わらず再試行する。
 */
export async function fetchArticles(env: FetchEnv, userId: string): Promise<void> {
  const subs = await readUserSubscriptions(env.RSS_DATA, userId);
  if (subs.length === 0) return;
  await pMapSettled(
    subs,
    (s) => fetchAndUpdateSharedFeed(env, s.feedHash, true, s.requestCookie),
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
): Promise<import("../types").Feed | null> {
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
