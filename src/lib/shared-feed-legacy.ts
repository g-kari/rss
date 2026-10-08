/**
 * Rollout compatibility writer restored from 86137b2's shared-feed.ts.
 * Keep latest.json as an Article[] until explicit v2 migration is enabled.
 * The caller supplies an ETag-guarded latest write to prevent a concurrent v2 downgrade.
 * Overflow is appended in O(1) objects. Frozen pN pages are never rewritten.
 */
import type { Article, FeedArticleSegment, SharedFeedMeta } from "../types";
import { compareByDateDesc } from "./article-utils";
import { r2Put } from "./r2";
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

export function overflowManifestKey(feedHash: string): string {
  return `feeds/${feedHash}/articles/overflow-manifest.json`;
}

export function overflowPendingKey(feedHash: string): string {
  return `feeds/${feedHash}/articles/overflow-pending.json`;
}

const EMPTY_BOUND: FeedArticleSegment["newest"] = { id: "", publishedAt: null, createdAt: "" };

/** Commit record for the append-only legacy archive. Readers trust this over meta.pageCount. */
export interface LegacyOverflowManifest {
  version: 1;
  pendingCount: number;
  sealed: Array<{ objectKey: string; count: number }>;
  nextSeal: number;
  /** Historical pN files that existed before the first spill. Middle pages are full. */
  legacyPageCount: number;
  /** Length of p{legacyPageCount+1}. May exceed PAGE_SIZE when that page was already oversized. */
  legacyTailCount: number;
}

export function legacyArchiveCount(manifest: LegacyOverflowManifest): number {
  const legacy =
    manifest.legacyPageCount === 0
      ? 0
      : (manifest.legacyPageCount - 1) * PAGE_SIZE + manifest.legacyTailCount;
  return (
    manifest.pendingCount +
    manifest.sealed.reduce((sum, segment) => sum + segment.count, 0) +
    legacy
  );
}

export function spillLogicalPageCount(archiveCount: number): number {
  if (archiveCount <= 0) return 0;
  return Math.min(MAX_PAGES - 1, Math.ceil(archiveCount / PAGE_SIZE));
}

function spillObjectKey(feedHash: string, seal: number): string {
  return `feeds/${feedHash}/articles/segments/spill-${seal}.json`;
}

function assertManifest(value: unknown, feedHash: string): LegacyOverflowManifest {
  if (!value || typeof value !== "object") {
    throw new Error(`Invalid overflow manifest: ${feedHash}`);
  }
  const manifest = value as LegacyOverflowManifest;
  const prefix = `feeds/${feedHash}/articles/segments/spill-`;
  const sealed = manifest.sealed;
  if (
    manifest.version !== 1 ||
    !Number.isSafeInteger(manifest.pendingCount) ||
    manifest.pendingCount < 0 ||
    manifest.pendingCount >= PAGE_SIZE ||
    !Number.isSafeInteger(manifest.nextSeal) ||
    manifest.nextSeal < 0 ||
    !Number.isSafeInteger(manifest.legacyPageCount) ||
    manifest.legacyPageCount < 0 ||
    manifest.legacyPageCount >= MAX_PAGES ||
    !Number.isSafeInteger(manifest.legacyTailCount) ||
    manifest.legacyTailCount < 0 ||
    (manifest.legacyPageCount === 0
      ? manifest.legacyTailCount !== 0
      : manifest.legacyTailCount < 1) ||
    !Array.isArray(sealed) ||
    sealed.length > manifest.nextSeal ||
    sealed.some(
      (segment) =>
        !segment ||
        typeof segment.objectKey !== "string" ||
        !segment.objectKey.startsWith(prefix) ||
        !/^spill-\d+\.json$/.test(segment.objectKey.slice(prefix.length - "spill-".length)) ||
        !Number.isSafeInteger(segment.count) ||
        segment.count < 1 ||
        segment.count > PAGE_SIZE,
    )
  ) {
    throw new Error(`Invalid overflow manifest: ${feedHash}`);
  }
  return manifest;
}

async function readJsonArray(
  bucket: R2Bucket,
  key: string,
  missing: "throw" | "empty",
): Promise<Article[] | null> {
  const object = await bucket.get(key);
  if (!object) {
    if (missing === "empty") return null;
    throw new Error(`Missing article object: ${key}`);
  }
  const stored = await object.json<unknown>();
  if (!Array.isArray(stored)) throw new Error(`Invalid article object: ${key}`);
  return stored as Article[];
}

