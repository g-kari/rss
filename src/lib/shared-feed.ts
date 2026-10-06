/**
 * 共有フィードストレージのヘルパー
 *
 * R2 キー構造:
 *   feeds/{feedHash}/meta.json              — SharedFeedMeta
 *   feeds/{feedHash}/articles/latest.json   — v2 head (最新 PAGE_SIZE 件 + segment refs)
 *   feeds/{feedHash}/articles/p{N}.json     — legacy Article[] (N >= 2)
 *   feeds/{feedHash}/articles/segments/*    — immutable Article[] (最大 PAGE_SIZE 件)
 *   users/{userId}/subscriptions.json       — UserSubscription[]
 */

import type { SharedFeedMeta, UserSubscription, Feed, Article } from "../types";
import { r2Get, r2Put, sha256Hex, feedLastFetchedKey, userKey } from "./r2";
import { compareByDateDesc } from "./article-utils";
import { pMap } from "./concurrency";

import { readLatestArticles, repairFeedArticleMetadata } from "./shared-feed-storage";
export { PAGE_SIZE, MAX_PAGES, KNOWN_IDS_MAX } from "./shared-feed-constants";
export {
  readLatestArticles,
  readArticlePage,
  readFeedArticleSnapshot,
  readFeedArticleRevision,
  repairFeedArticleMetadata,
  iterateFeedArticleBatches,
  readArticleObject,
  readFeedArticleObject,
  isArticleMutated,
  mergeNewArticles,
  mergeNewArticlesWithChanges,
  LegacyArticleWriteConflictError,
  migrateFeedArticleStorage,
} from "./shared-feed-storage";

/** 1 ユーザーあたりの最大フィード購読数 */
export const MAX_FEEDS_PER_USER = 1000;

/** ユーザーに返す記事の最大件数 */
export const MAX_USER_ARTICLES = 10_000;

/** R2 同時読み取りの並行度上限 */
export const R2_CONCURRENCY = 50;

// ── キー計算 ──────────────────────────────────────────────────────

/** フィード URL から feedHash を計算する (sha256 の先頭 16 文字) */
export async function computeFeedHash(feedUrl: string): Promise<string> {
  return (await sha256Hex(feedUrl)).slice(0, 16);
}

/** requestCookie 付きフィード用のユーザー固有 feedHash を計算する。
 *  共有フィードと衝突しないようにセパレータを含む。 */
export async function computePrivateFeedHash(feedUrl: string, userId: string): Promise<string> {
  return (await sha256Hex(`${feedUrl}:private:${userId}`)).slice(0, 16);
}

/** feedUrl + guid から決定論的な記事 ID を計算する */
export async function computeArticleId(feedUrl: string, guid: string): Promise<string> {
  return (await sha256Hex(`${feedUrl}|${guid}`)).slice(0, 16);
}

function metaKey(feedHash: string): string {
  return `feeds/${feedHash}/meta.json`;
}

function subsKey(userId: string): string {
  return userKey(userId, "subscriptions.json");
}

// ── SharedFeedMeta CRUD ───────────────────────────────────────────

export async function readFeedMeta(
  bucket: R2Bucket,
  feedHash: string,
): Promise<SharedFeedMeta | null> {
  const obj = await bucket.get(metaKey(feedHash));
  if (!obj) return null;
  try {
    return await obj.json<SharedFeedMeta>();
  } catch {
    // meta.json が破損している場合は null を返して再作成を促す
    console.error(`[shared-feed] Failed to parse meta.json for feedHash=${feedHash}`);
    return null;
  }
}

export async function writeFeedMeta(bucket: R2Bucket, meta: SharedFeedMeta): Promise<void> {
  await r2Put(bucket, metaKey(meta.feedHash), meta);
}

/** 空の SharedFeedMeta を作成して書き込む */
export async function createFeedMeta(
  bucket: R2Bucket,
  feedHash: string,
  url: string,
  title?: string,
  siteUrl?: string,
): Promise<SharedFeedMeta> {
  const meta: SharedFeedMeta = {
    feedHash,
    url,
    title: title ?? url,
    siteUrl: siteUrl ?? "",
    lastFetchedAt: null,
    fetchError: null,
    articleCount: 0,
    pageCount: 0,
    knownIds: [],
  };
  await writeFeedMeta(bucket, meta);
  return meta;
}

