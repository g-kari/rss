import type {
  Article,
  FeedArticleBatch,
  FeedArticleCommit,
  FeedArticleSegment,
  FeedArticleSnapshot,
  SharedFeedMeta,
} from "../types";
import { compareByDateDesc } from "./article-utils";
import { r2Put } from "./r2";
import { LegacyArticleWriteConflictError, mergeLegacyArticles } from "./shared-feed-legacy";
export { LegacyArticleWriteConflictError } from "./shared-feed-legacy";
import { KNOWN_IDS_MAX, MAX_PAGES, PAGE_SIZE } from "./shared-feed-constants";

interface ArticleHead {
  version: 2;
  revision: string;
  articles: Article[];
  segments: FeedArticleSegment[];
  nextSegmentId: number;
  knownIds: string[];
  articleLocations: Record<string, number>;
}

const LATEST_PRIORITY = -Number.MAX_SAFE_INTEGER;
const COMMIT_ATTEMPTS = 3;

function latestKey(feedHash: string): string {
  return `feeds/${feedHash}/articles/latest.json`;
}

function isHead(value: Article[] | ArticleHead): value is ArticleHead {
  if (!Array.isArray(value) && (!value || value.version !== 2)) {
    throw new Error("Invalid article object format");
  }
  return !Array.isArray(value);
}

function logicalPageCount(count: number): number {
  return Math.max(0, Math.min(MAX_PAGES, Math.ceil(count / PAGE_SIZE)) - 1);
}

function boundary(article: Article): FeedArticleSegment["newest"] {
  return { id: article.id, publishedAt: article.publishedAt, createdAt: article.createdAt };
}

function describeSegment(
  objectKey: string,
  priority: number,
  articles: Article[],
): FeedArticleSegment {
  return {
    objectKey,
    count: articles.length,
    priority,
    newest: boundary(articles[0]),
    oldest: boundary(articles[articles.length - 1]),
  };
}

/** Missing referenced data is corruption, not an empty page. */
async function readRequiredArticles(bucket: R2Bucket, objectKey: string): Promise<Article[]> {
  const object = await bucket.get(objectKey);
  if (!object) throw new Error(`Missing article object: ${objectKey}`);
  const stored = await object.json<Article[] | ArticleHead>();
  return isHead(stored) ? stored.articles : stored;
}

/** Read and validate one physical location returned by the derived search index. */
export async function readFeedArticleObject(
  bucket: R2Bucket,
  feedHash: string,
  objectKey: string,
): Promise<{ articles: Article[]; revision: string | null } | null> {
  if (!objectKey.startsWith(`feeds/${feedHash}/articles/`)) {
    throw new Error("Article object is outside the requested feed");
  }
  const object = await bucket.get(objectKey);
  if (!object) return null;
  const stored = await object.json<Article[] | ArticleHead>();
  return isHead(stored)
    ? { articles: stored.articles, revision: stored.revision }
    : { articles: stored, revision: null };
}

export async function readArticleObject(bucket: R2Bucket, objectKey: string): Promise<Article[]> {
  return readRequiredArticles(bucket, objectKey);
}

/** HEAD-only readiness check; never fetch every subscribed feed's article bodies for search. */
export async function readFeedArticleRevision(
  bucket: R2Bucket,
  feedHash: string,
  meta?: SharedFeedMeta | null,
): Promise<string> {
  const object = await bucket.head(latestKey(feedHash));
  if (!object && (meta?.articleRevision || meta?.articleCount || meta?.pageCount)) {
    throw new Error(`Missing latest article object for existing feed: ${feedHash}`);
  }
  return object?.customMetadata?.articleRevision ?? `legacy:${object?.etag ?? "missing"}`;
}