/** Null when this feed still uses untouched pN pages. Corrupt manifests throw. */
export async function readLegacyOverflowLayout(
  bucket: R2Bucket,
  feedHash: string,
): Promise<{
  segments: FeedArticleSegment[];
  archiveCount: number;
  pageCount: number;
  nextSegmentId: number;
} | null> {
  const object = await bucket.get(overflowManifestKey(feedHash));
  if (!object) return null;
  const manifest = assertManifest(await object.json<unknown>(), feedHash);
  const segments: FeedArticleSegment[] = [];
  const newestPieces = (manifest.pendingCount > 0 ? 1 : 0) + manifest.sealed.length;
  let priority = -newestPieces;
  if (manifest.pendingCount > 0) {
    segments.push({
      objectKey: overflowPendingKey(feedHash),
      count: manifest.pendingCount,
      priority: priority++,
      newest: EMPTY_BOUND,
      oldest: EMPTY_BOUND,
    });
  }
  for (const sealed of manifest.sealed) {
    segments.push({
      objectKey: sealed.objectKey,
      count: sealed.count,
      priority: priority++,
      newest: EMPTY_BOUND,
      oldest: EMPTY_BOUND,
    });
  }
  for (let page = 2; page <= manifest.legacyPageCount + 1; page++) {
    segments.push({
      objectKey: pageKey(feedHash, page),
      count: page === manifest.legacyPageCount + 1 ? manifest.legacyTailCount : PAGE_SIZE,
      priority: page,
      newest: EMPTY_BOUND,
      oldest: EMPTY_BOUND,
    });
  }
  const archiveCount = legacyArchiveCount(manifest);
  return {
    segments,
    archiveCount,
    pageCount: spillLogicalPageCount(archiveCount),
    nextSegmentId: newestPieces + 1,
  };
}

/**
 * Persist overflow after latest.json has been committed.
 * A crash before the manifest write matches the old cascade window: latest can move before
 * the archive commit. Existing pN objects are not rewritten, so a rollback can still read them.
 */
async function appendLegacyOverflow(
  bucket: R2Bucket,
  meta: SharedFeedMeta,
  overflow: Article[],
): Promise<void> {
  const manifestKey = overflowManifestKey(meta.feedHash);
  const pendingKey = overflowPendingKey(meta.feedHash);
  const existing = await bucket.get(manifestKey);
  let manifest: LegacyOverflowManifest;
  if (existing) {
    manifest = assertManifest(await existing.json<unknown>(), meta.feedHash);
  } else {
    const legacyPageCount = meta.pageCount ?? 0;
    if (
      !Number.isSafeInteger(legacyPageCount) ||
      legacyPageCount < 0 ||
      legacyPageCount >= MAX_PAGES
    ) {
      throw new Error(`Invalid legacy page count for ${meta.feedHash}`);
    }
    let legacyTailCount = 0;
    if (legacyPageCount > 0) {
      const tail = await readJsonArray(
        bucket,
        pageKey(meta.feedHash, legacyPageCount + 1),
        "throw",
      );
      legacyTailCount = tail?.length ?? 0;
      if (legacyTailCount < 1) {
        throw new Error(`Invalid legacy tail for ${meta.feedHash}`);
      }
    }
    manifest = {
      version: 1,
      pendingCount: 0,
      sealed: [],
      nextSeal: 0,
      legacyPageCount,
      legacyTailCount,
    };
  }

  let carried: Article[] = [];
  if (existing) {
    if (manifest.pendingCount > 0) {
      const pending = await readJsonArray(bucket, pendingKey, "throw");
      if (pending?.length !== manifest.pendingCount) {
        throw new Error(`Invalid overflow pending page: ${meta.feedHash}`);
      }
      carried = pending ?? [];
    }
  } else {
    // No manifest yet: a pending object is an uncommitted first spill, not a sealed leftover.
    carried = (await readJsonArray(bucket, pendingKey, "empty")) ?? [];
  }
  // Newer overflow wins.
  const combined = deduplicateById([...overflow, ...carried]);
  const keep = combined.length % PAGE_SIZE;
  const pendingArticles = combined.slice(0, keep);
  const toSeal = combined.slice(keep);
  const sealedNow: LegacyOverflowManifest["sealed"] = [];
  for (let start = 0; start < toSeal.length; start += PAGE_SIZE) {
    const chunk = toSeal.slice(start, start + PAGE_SIZE);
    const objectKey = spillObjectKey(meta.feedHash, manifest.nextSeal++);
    await r2Put(bucket, objectKey, chunk);
    sealedNow.push({ objectKey, count: chunk.length });
  }
  manifest.sealed = [...sealedNow, ...manifest.sealed];
  manifest.pendingCount = pendingArticles.length;
  if (pendingArticles.length > 0) await r2Put(bucket, pendingKey, pendingArticles);
  await r2Put(bucket, manifestKey, manifest);

  const archiveCount = legacyArchiveCount(manifest);
  meta.pageCount = spillLogicalPageCount(archiveCount);
  if (archiveCount > (MAX_PAGES - 1) * PAGE_SIZE) meta.oversizeAlert = true;
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
    await appendLegacyOverflow(bucket, meta, overflow);
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
