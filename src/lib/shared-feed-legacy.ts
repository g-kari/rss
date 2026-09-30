/**
 * Rollout compatibility writer restored from 86137b2's shared-feed.ts.
 * Keep the original legacy array/pN merge semantics until explicit migration is enabled.
 * The caller supplies an ETag-guarded latest write to prevent a concurrent v2 downgrade.
 * Archive writes retain the legacy cascade behavior; this is not the v2 performance path.
 */
import type { Article, SharedFeedMeta } from "../types";
import { compareByDateDesc } from "./article-utils";
import { r2Get, r2Put } from "./r2";
import { KNOWN_IDS_MAX, MAX_PAGES, PAGE_SIZE } from "./shared-feed-constants";

/** Callers must skip metadata/index writes: the winning legacy cascade may still be in flight. */
export class LegacyArticleWriteConflictError extends Error {
  constructor(feedHash: string) {
    super(
      `Legacy article head changed concurrently for ${feedHash}; retry after the active writer finishes`,
    );
    this.name = "LegacyArticleWriteConflictError";
  }
}

function pageKey(feedHash: string, page: number): string {
  return `feeds/${feedHash}/articles/p${page}.json`;
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
async function cascadeLegacyOverflow(
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
function isLegacyArticleMutated(ex: Article, incoming: Article): boolean {
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
export async function mergeLegacyArticles(
  bucket: R2Bucket,
  meta: SharedFeedMeta,
  fetchedArticles: Article[],
  existingLatest: Article[],
  writeLatest: (articles: Article[]) => Promise<void>,
): Promise<Article[]> {
  if (fetchedArticles.length === 0) return [];

  const latest = deduplicateById(existingLatest);
  const duplicateLatestCount = existingLatest.length - latest.length;
  // Metadata can lag the object we just read. The actual latest IDs are always authoritative.
  const knownIdsSet = new Set(meta.knownIds ?? []);
  for (const article of latest) knownIdsSet.add(article.id);
  // One notification and one stored copy per response ID; the final response occurrence wins.
  const uniqueFetched = [
    ...new Map(fetchedArticles.map((article) => [article.id, article])).values(),
  ];
  const brandNew = uniqueFetched.filter((article) => !knownIdsSet.has(article.id));

  if (brandNew.length === 0) {
    // タイトル・サマリー等の更新のみ（ID は同じ）
    const existingMap = new Map<string, Article>();
    for (const article of latest) existingMap.set(article.id, article);
    let changed = duplicateLatestCount > 0;
    for (const a of uniqueFetched) {
      const ex = existingMap.get(a.id);
      if (ex && isLegacyArticleMutated(ex, a)) {
        // createdAt は保持して他フィールドを上書き
        existingMap.set(a.id, { ...ex, ...a, createdAt: ex.createdAt });
        changed = true;
      }
    }
    if (changed) {
      await writeLatest(sortByDate([...existingMap.values()]));
      meta.articleCount = Math.max(0, (meta.articleCount ?? 0) - duplicateLatestCount);
    }
    return [];
  }

  // latest + 新規記事をマージしてソート
  const merged = sortByDate(deduplicateById([...latest, ...brandNew]));

  if (merged.length <= PAGE_SIZE) {
    await writeLatest(merged);
  } else {
    const newLatest = merged.slice(0, PAGE_SIZE);
    const overflow = merged.slice(PAGE_SIZE);
    await writeLatest(newLatest);
    const { lastWrittenPage: maxPage, oversized } = await cascadeLegacyOverflow(
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
  const latestPageIds = new Set<string>();
  for (let i = 0; i < merged.length && i < PAGE_SIZE; i++) {
    latestPageIds.add(merged[i].id);
  }
  let prevKnown: string[];
  if (meta.knownIds) {
    prevKnown = meta.knownIds;
  } else {
    prevKnown = [];
    for (const article of latest) prevKnown.push(article.id);
  }
  const historical = prevKnown.filter((id) => !latestPageIds.has(id));
  const overflowNewIds: string[] = [];
  for (const article of brandNew) {
    if (!latestPageIds.has(article.id)) overflowNewIds.push(article.id);
  }
  meta.knownIds = [...historical, ...overflowNewIds, ...latestPageIds].slice(-KNOWN_IDS_MAX);

  meta.articleCount =
    Math.max(0, (meta.articleCount ?? 0) - duplicateLatestCount) + brandNew.length;
  return brandNew;
}