/** Repair the separately stored feed metadata after an interrupted post-head write. */
export async function repairFeedArticleMetadata(
  bucket: R2Bucket,
  meta: SharedFeedMeta,
): Promise<void> {
  const object = await bucket.head(latestKey(meta.feedHash));
  if (!object) {
    if (meta.articleRevision || meta.articleCount || meta.pageCount) {
      throw new Error(`Missing latest article object for existing feed: ${meta.feedHash}`);
    }
    return;
  }
  const revision = object.customMetadata?.articleRevision;
  if (!revision) return; // Legacy arrays do not have authoritative count metadata.
  const count = Number(object.customMetadata?.articleCount);
  const pages = Number(object.customMetadata?.pageCount);
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    !Number.isSafeInteger(pages) ||
    pages !== logicalPageCount(count)
  ) {
    throw new Error(`Invalid article head metadata for ${meta.feedHash}`);
  }
  meta.articleRevision = revision;
  meta.articleCount = count;
  meta.pageCount = pages;
  meta.oversizeAlert = count > PAGE_SIZE * MAX_PAGES;
}

/** One stable head determines the complete set of physical objects in a read. */
export async function readFeedArticleSnapshot(
  bucket: R2Bucket,
  feedHash: string,
  meta?: SharedFeedMeta | null,
): Promise<FeedArticleSnapshot> {
  const object = await bucket.get(latestKey(feedHash));
  const stored = object ? await object.json<Article[] | ArticleHead>() : [];
  if (isHead(stored)) {
    const articleCount = stored.articles.length + stored.segments.reduce((n, s) => n + s.count, 0);
    return {
      revision: stored.revision,
      latest: stored.articles,
      segments: stored.segments,
      nextSegmentId: stored.nextSegmentId,
      knownIds: stored.knownIds,
      articleLocations: stored.articleLocations,
      articleCount,
      pageCount: logicalPageCount(articleCount),
      etag: object?.etag,
      exists: object !== null,
      legacy: false,
    };
  }
  const resolvedMeta =
    meta === undefined
      ? await (await bucket.get(`feeds/${feedHash}/meta.json`))?.json<SharedFeedMeta>()
      : meta;
  if (
    !object &&
    (resolvedMeta?.articleRevision || resolvedMeta?.articleCount || resolvedMeta?.pageCount)
  ) {
    throw new Error(`Missing latest article object for existing feed: ${feedHash}`);
  }
  const segments: FeedArticleSegment[] = [];
  // pageCount counts historical files, not the highest page number.
  for (let page = 2; page <= Math.min((resolvedMeta?.pageCount ?? 0) + 1, MAX_PAGES); page++) {
    segments.push({
      objectKey: `feeds/${feedHash}/articles/p${page}.json`,
      count: PAGE_SIZE,
      priority: page,
      // Legacy descriptors are used for physical iteration only, never range pruning.
      newest: { id: "", publishedAt: null, createdAt: "" },
      oldest: { id: "", publishedAt: null, createdAt: "" },
    });
  }
  return {
    revision: `legacy:${object?.etag ?? "missing"}`,
    latest: stored,
    segments,
    nextSegmentId: 1,
    knownIds: resolvedMeta?.knownIds ?? stored.map((article) => article.id),
    articleLocations: {},
    articleCount: resolvedMeta?.articleCount ?? stored.length,
    pageCount: resolvedMeta?.pageCount ?? 0,
    etag: object?.etag,
    exists: object !== null,
    legacy: true,
  };
}

/** Streaming physical iterator for rebuilds, maintenance and legacy search fallback. */
export async function* iterateFeedArticleBatches(
  bucket: R2Bucket,
  feedHash: string,
  snapshot?: FeedArticleSnapshot,
): AsyncGenerator<FeedArticleBatch> {
  const state = snapshot ?? (await readFeedArticleSnapshot(bucket, feedHash));
  yield { objectKey: latestKey(feedHash), priority: LATEST_PRIORITY, articles: state.latest };
  for (const segment of [...state.segments].sort((a, b) => a.priority - b.priority)) {
    yield {
      objectKey: segment.objectKey,
      priority: segment.priority,
      articles: await readRequiredArticles(bucket, segment.objectKey),
    };
  }
}