/** 既存の SharedFeedMeta を返す。存在しない場合は新規作成して返す。 */
export async function getOrCreateFeedMeta(
  bucket: R2Bucket,
  feedHash: string,
  url: string,
  title?: string,
  siteUrl?: string,
): Promise<SharedFeedMeta> {
  const existing = await readFeedMeta(bucket, feedHash);
  if (existing) return existing;
  return createFeedMeta(bucket, feedHash, url, title, siteUrl);
}

// ── 記事ページ読み書き ───────────────────────────────────────────

/** 日付降順ソート (publishedAt 優先、null は createdAt にフォールバック) */
function sortByDate(articles: Article[]): Article[] {
  return [...articles].sort(compareByDateDesc);
}

// ── UserSubscription CRUD ────────────────────────────────────────

export async function readUserSubscriptions(
  bucket: R2Bucket,
  userId: string,
): Promise<UserSubscription[]> {
  return r2Get<UserSubscription[]>(bucket, subsKey(userId), []);
}

export { mutateUserSubscriptions } from "./user-subscription-mutations";

// ── Feed 合成（API レスポンス用）────────────────────────────────

/** SharedFeedMeta + UserSubscription → クライアント向け Feed */
export function assembleClientFeed(meta: SharedFeedMeta, sub: UserSubscription): Feed {
  return {
    id: meta.feedHash,
    url: meta.url,
    title: sub.customTitle ?? meta.title,
    siteUrl: meta.siteUrl,
    lastFetchedAt: meta.lastFetchedAt,
    fetchError: meta.fetchError,
    consecutiveErrors: meta.consecutiveErrors,
    lastErrorAt: meta.lastErrorAt,
    rateLimitedUntil: meta.rateLimitedUntil,
    pageCount: meta.pageCount,
    filter: sub.filter,
    nsfw: sub.nsfw ?? false,
    priority: sub.priority,
    category: sub.category,
    groupId: sub.groupId,
    isScraping: !!meta.cssSelectors,
    cssSelector: meta.cssSelectors?.articleLink,
    failedSelectors: meta.failedSelectors,
    mutedUntil: sub.mutedUntil,
    view: sub.view,
    oversizeAlert: meta.oversizeAlert ?? false,
    digestLimit: sub.digestLimit,
  };
}

/**
 * ユーザーの購読フィード一覧を Feed[] として取得する。
 * meta.json が存在しないフィード（孤立した購読）はスキップする。
 */
export async function getUserFeeds(bucket: R2Bucket, userId: string): Promise<Feed[]> {
  const subs = await readUserSubscriptions(bucket, userId);
  if (subs.length === 0) return [];

  const metas = await pMap(
    subs,
    async (s) => {
      const meta = await readFeedMeta(bucket, s.feedHash);
      if (meta) await repairFeedArticleMetadata(bucket, meta);
      return meta;
    },
    R2_CONCURRENCY,
  );
  const feeds: Feed[] = [];
  for (let i = 0; i < subs.length; i++) {
    const sub = subs[i];
    const meta = metas[i];
    if (meta) feeds.push(assembleClientFeed(meta, sub));
  }
  return feeds;
}

/**
 * ユーザーの全購読フィードの latest.json を並行取得してマージ・ソートした記事一覧を返す。
 * 各フィードから最新 PAGE_SIZE 件ずつ取得する。
 *
 * @param since ISO 文字列または ms 数値文字列。指定すると feed-last-fetched.json を 1 回読んで
 *   since 以降に更新されたフィードのみ R2 GET する（N+1 GET 削減）。
 *   subs が呼び出し元で既にフィルタ済みの場合は内部フィルタはスキップされる。
 */
