/**
 * 共有フィードストレージのヘルパー
 *
 * R2 キー構造:
 *   feeds/{feedHash}/meta.json              — SharedFeedMeta
 *   feeds/{feedHash}/articles/latest.json   — Article[] (最新 PAGE_SIZE 件)
 *   feeds/{feedHash}/articles/p{N}.json     — Article[] (古いページ、N >= 2)
 *   users/{userId}/subscriptions.json       — UserSubscription[]
 */

import type { SharedFeedMeta, UserSubscription, Feed, Article } from "../types";
import { r2Get, r2Put, sha256Hex } from "./r2";
import { compareByDateDesc } from "./article-utils";
import { pMap } from "./concurrency";

/** 1 ページあたりの記事数 */
export const PAGE_SIZE = 500;

/** 1 ユーザーあたりの最大フィード購読数 */
export const MAX_FEEDS_PER_USER = 1000;

/** ページネーションの最大ページ数（1 フィードあたり最大 PAGE_SIZE × MAX_PAGES 件） */
export const MAX_PAGES = 500;

/** フィードの既知 ID 追跡リストの上限（重複チェック用、古いものから切り詰め） */
export const KNOWN_IDS_MAX = 10_000;

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

function latestKey(feedHash: string): string {
  return `feeds/${feedHash}/articles/latest.json`;
}

function pageKey(feedHash: string, page: number): string {
  return `feeds/${feedHash}/articles/p${page}.json`;
}