/** latest.json remains one GET whether its body is a legacy array or a v2 head. */
export async function readLatestArticles(bucket: R2Bucket, feedHash: string): Promise<Article[]> {
  return (await readFeedArticleObject(bucket, feedHash, latestKey(feedHash)))?.articles ?? [];
}

interface OpenRun {
  articles: Article[];
  index: number;
}

/**
 * Merge sorted runs lazily. Date bounds avoid opening older disjoint runs. Memory holds only
 * overlapping runs, not the complete archive; ordinary chronological feeds need one run.
 */
async function* orderedArchive(
  bucket: R2Bucket,
  segments: FeedArticleSegment[],
  skip = 0,
): AsyncGenerator<Article> {
  const unopened = [...segments].sort((a, b) => compareByDateDesc(a.newest, b.newest));
  const open: OpenRun[] = [];
  let next = 0;
  while (next < unopened.length || open.length > 0) {
    open.sort((a, b) => compareByDateDesc(a.articles[a.index], b.articles[b.index]));
    if (
      next < unopened.length &&
      (open.length === 0 ||
        compareByDateDesc(unopened[next].newest, open[0].articles[open[0].index]) <= 0)
    ) {
      const segment = unopened[next++];
      // Count-only skipping keeps a normal non-overlapping archive page to O(1) object reads.
      const following = unopened[next];
      if (
        open.length === 0 &&
        skip >= segment.count &&
        (!following || compareByDateDesc(segment.oldest, following.newest) <= 0)
      ) {
        skip -= segment.count;
        continue;
      }
      const articles = await readRequiredArticles(bucket, segment.objectKey);
      if (articles.length > 0) open.push({ articles, index: 0 });
      continue;
    }
    const run = open[0];
    const article = run.articles[run.index++];
    if (skip > 0) skip--;
    else yield article;
    if (run.index === run.articles.length) open.shift();
  }
}

/** Preserve logical newest-first pages, including the historical oversized final-page contract. */
export async function readArticlePage(
  bucket: R2Bucket,
  feedHash: string,
  page: number,
): Promise<Article[]> {
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGES) return [];
  if (page === 1) return readLatestArticles(bucket, feedHash);
  const state = await readFeedArticleSnapshot(bucket, feedHash);
  if (state.legacy) {
    const object = await bucket.get(`feeds/${feedHash}/articles/p${page}.json`);
    if (!object && page <= state.pageCount + 1) {
      throw new Error(`Missing article object: feeds/${feedHash}/articles/p${page}.json`);
    }
    return object ? object.json<Article[]>() : [];
  }
  const skip = (page - 2) * PAGE_SIZE;
  const limit = page === MAX_PAGES ? Infinity : PAGE_SIZE;
  const result: Article[] = [];
  for await (const article of orderedArchive(bucket, state.segments, skip)) {
    result.push(article);
    if (result.length >= limit) break;
  }
  return result;
}

/** createdAt is retained from the stored article, and is not itself a content mutation. */
export function isArticleMutated(ex: Article, incoming: Article): boolean {
  for (const key of Object.keys(incoming) as (keyof Article)[]) {
    if (key === "createdAt" || incoming[key] === undefined) continue;
    const a = incoming[key];
    const b = ex[key];
    if (Array.isArray(a) || Array.isArray(b)) {
      if (JSON.stringify(a) !== JSON.stringify(b)) return true;
    } else if (a !== b) return true;
  }
  return false;
}

interface PreparedCommit {
  head: ArticleHead;
  brandNew: Article[];
  changedObjects: FeedArticleBatch[];
  removedObjectKeys: string[];
}