export async function getUserLatestArticles(
  bucket: R2Bucket,
  userId: string,
  subs?: UserSubscription[],
  since?: string,
): Promise<Article[]> {
  const resolvedSubs = subs ?? (await readUserSubscriptions(bucket, userId));
  if (resolvedSubs.length === 0) return [];

  // since が指定されており、かつ呼び出し元が subs を渡していない場合のみ内部フィルタを適用する。
  // 呼び出し元が既にフィルタ済み subs を渡している場合（route.ts の since 経路等）は
  // feed-last-fetched.json の追加読み込みをスキップしてパフォーマンスを維持する。
  let activeSubs = resolvedSubs;
  if (since !== undefined && subs === undefined) {
    const sinceMs = Date.parse(since);
    if (!Number.isNaN(sinceMs)) {
      const lastFetched = await r2Get<Record<string, string>>(
        bucket,
        feedLastFetchedKey(userId),
        {},
      );
      activeSubs = resolvedSubs.filter((s) => {
        const lastFetchedAt = lastFetched[s.feedHash];
        // キャッシュ未設定（初回 or cron 未実行）は保守的に含める
        if (!lastFetchedAt) return true;
        return Date.parse(lastFetchedAt) > sinceMs;
      });
    }
  }

  if (activeSubs.length === 0) return [];

  const pages = await pMap(
    activeSubs,
    (s) => readLatestArticles(bucket, s.feedHash),
    R2_CONCURRENCY,
  );
  return sortByDate(pages.flat()).slice(0, MAX_USER_ARTICLES);
}

/** R2 の prefix/ 直下にある ID（ディレクトリ名）を全件列挙する */
async function listPrefixedIds(bucket: R2Bucket, prefix: string): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix, delimiter: "/", cursor });
    for (const p of listed.delimitedPrefixes) {
      ids.push(p.slice(prefix.length, -1));
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return ids;
}

/** 全 feedHash を R2 の feeds/ プレフィックスから列挙する */

/** 全ユーザーの subscriptions.json から feedHash → userId[] のマップを構築する。
 *  requestCookie 付き購読は privateFeedCookies に分離し、共有フィードに Cookie を流出させない。 */
export async function buildFeedUserMap(bucket: R2Bucket): Promise<{
  feedUserMap: Map<string, string[]>;
  /** feedHash → 購読者の最新 lastAccessedAt（非アクティブフィード判定用） */
  feedLastAccessMap: Map<string, string>;
  /** priority: "high" が設定されているフィードの Set（常にフェッチ対象） */
  feedHasPriority: Set<string>;
  /** feedHash → requestCookie（private フィード専用。購読者は所有者 1 人のみ） */
  privateFeedCookies: Map<string, string>;
}> {
  const feedUserMap = new Map<string, string[]>();
  const feedLastAccessMap = new Map<string, string>();
  const feedHasPriority = new Set<string>();
  const privateFeedCookies = new Map<string, string>();

  // インデックス優先: meta/user-index.json があればそれを使い R2 LIST を省略する。
  // インデックスが空（初回 / 破損）の場合は既存の LIST にフォールバックして後方互換を保つ。
  const indexedIds = await readUserIndex(bucket);
  const userIds = indexedIds.length > 0 ? indexedIds : await listPrefixedIds(bucket, "users/");

  const allSubs = await pMap(
    userIds,
    async (uid) => ({ uid, subs: await readUserSubscriptions(bucket, uid) }),
    R2_CONCURRENCY,
  );
  for (const { uid, subs } of allSubs) {
    for (const s of subs) {
      const users = feedUserMap.get(s.feedHash) ?? [];
      users.push(uid);
      feedUserMap.set(s.feedHash, users);
      if (s.requestCookie) {
        privateFeedCookies.set(s.feedHash, s.requestCookie);
      }
      if (s.lastAccessedAt) {
        const current = feedLastAccessMap.get(s.feedHash);
        if (!current || s.lastAccessedAt > current) {
          feedLastAccessMap.set(s.feedHash, s.lastAccessedAt);
        }
      }
      if (s.priority === "high") {
        feedHasPriority.add(s.feedHash);
      }
    }
  }
  // 複数ユーザーが購読する feedHash では Cookie を使わない（共有ストレージへの漏洩防止）
  for (const [feedHash] of privateFeedCookies) {
    const users = feedUserMap.get(feedHash);
    if (users && users.length > 1) {
      privateFeedCookies.delete(feedHash);
    }
  }
  return { feedUserMap, feedLastAccessMap, feedHasPriority, privateFeedCookies };
}

/** feedUserMap フルキャッシュの KV キャッシュキー（TTL: 15分） */
export const FEED_USER_MAP_CACHE_KEY = "feedUserMapFull:v2";
const FEED_USER_MAP_TTL_SEC = 1800;

