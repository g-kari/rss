/**
 * 共有フィードストレージのヘルパー
 *
 * R2 キー構造:
 *   feeds/{feedHash}/meta.json              — SharedFeedMeta
 *   feeds/{feedHash}/articles/latest.json   — Article[] (最新 PAGE_SIZE 件)
 *   feeds/{feedHash}/articles/p{N}.json     — Article[] (古いページ、N >= 2)
 *   users/{userId}/subscriptions.json       — UserSubscription[]
 */

import type { SharedFeedMeta, UserSubscription, Feed, Article } from '../types';
import { r2Get, r2Put, sha256Hex } from './r2';

/** 1 ページあたりの記事数 */
export const PAGE_SIZE = 100;

/** ページネーションの最大ページ数（1 フィードあたり最大 PAGE_SIZE × MAX_PAGES 件） */
const MAX_PAGES = 500;

// ── キー計算 ──────────────────────────────────────────────────────

/** フィード URL から feedHash を計算する (sha256 の先頭 16 文字) */
export async function computeFeedHash(feedUrl: string): Promise<string> {
  return (await sha256Hex(feedUrl)).slice(0, 16);
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

export async function writeFeedMeta(
  bucket: R2Bucket,
  meta: SharedFeedMeta,
): Promise<void> {
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
    siteUrl: siteUrl ?? '',
    lastFetchedAt: null,
    fetchError: null,
    articleCount: 0,
    pageCount: 0,
    knownIds: [],
  };
  await writeFeedMeta(bucket, meta);
  return meta;
}

// ── 記事ページ読み書き ───────────────────────────────────────────

/** latest.json を読む */
export async function readLatestArticles(
  bucket: R2Bucket,
  feedHash: string,
): Promise<Article[]> {
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
  return [...articles].sort((a, b) => {
    const at = new Date(a.publishedAt ?? a.createdAt).getTime();
    const bt = new Date(b.publishedAt ?? b.createdAt).getTime();
    return bt - at;
  });
}

/**
 * overflow を pageNum ページに先頭挿入し、溢れたぶんを次ページへカスケードする。
 * overflow は pageNum ページの既存コンテンツより「新しい」記事（すでにソート済み）。
 * 戻り値: 実際に書き込んだ最大ページ番号。
 */
async function cascadeOverflow(
  bucket: R2Bucket,
  feedHash: string,
  overflow: Article[],
  pageNum: number,
): Promise<number> {
  let currentOverflow = overflow;
  let currentPage = pageNum;
  let lastWrittenPage = pageNum - 1;

  while (currentOverflow.length > 0 && currentPage <= MAX_PAGES) {
    const key = pageKey(feedHash, currentPage);
    const existing = await r2Get<Article[]>(bucket, key, []);

    // overflow (新しい) + existing (古い) を結合してソート
    const merged = sortByDate([...currentOverflow, ...existing]);

    if (merged.length <= PAGE_SIZE) {
      await r2Put(bucket, key, merged);
      lastWrittenPage = currentPage;
      break;
    }

    const page = merged.slice(0, PAGE_SIZE);
    currentOverflow = merged.slice(PAGE_SIZE);
    await r2Put(bucket, key, page);
    lastWrittenPage = currentPage;
    currentPage += 1;
  }

  return lastWrittenPage;
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

  const latest = existingLatest ?? await readLatestArticles(bucket, meta.feedHash);

  // knownIds が存在する場合はそれを重複チェックに使う（全ページ横断の既知 ID）
  // 存在しない場合は latest の ID のみでチェック（後方互換）
  const knownIdsSet =
    meta.knownIds && meta.knownIds.length > 0
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
      if (ex) {
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
    const maxPage = await cascadeOverflow(bucket, meta.feedHash, overflow, 2);
    meta.pageCount = Math.max(meta.pageCount, maxPage - 1); // pageCount は p2以降の数
  }

  // knownIds を更新（新規 ID を追加し、上限 10,000 件を超えた場合は古い順に切り詰め）
  const KNOWN_IDS_MAX = 10_000;
  const updatedKnownIds = [...(meta.knownIds ?? latest.map((a) => a.id)), ...brandNew.map((a) => a.id)];
  meta.knownIds =
    updatedKnownIds.length > KNOWN_IDS_MAX
      ? updatedKnownIds.slice(updatedKnownIds.length - KNOWN_IDS_MAX)
      : updatedKnownIds;

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
  };
}

/**
 * ユーザーの購読フィード一覧を Feed[] として取得する。
 * meta.json が存在しないフィード（孤立した購読）はスキップする。
 */
export async function getUserFeeds(bucket: R2Bucket, userId: string): Promise<Feed[]> {
  const subs = await readUserSubscriptions(bucket, userId);
  if (subs.length === 0) return [];

  const metas = await Promise.all(subs.map((s) => readFeedMeta(bucket, s.feedHash)));
  const feeds: Feed[] = [];
  for (let i = 0; i < subs.length; i++) {
    const meta = metas[i];
    if (meta) feeds.push(assembleClientFeed(meta, subs[i]));
  }
  return feeds;
}

/**
 * ユーザーの全購読フィードの latest.json を並行取得してマージ・ソートした記事一覧を返す。
 * 各フィードから最新 PAGE_SIZE 件ずつ取得する。
 */
export async function getUserLatestArticles(
  bucket: R2Bucket,
  userId: string,
): Promise<Article[]> {
  const subs = await readUserSubscriptions(bucket, userId);
  if (subs.length === 0) return [];

  const pages = await Promise.all(subs.map((s) => readLatestArticles(bucket, s.feedHash)));
  const all = pages.flat();
  const sorted = sortByDate(all);
  return sorted.slice(0, 2000);
}

/** R2 の prefix/ 直下にある ID（ディレクトリ名）を全件列挙する */
async function listPrefixedIds(bucket: R2Bucket, prefix: string): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix, delimiter: '/', cursor });
    ids.push(...listed.delimitedPrefixes.map((p: string) => p.slice(prefix.length, -1)));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return ids;
}

/** 全 feedHash を R2 の feeds/ プレフィックスから列挙する */
export async function listAllFeedHashes(bucket: R2Bucket): Promise<string[]> {
  return listPrefixedIds(bucket, 'feeds/');
}

/** 全ユーザーの subscriptions.json から feedHash → userId[] の逆引きマップを構築する */
export async function buildFeedUserMap(bucket: R2Bucket): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const userIds = await listPrefixedIds(bucket, 'users/');

  const allSubs = await Promise.all(
    userIds.map(async (uid) => ({ uid, subs: await readUserSubscriptions(bucket, uid) })),
  );
  for (const { uid, subs } of allSubs) {
    for (const s of subs) {
      const users = map.get(s.feedHash) ?? [];
      users.push(uid);
      map.set(s.feedHash, users);
    }
  }
  return map;
}