/** Build new immutable objects without changing the currently published snapshot. */
async function prepareCommit(
  bucket: R2Bucket,
  feedHash: string,
  snapshot: FeedArticleSnapshot,
  fetched: Article[],
  forceMigration = false,
): Promise<PreparedCommit | null> {
  const revision = crypto.randomUUID();
  let nextSegmentId = snapshot.nextSegmentId;
  const changedObjects: FeedArticleBatch[] = [];
  const removed = new Set<string>();
  let segments = [...snapshot.segments];
  // Duplicate IDs in the same response have one deterministic winner (last occurrence).
  const incoming = new Map(fetched.map((article) => [article.id, article]));
  const recent = new Map<string, Article>();
  for (const article of snapshot.latest) {
    // Explicit migration preserves the first physical copy, matching legacy readers/backups.
    // Routine response merging keeps its existing last-occurrence-wins behavior.
    if (!forceMigration || !recent.has(article.id)) recent.set(article.id, article);
  }
  const existing = new Map(recent);
  const touched = new Map<string, Article[]>();
  const known = new Set([...snapshot.knownIds, ...recent.keys()]);
  const locations = { ...snapshot.articleLocations };

  // Polling an unchanged latest page does not trigger a legacy migration or archive reads.
  if (
    !forceMigration &&
    [...incoming].every(([id, value]) => {
      const previous = recent.get(id);
      return previous && !isArticleMutated(previous, value);
    })
  )
    return null;

  function stageSegment(articles: Article[]): FeedArticleSegment {
    const sequence = nextSegmentId++;
    const objectKey = `feeds/${feedHash}/articles/segments/${revision}-${sequence}.json`;
    const sorted = [...articles].sort(compareByDateDesc);
    const descriptor = describeSegment(objectKey, -sequence, sorted);
    changedObjects.push({ objectKey, priority: descriptor.priority, articles: sorted });
    for (const article of sorted) {
      if (known.has(article.id) || incoming.has(article.id) || recent.has(article.id)) {
        locations[article.id] = descriptor.priority;
      }
    }
    return descriptor;
  }

  // One-time streaming migration: keep unchanged legacy objects; split an oversized old final
  // page into bounded segments and remove pre-existing cross-page duplicate IDs.
  if (snapshot.legacy) {
    const seen = new Set(recent.keys());
    const migrated: FeedArticleSegment[] = [];
    for (const segment of segments) {
      const raw = await readRequiredArticles(bucket, segment.objectKey);
      if (forceMigration) assertMigrationArticles(raw, feedHash, segment.objectKey);
      const articles = raw
        .filter((article) => {
          if (seen.has(article.id)) return false;
          seen.add(article.id);
          return true;
        })
        .sort(compareByDateDesc);
      for (const article of articles) {
        if (known.size < KNOWN_IDS_MAX) known.add(article.id);
        if (known.has(article.id)) locations[article.id] = segment.priority;
        if (incoming.has(article.id)) existing.set(article.id, article);
      }
      if (
        articles.length === raw.length &&
        articles.length <= PAGE_SIZE &&
        articles.length > 0 &&
        articles.every((article, index) => article === raw[index])
      ) {
        const descriptor = describeSegment(segment.objectKey, segment.priority, articles);
        migrated.push(descriptor);
        if (articles.some((article) => incoming.has(article.id)))
          touched.set(segment.objectKey, articles);
      } else {
        removed.add(segment.objectKey);
        for (let start = 0; start < articles.length; start += PAGE_SIZE) {
          const page = articles.slice(start, start + PAGE_SIZE);
          const descriptor = stageSegment(page);
          migrated.push(descriptor);
          if (page.some((article) => incoming.has(article.id)))
            touched.set(descriptor.objectKey, page);
        }
      }
    }
    segments = migrated;
  } else {
    // Exact bounded ID -> immutable object locator: a genuinely new ID causes zero archive GETs.
    const priorities = new Set(
      [...incoming.keys()]
        .filter((id) => !recent.has(id))
        .map((id) => snapshot.articleLocations[id])
        .filter((priority) => priority !== undefined),
    );
    for (const priority of priorities) {
      const segment = segments.find((candidate) => candidate.priority === priority);
      if (!segment) throw new Error(`Missing article location for ${feedHash}`);
      const articles = await readRequiredArticles(bucket, segment.objectKey);
      for (const article of articles) {
        if (incoming.has(article.id)) existing.set(article.id, article);
      }
      touched.set(segment.objectKey, articles);
    }
  }

  const brandNew: Article[] = [];
  const changedIds = new Set<string>();
  for (const [id, article] of incoming) {
    const previous = existing.get(id);
    if (!previous) {
      brandNew.push(article);
      recent.set(id, article);
      changedIds.add(id);
    } else if (isArticleMutated(previous, article)) {
      const definedFields = Object.fromEntries(
        Object.entries(article).filter(([, value]) => value !== undefined),
      ) as Partial<Article>;
      recent.set(id, { ...previous, ...definedFields, createdAt: previous.createdAt });
      changedIds.add(id);
    }
  }
  // Once a legacy archive had to be read, publish its migration even on unchanged content.
  // Otherwise large upstream feeds would repeat the full legacy scan on every poll forever.
  if (changedIds.size === 0 && !snapshot.legacy) return null;

  // Remove edited archive entries from their old immutable object, then consider them for latest.
  for (const [objectKey, articles] of touched) {
    if (!articles.some((article) => changedIds.has(article.id))) continue;
    segments = segments.filter((segment) => segment.objectKey !== objectKey);
    removed.add(objectKey);
    const remaining = articles.filter((article) => !changedIds.has(article.id));
    if (remaining.length > 0) segments.push(stageSegment(remaining));
  }

  let merged = [...recent.values()].sort(compareByDateDesc);
  // A publication-date edit can demote a latest article, or an archived edit can promote one.
  // Pull only archive runs whose newest item precedes the current latest cutoff.
  for (;;) {
    const threshold = merged[Math.min(PAGE_SIZE, merged.length) - 1];
    const promoted = segments.find(
      (segment) =>
        merged.length < PAGE_SIZE ||
        (threshold && compareByDateDesc(segment.newest, threshold) < 0),
    );
    if (!promoted) break;
    const staged = changedObjects.find((batch) => batch.objectKey === promoted.objectKey);
    const articles = staged?.articles ?? (await readRequiredArticles(bucket, promoted.objectKey));
    segments = segments.filter((segment) => segment.objectKey !== promoted.objectKey);
    removed.add(promoted.objectKey);
    for (const article of articles) if (!recent.has(article.id)) recent.set(article.id, article);
    merged = [...recent.values()].sort(compareByDateDesc);
  }

  const latest = merged.slice(0, PAGE_SIZE);
  let overflow = merged.slice(PAGE_SIZE);
  // Coalesce only one underfilled immutable archive head. No historical cascade is possible.
  if (overflow.length > 0) {
    const partial = segments
      .filter((segment) => segment.count < PAGE_SIZE)
      .sort((a, b) => a.priority - b.priority)[0];
    if (partial) {
      const staged = changedObjects.find((batch) => batch.objectKey === partial.objectKey);
      const articles = staged?.articles ?? (await readRequiredArticles(bucket, partial.objectKey));
      overflow = [...overflow, ...articles].sort(compareByDateDesc);
      segments = segments.filter((segment) => segment.objectKey !== partial.objectKey);
      removed.add(partial.objectKey);
    }
    for (let start = 0; start < overflow.length; start += PAGE_SIZE) {
      segments.push(stageSegment(overflow.slice(start, start + PAGE_SIZE)));
    }
  }
  const active = new Set(segments.map((segment) => segment.objectKey));
  const latestIds = new Set(latest.map((article) => article.id));
  const incomingIds = new Set(incoming.keys());
  const knownIds = [
    ...[...known].filter((id) => !latestIds.has(id) && !incomingIds.has(id)),
    ...[...incomingIds].filter((id) => !latestIds.has(id)),
    ...latestIds,
  ].slice(-KNOWN_IDS_MAX);
  const articleLocations: Record<string, number> = {};
  for (const id of knownIds) {
    if (!latestIds.has(id) && locations[id] !== undefined) articleLocations[id] = locations[id];
  }
  return {
    head: {
      version: 2,
      revision,
      articles: latest,
      segments,
      nextSegmentId,
      knownIds,
      articleLocations,
    },
    brandNew,
    changedObjects: changedObjects.filter((batch) => active.has(batch.objectKey)),
    removedObjectKeys: [...removed].filter((key) =>
      snapshot.segments.some((s) => s.objectKey === key),
    ),
  };
}