interface FeedUserMapCacheEntry {
  feedUserMap: Record<string, string[]>;
  feedLastAccessMap: Record<string, string>;
  feedHasPriority: string[];
  privateFeedCookies: Record<string, string>;
}

/**
 * buildFeedUserMap のキャッシュ付きラッパー。
 * RATE_LIMIT KV に全データを JSON でキャッシュし、15分間は R2 読み取りをスキップする。
 * 4つのデータ構造を一括キャッシュすることで、キャッシュヒット時の R2 読み取りをゼロにする（Issue #394）。
 */

// ── ユーザーインデックス（meta/user-index.json）────────────────────
//
// cron の buildFeedUserMap が毎回 R2 LIST + 全購読ファイル取得するコストを削減するため、
// フィード追加・削除のタイミングで userId 一覧を meta/user-index.json に同期管理する。
// インデックスが空（初回 / 破損）の場合は既存の LIST フォールバックを使い後方互換を保つ。

/** ユーザーインデックスの R2 キー */
export const USER_INDEX_KEY = "meta/user-index.json";

/**
 * meta/user-index.json を読み込む。存在しない場合は空配列を返す。
 */
export async function readUserIndex(bucket: R2Bucket): Promise<string[]> {
  return r2Get<string[]>(bucket, USER_INDEX_KEY, []);
}

/**
 * userId をインデックスに追加する（未追加の場合のみ）。
 * 並行書き込みによる競合リスクを最小化するため、追加前に再読み込みする。
 */
export async function addUserToIndex(bucket: R2Bucket, userId: string): Promise<void> {
  await mutateUserIndex(bucket, (index) => (index.includes(userId) ? index : [...index, userId]));
}

/**
 * userId をインデックスから削除する。
 * フィード削除後の購読件数がゼロになった場合のみ呼ぶ想定。
 */
export async function removeUserFromIndex(bucket: R2Bucket, userId: string): Promise<void> {
  await mutateUserIndex(bucket, (index) => index.filter((id) => id !== userId));
}

/** Conditional index writes prevent concurrent additions for different accounts being lost. */
async function mutateUserIndex(
  bucket: R2Bucket,
  mutate: (index: string[]) => string[],
): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const object = await bucket.get(USER_INDEX_KEY);
    if (object && (!object.etag || object.size > 4 * 1024 * 1024))
      throw new Error("User index is unavailable");
    const value: unknown = object ? await object.json() : [];
    if (!Array.isArray(value) || !value.every((id) => typeof id === "string"))
      throw new Error("User index is unavailable");
    const next = mutate(value);
    if (JSON.stringify(next) === JSON.stringify(value)) return;
    const committed = await bucket.put(USER_INDEX_KEY, JSON.stringify(next), {
      onlyIf: object ? { etagMatches: object.etag } : { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/json" },
    });
    if (committed) return;
  }
  throw new Error("User index update conflict");
}

export async function buildFeedUserMapCached(
  bucket: R2Bucket,
  kv: KVNamespace,
): Promise<{
  feedUserMap: Map<string, string[]>;
  feedLastAccessMap: Map<string, string>;
  feedHasPriority: Set<string>;
  privateFeedCookies: Map<string, string>;
}> {
  // KV キャッシュを確認
  const cached = await kv.get<FeedUserMapCacheEntry>(FEED_USER_MAP_CACHE_KEY, "json");
  if (cached) {
    return {
      feedUserMap: new Map(Object.entries(cached.feedUserMap)),
      feedLastAccessMap: new Map(Object.entries(cached.feedLastAccessMap)),
      feedHasPriority: new Set(cached.feedHasPriority),
      privateFeedCookies: new Map(Object.entries(cached.privateFeedCookies)),
    };
  }

  // キャッシュミス: R2 から全量取得してキャッシュ
  const result = await buildFeedUserMap(bucket);
  const entry: FeedUserMapCacheEntry = {
    feedUserMap: Object.fromEntries(result.feedUserMap),
    feedLastAccessMap: Object.fromEntries(result.feedLastAccessMap),
    feedHasPriority: [...result.feedHasPriority],
    privateFeedCookies: Object.fromEntries(result.privateFeedCookies),
  };
  await kv.put(FEED_USER_MAP_CACHE_KEY, JSON.stringify(entry), {
    expirationTtl: FEED_USER_MAP_TTL_SEC,
  });
  return result;
}
