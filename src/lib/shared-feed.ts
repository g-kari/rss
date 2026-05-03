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

export { pMap };

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
export const R2_CONCURRENCY = 10;

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

    // PUT(N) と GET(N+1) を並列実行して R2 レイテンシを削減
    if (currentOverflow.length > 0 && nextPage <= maxPages) {
      const [, nextExisting] = await Promise.all([
        r2Put(bucket, pageKey(feedHash, currentPage), page),
        r2Get<Article[]>(bucket, pageKey(feedHash, nextPage), []),
      ]);
      prefetched = nextExisting;
    } else {
      await r2Put(bucket, pageKey(feedHash, currentPage), page);
      prefetched = null;
    }

    lastWrittenPage = currentPage;
    currentPage = nextPage;
  }

  // maxPages を超過した overflow は末尾ページに追記してデータ喪失を防ぐ
  if (currentOverflow.length > 0) {
    const lastKey = pageKey(feedHash, maxPages);
    const existing = await r2Get<Article[]>(bucket, lastKey, []);
    const merged = sortByDate(deduplicateById([...currentOverflow, ...existing]));
    await r2Put(bucket, lastKey, merged);
    lastWrittenPage = maxPages;
    console.warn(
      `[shared-feed] feedHash=${feedHash} exceeded MAX_PAGES=${maxPages}. ` +
        `Appended ${currentOverflow.length} articles to p${maxPages} ` +
        `(page now holds ${merged.length} items, exceeds PAGE_SIZE=${pageSize}).`,
    );
    return { lastWrittenPage, oversized: true };
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
      if (JSON.stringify(av ?? null) !== JSON.stringify(ev ?? null)) return true;
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
  existingLatest?: Article[] | null,
): Promise<Article[]> {
  if (fetchedArticles.length === 0) return [];

  const latest = existingLatest ?? (await readLatestArticles(bucket, meta.feedHash));

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

  // knownIds を更新
  // latest ページの ID を末尾に配置して切り詰め時に必ず残るようにする
  const prevKnown = meta.knownIds ?? latest.map((a) => a.id);
  const newIds = brandNew.map((a) => a.id);
  const latestIds = new Set(merged.slice(0, PAGE_SIZE).map((a) => a.id));
  const historical = prevKnown.filter((id) => !latestIds.has(id));
  const updatedKnownIds = [...historical, ...newIds, ...latestIds];
  const uniqueKnown = [...new Set(updatedKnownIds)];
  meta.knownIds = uniqueKnown.slice(-KNOWN_IDS_MAX);

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
export async function listAllFeedHashes(bucket: R2Bucket): Promise<string[]> {
  return listPrefixedIds(bucket, "feeds/");
}

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
  const userIds = await listPrefixedIds(bucket, "users/");

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