/** Reconcile only article-derived metadata; upstream fetch state is unrelated to migration. */
function applyArticleSnapshotMetadata(meta: SharedFeedMeta, snapshot: FeedArticleSnapshot): void {
  meta.articleRevision = snapshot.revision;
  meta.articleCount = snapshot.articleCount;
  meta.pageCount = snapshot.pageCount;
  meta.knownIds = snapshot.knownIds;
  meta.oversizeAlert = snapshot.articleCount > PAGE_SIZE * MAX_PAGES;
}

/** Both routine updates and explicit migration publish through this one atomic commit path. */
async function publishPreparedCommit(
  bucket: R2Bucket,
  meta: SharedFeedMeta,
  snapshot: FeedArticleSnapshot,
  prepared: PreparedCommit,
): Promise<FeedArticleCommit | null> {
  for (const batch of prepared.changedObjects) await r2Put(bucket, batch.objectKey, batch.articles);
  const onlyIf = snapshot.exists
    ? snapshot.etag
      ? { etagMatches: snapshot.etag }
      : undefined
    : new Headers({ "If-None-Match": "*" });
  const count =
    prepared.head.articles.length + prepared.head.segments.reduce((n, s) => n + s.count, 0);
  const result = await bucket.put(latestKey(meta.feedHash), JSON.stringify(prepared.head), {
    onlyIf,
    httpMetadata: { contentType: "application/json" },
    customMetadata: {
      articleRevision: prepared.head.revision,
      articleCount: String(count),
      pageCount: String(logicalPageCount(count)),
    },
  });
  if (result === null) return null;
  applyArticleSnapshotMetadata(meta, {
    ...snapshot,
    revision: prepared.head.revision,
    articleCount: count,
    pageCount: logicalPageCount(count),
    knownIds: prepared.head.knownIds,
  });
  return {
    revision: prepared.head.revision,
    previousRevision: snapshot.revision,
    changedObjects: [
      ...prepared.changedObjects,
      {
        objectKey: latestKey(meta.feedHash),
        priority: LATEST_PRIORITY,
        articles: prepared.head.articles,
      },
    ],
    removedObjectKeys: prepared.removedObjectKeys,
    requiresRebuild: snapshot.legacy,
  };
}