function subsKey(userId: string): string {
  return `users/${userId}/subscriptions.json`;
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

/**
 * 複数フィードの meta.json を並行度制限付きで一括取得する。
 * 単発の readFeedMeta を N 回呼ぶ代わりにこれを使うことで R2 GET の N+1 問題を解消する。
 * 戻り値の配列順は feedHashes と同じ（存在しないフィードは null）。
 */
export async function getFeedsMeta(
  bucket: R2Bucket,
  feedHashes: string[],
): Promise<(SharedFeedMeta | null)[]> {
  if (feedHashes.length === 0) return [];
  return pMap(feedHashes, (hash) => readFeedMeta(bucket, hash), R2_CONCURRENCY);
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

/** latest.json を読む */
export async function readLatestArticles(bucket: R2Bucket, feedHash: string): Promise<Article[]> {
  return r2Get<Article[]>(bucket, latestKey(feedHash), []);
}

/** 特定ページを読む (page >= 2) */
export async function readArticlePage(
  bucket: R2Bucket,
  feedHash: string,
  page: number,
): Promise<Article[]> {
  return r2Get<Article[]>(bucket, pageKey(feedHash, page), []);
}

/** 日付降順ソート (publishedAt 優先、null は createdAt にフォールバック) */
function sortByDate(articles: Article[]): Article[] {
  return [...articles].sort(compareByDateDesc);
}

/** id ベースで重複を除去する（先に出現した方を優先） */
function deduplicateById(articles: Article[]): Article[] {
  const seen = new Set<string>();
  return articles.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}

/**
 * カスケード中の 1 ページ分の書き込みと次ページの先読みを並列実行する。
 * 続きの overflow が残っていて次ページが maxPages 内なら PUT(N) と GET(N+1) を
 * Promise.all で並列実行し、R2 のラウンドトリップを 1 回節約する。
 */
async function flushPageAndPrefetchNext(
  bucket: R2Bucket,
  feedHash: string,
  pageNum: number,
  page: Article[],
  hasMoreOverflow: boolean,
  nextPage: number,
  maxPages: number,
): Promise<Article[] | null> {
  if (hasMoreOverflow && nextPage <= maxPages) {
    const [, nextExisting] = await Promise.all([
      r2Put(bucket, pageKey(feedHash, pageNum), page),
      r2Get<Article[]>(bucket, pageKey(feedHash, nextPage), []),
    ]);
    return nextExisting;
  }
  await r2Put(bucket, pageKey(feedHash, pageNum), page);
  return null;
}

/**
 * Issue #131: maxPages を超過して残った overflow を末尾ページに追記する。
 * silent drop よりも整合性を優先するため、PAGE_SIZE 超過状態で保存される。
 * 警告ログを出して運用監視できるようにする。
 */
async function appendOverflowToFinalPage(
  bucket: R2Bucket,
  feedHash: string,
  overflow: Article[],
  maxPages: number,
  pageSize: number,
): Promise<void> {
  const lastKey = pageKey(feedHash, maxPages);
  const existing = await r2Get<Article[]>(bucket, lastKey, []);
  const merged = sortByDate(deduplicateById([...overflow, ...existing]));
  await r2Put(bucket, lastKey, merged);
  console.warn(
    `[shared-feed] feedHash=${feedHash} exceeded MAX_PAGES=${maxPages}. ` +
      `Appended ${overflow.length} articles to p${maxPages} ` +
      `(page now holds ${merged.length} items, exceeds PAGE_SIZE=${pageSize}).`,
  );
}

/**
 * overflow を pageNum ページに先頭挿入し、溢れたぶんを次ページへカスケードする。
 * overflow は pageNum ページの既存コンテンツより「新しい」記事（すでにソート済み）。
 * 戻り値: 実際に書き込んだ最大ページ番号。
 *
 * Issue #131: MAX_PAGES を超過した場合、残った overflow を末尾ページ (p{MAX_PAGES}) に
 * 追記してデータ喪失を防ぐ。PAGE_SIZE を超過した状態で保存されるが、silent drop よりも
 * 整合性を優先する。警告ログで運用監視できるようにする。
 */
export async function cascadeOverflow(
  bucket: R2Bucket,
  feedHash: string,
  overflow: Article[],
  pageNum: number,
  options?: { maxPages?: number; pageSize?: number },
): Promise<{ lastWrittenPage: number; oversized: boolean }> {
  const maxPages = options?.maxPages ?? MAX_PAGES;
  const pageSize = options?.pageSize ?? PAGE_SIZE;

  let currentOverflow = overflow;
  let currentPage = pageNum;
  let lastWrittenPage = pageNum - 1;

  // 先読み: 最初のページを取得
  let prefetched: Article[] | null =
    currentOverflow.length > 0 && currentPage <= maxPages
      ? await r2Get<Article[]>(bucket, pageKey(feedHash, currentPage), [])
      : null;

  while (currentOverflow.length > 0 && currentPage <= maxPages) {
    const existing = prefetched ?? [];

    // overflow (新しい) + existing (古い) を結合して重複排除・ソート
    const merged = sortByDate(deduplicateById([...currentOverflow, ...existing]));

    if (merged.length <= pageSize) {
      await r2Put(bucket, pageKey(feedHash, currentPage), merged);
      lastWrittenPage = currentPage;
      currentOverflow = [];
      break;
    }

    const page = merged.slice(0, pageSize);
    currentOverflow = merged.slice(pageSize);
    const nextPage = currentPage + 1;

    prefetched = await flushPageAndPrefetchNext(
      bucket,
      feedHash,
      currentPage,
      page,
      currentOverflow.length > 0,
      nextPage,
      maxPages,
    );

    lastWrittenPage = currentPage;
    currentPage = nextPage;
  }

  if (currentOverflow.length > 0) {
    await appendOverflowToFinalPage(bucket, feedHash, currentOverflow, maxPages, pageSize);
    return { lastWrittenPage: maxPages, oversized: true };
  }

  return { lastWrittenPage, oversized: false };
}

/**
 * 既存記事 `ex` に対して取得済み記事 `incoming` をマージすると内容が変わるかを判定する。
 * `createdAt` は mergeNewArticles 内で ex の値が保持されるため比較対象外。
 *
 * Issue #97: 実変更がない場合に R2 PUT を発行しないために使う。
 */
export function isArticleMutated(ex: Article, incoming: Article): boolean {
  const keys = Object.keys(incoming) as (keyof Article)[];
  for (const key of keys) {
    if (key === "createdAt") continue;
    const av = incoming[key];
    const ev = ex[key];
    if (Array.isArray(av) || Array.isArray(ev)) {
      if (!Array.isArray(av) || !Array.isArray(ev)) return true;
      if (av.length !== ev.length) return true;
      if (JSON.stringify(av) !== JSON.stringify(ev)) return true;
    } else if (av !== ev) {
      return true;
    }
  }
  return false;
}

/**
 * 新着記事を共有フィードストレージにマージして書き込む。
 * meta の articleCount / pageCount を更新する（呼び出し元が writeFeedMeta する）。
 * 戻り値: 真に新規だった Article の配列。
 */
export async function mergeNewArticles(
  bucket: R2Bucket,
  meta: SharedFeedMeta,
  fetchedArticles: Article[],
  existingLatest: Article[],
): Promise<Article[]> {
  if (fetchedArticles.length === 0) return [];

  const latest = existingLatest;

  // knownIds が存在する場合はそれを重複チェックに使う（全ページ横断の既知 ID）
  // 存在しない場合は latest の ID のみでチェック（後方互換）
  const knownIdsSet = meta.knownIds?.length
    ? new Set(meta.knownIds)
    : new Set(latest.map((a) => a.id));

  // 真に新規の記事（既知 ID に存在しない）
  const brandNew = fetchedArticles.filter((a) => !knownIdsSet.has(a.id));

  if (brandNew.length === 0) {
    // タイトル・サマリー等の更新のみ（ID は同じ）
    const existingMap = new Map(latest.map((a) => [a.id, a]));
    let changed = false;
    for (const a of fetchedArticles) {
      const ex = existingMap.get(a.id);
      if (ex && isArticleMutated(ex, a)) {
        // createdAt は保持して他フィールドを上書き
        existingMap.set(a.id, { ...ex, ...a, createdAt: ex.createdAt });
        changed = true;
      }
    }
    if (changed) {
      await r2Put(bucket, latestKey(meta.feedHash), sortByDate([...existingMap.values()]));
    }
    return [];
  }

  // latest + 新規記事をマージしてソート
  const merged = sortByDate([...latest, ...brandNew]);

  if (merged.length <= PAGE_SIZE) {
    await r2Put(bucket, latestKey(meta.feedHash), merged);
  } else {
    const newLatest = merged.slice(0, PAGE_SIZE);
    const overflow = merged.slice(PAGE_SIZE);
    await r2Put(bucket, latestKey(meta.feedHash), newLatest);
    const { lastWrittenPage: maxPage, oversized } = await cascadeOverflow(
      bucket,
      meta.feedHash,
      overflow,
      2,
    );
    meta.pageCount = Math.max(meta.pageCount, maxPage - 1); // pageCount は p2以降の数
    if (oversized) meta.oversizeAlert = true;
  }

  // knownIds を更新: latest ページ ID を末尾に置いて切り詰め時に必ず残るようにする
  // historical / overflowNewIds / latestPageIds は互いに disjoint のため dedup 不要
  const latestPageIds = new Set(merged.slice(0, PAGE_SIZE).map((a) => a.id));
  const prevKnown = meta.knownIds ?? latest.map((a) => a.id);
  const historical = prevKnown.filter((id) => !latestPageIds.has(id));
  const overflowNewIds = brandNew.filter((a) => !latestPageIds.has(a.id)).map((a) => a.id);
  meta.knownIds = [...historical, ...overflowNewIds, ...latestPageIds].slice(-KNOWN_IDS_MAX);

  meta.articleCount = (meta.articleCount ?? 0) + brandNew.length;
  return brandNew;
}

// ── UserSubscription CRUD ────────────────────────────────────────

export async function readUserSubscriptions(
  bucket: R2Bucket,
  userId: string,
): Promise<UserSubscription[]> {
  return r2Get<UserSubscription[]>(bucket, subsKey(userId), []);
}

export async function writeUserSubscriptions(
  bucket: R2Bucket,
  userId: string,
  subs: UserSubscription[],
): Promise<void> {
  await r2Put(bucket, subsKey(userId), subs);
}

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

  const metas = await pMap(subs, (s) => readFeedMeta(bucket, s.feedHash), R2_CONCURRENCY);
  return subs.flatMap((sub, i) => {
    const meta = metas[i];
    return meta ? [assembleClientFeed(meta, sub)] : [];
  });
}

/**
 * ユーザーの全購読フィードの latest.json を並行取得してマージ・ソートした記事一覧を返す。
 * 各フィードから最新 PAGE_SIZE 件ずつ取得する。
 */
export async function getUserLatestArticles(
  bucket: R2Bucket,
  userId: string,
  subs?: UserSubscription[],
): Promise<Article[]> {
  const resolvedSubs = subs ?? (await readUserSubscriptions(bucket, userId));
  if (resolvedSubs.length === 0) return [];

  const pages = await pMap(
    resolvedSubs,
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
    ids.push(...listed.delimitedPrefixes.map((p: string) => p.slice(prefix.length, -1)));
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
  const index = await readUserIndex(bucket);
  if (index.includes(userId)) return; // 既に登録済みならスキップ
  index.push(userId);
  await r2Put(bucket, USER_INDEX_KEY, index);
}

/**
 * userId をインデックスから削除する。
 * フィード削除後の購読件数がゼロになった場合のみ呼ぶ想定。
 */
export async function removeUserFromIndex(bucket: R2Bucket, userId: string): Promise<void> {
  const index = await readUserIndex(bucket);
  const filtered = index.filter((id) => id !== userId);
  if (filtered.length === index.length) return; // 変化なしなら書き込み不要
  await r2Put(bucket, USER_INDEX_KEY, filtered);
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