/**
 * V2 segment PUTs precede the conditional head commit. Failure leaves the previous snapshot
 * readable; concurrent writers retry against the winner. Opting out of legacy migration uses
 * the original array/pN compatibility writer only while the actual head remains legacy.
 */
export async function mergeNewArticlesWithChanges(
  bucket: R2Bucket,
  meta: SharedFeedMeta,
  fetchedArticles: Article[],
  _existingLatest: Article[],
  options: { allowLegacyMigration?: boolean; maintainSearchIndex?: boolean } = {},
): Promise<{ newArticles: Article[]; commit?: FeedArticleCommit }> {
  if (fetchedArticles.length === 0) return { newArticles: [] };
  for (let attempt = 0; attempt < COMMIT_ATTEMPTS; attempt++) {
    const snapshot = await readFeedArticleSnapshot(bucket, meta.feedHash, meta);
    // Inspect the actual object, not stale meta.articleRevision or the caller's cached latest.
    // Existing v2 heads always stay on the v2 path, even when new migrations are disabled.
    if (options.allowLegacyMigration === false && snapshot.legacy) {
      const attemptMeta = { ...meta, knownIds: meta.knownIds?.slice() };
      let nextRevision = snapshot.revision;
      const legacy = await mergeLegacyArticles(
        bucket,
        attemptMeta,
        fetchedArticles,
        snapshot.latest,
        async (latest) => {
          if (snapshot.exists && !snapshot.etag) {
            throw new Error(`Missing legacy article head ETag: ${meta.feedHash}`);
          }
          const result = await bucket.put(latestKey(meta.feedHash), JSON.stringify(latest), {
            onlyIf: snapshot.exists
              ? { etagMatches: snapshot.etag }
              : new Headers({ "If-None-Match": "*" }),
            httpMetadata: { contentType: "application/json" },
          });
          if (result === null) throw new LegacyArticleWriteConflictError(meta.feedHash);
          if (result.etag) nextRevision = `legacy:${result.etag}`;
        },
      );
      delete attemptMeta.articleRevision;
      Object.assign(meta, attemptMeta);
      delete meta.articleRevision;
      if (options.maintainSearchIndex) {
        await syncR2SearchIndex(bucket, meta, snapshot.revision, nextRevision, legacy.indexUpserts);
      }
      return { newArticles: legacy.newArticles };
    }
    const prepared = await prepareCommit(bucket, meta.feedHash, snapshot, fetchedArticles);
    if (!prepared) {
      if (!snapshot.legacy) applyArticleSnapshotMetadata(meta, snapshot);
      return { newArticles: [] };
    }
    const commit = await publishPreparedCommit(bucket, meta, snapshot, prepared);
    if (commit) {
      if (options.maintainSearchIndex) {
        await syncR2SearchIndex(
          bucket,
          meta,
          snapshot.revision,
          commit.revision,
          commit.changedObjects.flatMap((batch) => batch.articles),
        );
      }
      return { newArticles: prepared.brandNew, commit };
    }
  }
  throw new Error(`Article head changed concurrently for ${meta.feedHash}; retry the fetch`);
}

/** Validate existing data before explicit conversion; never substitute a fabricated article. */
function assertMigrationArticles(articles: Article[], feedHash: string, objectKey: string): void {
  const fields = ["id", "feedHash", "guid", "title", "link", "summary", "createdAt"] as const;
  if (
    !Array.isArray(articles) ||
    articles.some(
      (article) =>
        !article ||
        typeof article !== "object" ||
        fields.some((field) => typeof article[field] !== "string") ||
        !article.id ||
        article.feedHash !== feedHash ||
        (article.publishedAt !== null && typeof article.publishedAt !== "string") ||
        [article.content, article.ogImage, article.author].some(
          (value) => value !== undefined && typeof value !== "string",
        ) ||
        (article.categories !== undefined &&
          (!Array.isArray(article.categories) ||
            article.categories.some((value) => typeof value !== "string"))) ||
        (article.metadata !== undefined &&
          (!Array.isArray(article.metadata) ||
            article.metadata.some(
              (value) => !value || typeof value.key !== "string" || typeof value.value !== "string",
            ))),
    )
  )
    throw new Error(`Invalid article source: ${objectKey}`);
}

/**
 * Explicit R2-only conversion for a paused-writer rollout. No upstream fetch or D1 operation is
 * performed. The caller persists the repaired meta.json and rebuilds D1 only after this succeeds.
 * Repeating a successful conversion is a no-op, including after a metadata-write interruption.
 */
export async function migrateFeedArticleStorage(
  bucket: R2Bucket,
  meta: SharedFeedMeta,
): Promise<{ migrated: boolean; commit?: FeedArticleCommit }> {
  for (let attempt = 0; attempt < COMMIT_ATTEMPTS; attempt++) {
    const snapshot = await readFeedArticleSnapshot(bucket, meta.feedHash, meta);
    if (!snapshot.exists)
      throw new Error(`Missing article migration source: ${latestKey(meta.feedHash)}`);
    if (!snapshot.etag) throw new Error(`Missing article migration source ETag: ${meta.feedHash}`);
    assertMigrationArticles(snapshot.latest, meta.feedHash, latestKey(meta.feedHash));
    if (!snapshot.legacy) {
      if (
        !Array.isArray(snapshot.knownIds) ||
        snapshot.knownIds.length > KNOWN_IDS_MAX ||
        snapshot.knownIds.some((id) => typeof id !== "string") ||
        !snapshot.articleLocations ||
        typeof snapshot.articleLocations !== "object" ||
        Array.isArray(snapshot.articleLocations) ||
        !Number.isSafeInteger(snapshot.nextSegmentId) ||
        snapshot.nextSegmentId < 1 ||
        snapshot.nextSegmentId >= Number.MAX_SAFE_INTEGER ||
        snapshot.latest.length > PAGE_SIZE ||
        !Number.isSafeInteger(snapshot.articleCount) ||
        snapshot.articleCount < 0 ||
        typeof snapshot.revision !== "string" ||
        !snapshot.revision ||
        snapshot.segments.some(
          (segment) =>
            !segment.objectKey.startsWith(`feeds/${meta.feedHash}/articles/`) ||
            segment.objectKey === latestKey(meta.feedHash) ||
            !Number.isSafeInteger(segment.priority) ||
            (segment.priority < 0
              ? -segment.priority >= snapshot.nextSegmentId
              : segment.priority < 2 || segment.priority > MAX_PAGES) ||
            !Number.isSafeInteger(segment.count) ||
            segment.count < 1 ||
            segment.count > PAGE_SIZE,
        )
      )
        throw new Error(`Invalid article migration head: ${meta.feedHash}`);
      const objectKeys = new Set(snapshot.segments.map((segment) => segment.objectKey));
      const priorities = new Set(snapshot.segments.map((segment) => segment.priority));
      const knownIds = new Set(snapshot.knownIds);
      const latestIds = new Set(snapshot.latest.map((article) => article.id));
      if (
        objectKeys.size !== snapshot.segments.length ||
        priorities.size !== snapshot.segments.length ||
        Object.entries(snapshot.articleLocations).some(
          ([id, priority]) =>
            !Number.isSafeInteger(priority) ||
            !priorities.has(priority) ||
            !knownIds.has(id) ||
            latestIds.has(id),
        )
      )
        throw new Error(`Invalid article migration head: ${meta.feedHash}`);
      applyArticleSnapshotMetadata(meta, snapshot);
      return { migrated: false };
    }
    if (!Number.isInteger(meta.pageCount) || meta.pageCount < 0 || meta.pageCount >= MAX_PAGES) {
      throw new Error(`Invalid legacy article page count: ${meta.feedHash}`);
    }
    const prepared = await prepareCommit(bucket, meta.feedHash, snapshot, [], true);
    if (!prepared) throw new Error(`Unable to prepare article migration for ${meta.feedHash}`);
    const commit = await publishPreparedCommit(bucket, meta, snapshot, prepared);
    if (commit) return { migrated: true, commit };
  }
  throw new Error(`Article head changed concurrently for ${meta.feedHash}; retry the migration`);
}

/** Index maintenance never rolls back a committed article head. */
async function syncR2SearchIndex(
  bucket: R2Bucket,
  meta: SharedFeedMeta,
  previousRevision: string,
  nextRevision: string,
  upserts: Article[],
): Promise<void> {
  try {
    const { syncFeedR2SearchIndex } = await import("./article-search-r2");
    await syncFeedR2SearchIndex(
      bucket,
      meta.feedHash,
      previousRevision,
      nextRevision,
      upserts,
      meta,
    );
  } catch (error) {
    console.error("R2 article search index update failed", { feedHash: meta.feedHash, error });
  }
}

/** Backward-compatible caller API, with an optional post-commit derived-index callback. */
export async function mergeNewArticles(
  bucket: R2Bucket,
  meta: SharedFeedMeta,
  fetchedArticles: Article[],
  existingLatest: Article[],
  onCommit?: (change: FeedArticleCommit) => Promise<void>,
): Promise<Article[]> {
  const result = await mergeNewArticlesWithChanges(bucket, meta, fetchedArticles, existingLatest);
  if (result.commit && onCommit) await onCommit(result.commit);
  return result.newArticles;
}
