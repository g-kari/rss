/** Rebuildable D1 search projection. Only the selected top-K objects are read from R2. */
import type {
  Article,
  FeedArticleBatch,
  FeedArticleCommit,
  ReadState,
  SharedFeedMeta,
  UserSubscription,
} from "../types";
import { compareByDateDesc, getArticleTimestamp } from "./article-utils";
import { pMap } from "./concurrency";
import {
  compileSearchQuery,
  defaultHaystack,
  fieldHaystack,
  parseSearchQuery,
  type SearchContext,
  type SearchField,
  type SearchNode,
} from "./full-text-search";
import {
  iterateFeedArticleBatches,
  MAX_USER_ARTICLES,
  readFeedArticleObject,
  readFeedArticleRevision,
  readFeedArticleSnapshot,
  readFeedMeta,
} from "./shared-feed";

export const SEARCH_R2_CONCURRENCY = 4;
const INDEX_BATCH_SIZE = 20;
const INDEX_BATCH_BYTES = 256 * 1024;
const MAX_INDEX_ROW_BYTES = 1_900_000;
const MAX_REBUILD_STEP_ARTICLES = 200;
const EMPTY_CONTEXT: SearchContext = { feedTitleByHash: new Map() };
const STATIC_FIELDS: SearchField[] = [
  "title",
  "author",
  "category",
  "summary",
  "content",
  "url",
  "guid",
  "published",
  "language",
  "metadata",
];

interface FeedIndexState {
  source_revision: string;
  status: string;
  token: string;
  mode: string;
  next_object: number;
  next_article: number;
  indexed_articles: number;
}
export interface SearchFeedSource {
  feedHash: string;
  title: string;
  revision: string;
}
interface SearchHit {
  article_id: string | null;
  feed_hash: string | null;
  object_key: string | null;
  sort_key: string | null;
  ready: number;
}
export class SearchIndexUnavailableError extends Error {
  constructor(message = "Article search index is not ready") {
    super(message);
    this.name = "SearchIndexUnavailableError";
  }
}

export class SearchIndexBudgetExceededError extends SearchIndexUnavailableError {
  constructor() {
    super("Search index maintenance query budget exhausted");
    this.name = "SearchIndexBudgetExceededError";
  }
}

export interface SearchIndexBudget {
  readonly remaining: number;
  readonly used: number;
  charge(count?: number): void;
}

/** Share one budget across every feed in the same cron/refresh invocation. */
export function createSearchIndexBudget(maxQueries = 800): SearchIndexBudget {
  const limit = Number.isFinite(maxQueries) ? Math.max(0, Math.floor(maxQueries)) : 800;
  let used = 0;
  return {
    get remaining() {
      return limit - used;
    },
    get used() {
      return used;
    },
    charge(count = 1) {
      if (used + count > limit) throw new SearchIndexBudgetExceededError();
      used += count;
    },
  };
}

/** Count executed D1 statements, not prepare/bind calls; batch is charged once per statement. */
export function withSearchIndexBudget(db: D1Database, budget: SearchIndexBudget): D1Database {
  const originals = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  function wrap(statement: D1PreparedStatement): D1PreparedStatement {
    const wrapped = new Proxy(statement, {
      get(target, property) {
        if (property === "bind") return (...values: unknown[]) => wrap(target.bind(...values));
        const value: unknown = Reflect.get(target, property, target);
        if (
          property === "run" ||
          property === "first" ||
          property === "all" ||
          property === "raw"
        ) {
          return (...args: unknown[]) => {
            budget.charge();
            return Reflect.apply(value as (...args: unknown[]) => unknown, target, args);
          };
        }
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    originals.set(wrapped, statement);
    return wrapped;
  }
  return new Proxy(db, {
    get(target, property) {
      if (property === "prepare") return (sql: string) => wrap(target.prepare(sql));
      if (property === "batch")
        return (statements: D1PreparedStatement[]) => {
          budget.charge(statements.length);
          return target.batch(statements.map((statement) => originals.get(statement) ?? statement));
        };
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** Reuse the evaluator's normalization, including HTML/content and metadata semantics. */
export function normalizeSearchArticle(article: Article): {
  fields: string;
  searchText: string;
  sortKey: string;
} {
  const fields: Record<string, string> = {};
  for (const field of STATIC_FIELDS) fields[field] = fieldHaystack(article, field, EMPTY_CONTEXT);
  return {
    fields: JSON.stringify(fields),
    // Keeping each full field contiguous guarantees the FTS candidate is a superset.
    searchText: [
      defaultHaystack(article, EMPTY_CONTEXT),
      ...["url", "guid", "published", "language", "metadata"].map((field) => fields[field]),
    ].join("\u0000"),
    sortKey: getArticleTimestamp(article),
  };
}

/** Parameter count stays five regardless of subscription/tag/query sizes (D1 limit: 100). */
export function buildIndexedSearchQuery(
  query: string,
  sources: SearchFeedSource[],
  tags: Readonly<Record<string, readonly string[]>>,
  savedIds: string[],
  limit: number,
): { sql: string; params: [string, string, string, string, number] } | null {
  const ast = parseSearchQuery(query);
  if (!ast) return null;
  const terms: Array<{ value: string; fts: string }> = [];
  function compile(node: SearchNode): string {
    if (node.kind === "NOT") return `(NOT ${compile(node.child)})`;
    if (node.kind === "AND" || node.kind === "OR")
      return `(${node.children.map(compile).join(` ${node.kind} `)})`;
    const value = node.value.toLowerCase();
    const index = terms.push({ value, fts: `"${value.replaceAll('"', '""')}"` }) - 1;
    const needle = `json_extract(?1, '$[${index}].value')`;
    let haystack: string;
    if (node.field === "feed") haystack = "s.title";
    else if (node.field === "tag")
      haystack = "COALESCE((SELECT value FROM json_each(?3) WHERE key = a.article_id), '')";
    else if (node.field) haystack = `json_extract(a.fields, '$.${node.field}')`;
    else
      haystack = `(${["title", "summary", "author", "category", "content"]
        .map((field) => `json_extract(a.fields, '$.${field}')`)
        .join(" || ' ' || char(1) || ' ' || ")} || ' ' || char(1) || ' ' || s.title)`;
    const exact = `instr(${haystack}, ${needle}) > 0`;
    // FTS is only a candidate filter. Short terms, NULs and cross-field separators
    // use exact SQL; never fall back to scanning articles in R2.
    if (
      node.field === "feed" ||
      node.field === "tag" ||
      [...value].length < 3 ||
      value.includes("\u0000") ||
      value.includes("\u0001")
    )
      return `(${exact})`;
    const fts = `a.id IN (SELECT rowid FROM article_search_fts WHERE article_search_fts MATCH json_extract(?1, '$[${index}].fts'))`;
    const candidates = node.field ? fts : `(${fts} OR instr(s.title, ${needle}) > 0)`;
    return `(${candidates} AND ${exact})`;
  }
  const predicate = compile(ast);
  const normalizedTags = Object.fromEntries(
    Object.entries(tags).map(([id, values]) => [id, values.join(" ").toLowerCase()]),
  );
  const requested = sources.map((s) => ({ ...s, title: s.title.toLowerCase() }));
  return {
    sql: `WITH requested AS (
      SELECT CAST(key AS INTEGER) AS position, json_extract(value, '$.feedHash') AS feed_hash,
        json_extract(value, '$.title') AS title, json_extract(value, '$.revision') AS revision
      FROM json_each(?2)
    ), invalid AS (
      SELECT 1 FROM requested s LEFT JOIN article_search_feeds f ON f.feed_hash = s.feed_hash
      WHERE f.feed_hash IS NULL OR f.status != 'ready' OR f.source_revision != s.revision
    ), hits AS (
      SELECT a.article_id, a.feed_hash, a.object_key, a.sort_key, 1 AS ready
      FROM article_search_articles a JOIN requested s ON s.feed_hash = a.feed_hash
      WHERE NOT EXISTS (SELECT 1 FROM invalid)
        AND a.article_id NOT IN (SELECT value FROM json_each(?4))
        AND NOT EXISTS (
          SELECT 1 FROM article_search_articles d JOIN requested ds ON ds.feed_hash = d.feed_hash
          WHERE d.article_id = a.article_id AND (
            ds.position < s.position OR (ds.position = s.position AND (
              d.priority < a.priority OR (d.priority = a.priority AND (
                d.object_key < a.object_key OR (d.object_key = a.object_key AND d.ordinal < a.ordinal)
              ))
            ))
          )
        )
        AND ${predicate}
      ORDER BY a.sort_key DESC, a.article_id ASC LIMIT ?5
    )
    SELECT * FROM hits
    UNION ALL SELECT NULL, NULL, NULL, NULL, 0 WHERE EXISTS (SELECT 1 FROM invalid)`,
    params: [
      JSON.stringify(terms),
      JSON.stringify(requested),
      JSON.stringify(normalizedTags),
      JSON.stringify(savedIds),
      limit,
    ],
  };
}

async function getState(db: D1Database, feedHash: string): Promise<FeedIndexState | null> {
  return db
    .prepare(
      "SELECT source_revision, status, token, mode, next_object, next_article, indexed_articles FROM article_search_feeds WHERE feed_hash = ?",
    )
    .bind(feedHash)
    .first<FeedIndexState>();
}

function ownsToken(db: D1Database, feedHash: string, token: string): D1PreparedStatement {
  return db
    .prepare(
      "SELECT token FROM article_search_feeds WHERE feed_hash = ? AND token = ? AND status = 'building'",
    )
    .bind(feedHash, token);
}

async function assertOwner(db: D1Database, feedHash: string, token: string): Promise<void> {
  if (!(await ownsToken(db, feedHash, token).first()))
    throw new SearchIndexUnavailableError("Search indexing was superseded");
}

async function writeBatch(
  db: D1Database,
  feedHash: string,
  token: string,
  batch: FeedArticleBatch,
  ordinalOffset = 0,
): Promise<void> {
  const seen = new Set<string>();
  let rows: string[] = [];
  let bytes = 2;
  const encoder = new TextEncoder();
  async function flush(): Promise<void> {
    if (!rows.length) return;
    // One constant-size statement per bounded JSON chunk, rather than one subrequest
    // per article. OR IGNORE makes a checkpoint retry idempotent, keeping the first ID.
    await db
      .prepare(`INSERT OR IGNORE INTO article_search_articles
      (feed_hash, object_key, priority, article_id, ordinal, sort_key, fields, search_text)
      SELECT ?1, ?2, ?3, json_extract(value, '$.id'), json_extract(value, '$.ordinal'),
        json_extract(value, '$.sortKey'), json_extract(value, '$.fields'), json_extract(value, '$.searchText')
      FROM json_each(?4) WHERE EXISTS (
        SELECT 1 FROM article_search_feeds WHERE feed_hash = ?1 AND token = ?5 AND status = 'building'
      )`)
      .bind(feedHash, batch.objectKey, batch.priority, `[${rows.join(",")}]`, token)
      .run();
    rows = [];
    bytes = 2;
  }
  for (const [index, article] of batch.articles.entries()) {
    if (seen.has(article.id)) continue;
    seen.add(article.id);
    const row = JSON.stringify({
      id: article.id,
      ordinal: ordinalOffset + index,
      ...normalizeSearchArticle(article),
    });
    const rowBytes = encoder.encode(row).byteLength;
    if (rowBytes > MAX_INDEX_ROW_BYTES)
      throw new SearchIndexUnavailableError("Article exceeds D1 search row limit");
    if (rows.length && (bytes + rowBytes > INDEX_BATCH_BYTES || rows.length >= INDEX_BATCH_SIZE))
      await flush();
    rows.push(row);
    bytes += rowBytes + 1;
  }
  await flush();
  await assertOwner(db, feedHash, token);
}

async function startBuild(db: D1Database, meta: SharedFeedMeta, revision: string): Promise<string> {
  const token = crypto.randomUUID();
  await db
    .prepare(`INSERT INTO article_search_feeds (feed_hash, source_revision, status, token, title)
    VALUES (?, ?, 'building', ?, ?) ON CONFLICT(feed_hash) DO UPDATE SET
    source_revision = excluded.source_revision, status = excluded.status, token = excluded.token, title = excluded.title,
    mode = 'rebuild', next_object = 0, next_article = 0, indexed_articles = 0`)
    .bind(meta.feedHash, revision, token, meta.title)
    .run();
  return token;
}

async function finishBuild(
  db: D1Database,
  bucket: R2Bucket,
  meta: SharedFeedMeta,
  revision: string,
  token: string,
): Promise<void> {
  if ((await readFeedArticleRevision(bucket, meta.feedHash, meta)) !== revision)
    throw new SearchIndexUnavailableError("Feed changed while indexing");
  await assertOwner(db, meta.feedHash, token);
  const result = await db
    .prepare("UPDATE article_search_feeds SET status = 'ready' WHERE feed_hash = ? AND token = ?")
    .bind(meta.feedHash, token)
    .run();
  if (result.meta.changes !== 1)
    throw new SearchIndexUnavailableError("Search indexing was superseded");
}

async function failBuild(db: D1Database, feedHash: string, token: string): Promise<void> {
  await db
    .prepare("UPDATE article_search_feeds SET status = 'failed' WHERE feed_hash = ? AND token = ?")
    .bind(feedHash, token)
    .run();
}

/** A one-object-at-a-time rebuild. No whole-feed/corpus article array is retained. */
export async function rebuildFeedSearchIndex(
  db: D1Database,
  bucket: R2Bucket,
  meta: SharedFeedMeta,
): Promise<void> {
  const snapshot = await readFeedArticleSnapshot(bucket, meta.feedHash, meta);
  const token = await startBuild(db, meta, snapshot.revision);
  try {
    await db
      .prepare(`DELETE FROM article_search_articles WHERE feed_hash = ? AND EXISTS (
      SELECT 1 FROM article_search_feeds WHERE feed_hash = ? AND token = ?
    )`)
      .bind(meta.feedHash, meta.feedHash, token)
      .run();
    for await (const batch of iterateFeedArticleBatches(bucket, meta.feedHash, snapshot)) {
      await writeBatch(db, meta.feedHash, token, batch);
    }
    await finishBuild(db, bucket, meta, snapshot.revision, token);
  } catch (error) {
    await failBuild(db, meta.feedHash, token).catch(() => undefined);
    throw error;
  }
}

export interface SearchIndexRebuildProgress {
  ready: boolean;
  revision: string;
  objectIndex: number;
  articleOffset: number;
  indexedArticles: number;
}
export interface SearchIndexRebuildOptions {
  maxArticles?: number;
  maxObjects?: number;
}

/** Bounded, restartable backfill for Worker invocations and the maintenance runner. */
export async function rebuildFeedSearchIndexStep(
  db: D1Database,
  bucket: R2Bucket,
  meta: SharedFeedMeta,
  options: SearchIndexRebuildOptions = {},
): Promise<SearchIndexRebuildProgress> {
  const snapshot = await readFeedArticleSnapshot(bucket, meta.feedHash, meta);
  const state = await getState(db, meta.feedHash);
  const progress: SearchIndexRebuildProgress = {
    ready: false,
    revision: snapshot.revision,
    objectIndex: 0,
    articleOffset: 0,
    indexedArticles: 0,
  };
  if (state?.source_revision === snapshot.revision && state.status === "ready") {
    return { ...progress, ready: true, indexedArticles: state.indexed_articles };
  }
  let token: string;
  const resuming =
    state?.source_revision === snapshot.revision &&
    (state.status === "building" || state.status === "failed") &&
    state.mode === "rebuild";
  if (resuming) {
    token = crypto.randomUUID();
    const claim = await db
      .prepare(`UPDATE article_search_feeds SET token = ?, status = 'building'
      WHERE feed_hash = ? AND source_revision = ? AND status IN ('building', 'failed') AND token = ?`)
      .bind(token, meta.feedHash, snapshot.revision, state.token)
      .run();
    if (claim.meta.changes !== 1)
      throw new SearchIndexUnavailableError("Search rebuild was superseded");
    progress.objectIndex = state.next_object;
    progress.articleOffset = state.next_article;
    progress.indexedArticles = state.indexed_articles;
  } else {
    token = await startBuild(db, meta, snapshot.revision);
  }
  try {
    if (!resuming) {
      await db
        .prepare(`DELETE FROM article_search_articles WHERE feed_hash = ? AND EXISTS (
        SELECT 1 FROM article_search_feeds WHERE feed_hash = ? AND token = ?
      )`)
        .bind(meta.feedHash, meta.feedHash, token)
        .run();
    }
    const objects = [
      {
        objectKey: `feeds/${meta.feedHash}/articles/latest.json`,
        priority: -Number.MAX_SAFE_INTEGER,
      },
      ...[...snapshot.segments].sort((a, b) => a.priority - b.priority),
    ];
    const requestedArticles = options.maxArticles ?? MAX_REBUILD_STEP_ARTICLES;
    const requestedObjects = options.maxObjects ?? 4;
    const maxArticles = Number.isFinite(requestedArticles)
      ? Math.min(MAX_REBUILD_STEP_ARTICLES, Math.max(1, Math.floor(requestedArticles)))
      : MAX_REBUILD_STEP_ARTICLES;
    const maxObjects = Number.isFinite(requestedObjects)
      ? Math.min(4, Math.max(1, Math.floor(requestedObjects)))
      : 4;
    let processed = 0;
    let opened = 0;
    while (
      progress.objectIndex < objects.length &&
      processed < maxArticles &&
      opened < maxObjects
    ) {
      const descriptor = objects[progress.objectIndex];
      const object =
        progress.objectIndex === 0
          ? { articles: snapshot.latest }
          : await readFeedArticleObject(bucket, meta.feedHash, descriptor.objectKey);
      if (!object) throw new SearchIndexUnavailableError("Missing rebuild article object");
      opened++;
      const articles = object.articles.slice(
        progress.articleOffset,
        progress.articleOffset + maxArticles - processed,
      );
      await writeBatch(
        db,
        meta.feedHash,
        token,
        { ...descriptor, articles },
        progress.articleOffset,
      );
      processed += articles.length;
      progress.articleOffset += articles.length;
      progress.indexedArticles += articles.length;
      if (progress.articleOffset >= object.articles.length) {
        progress.objectIndex++;
        progress.articleOffset = 0;
      }
    }
    if ((await readFeedArticleRevision(bucket, meta.feedHash, meta)) !== snapshot.revision)
      throw new SearchIndexUnavailableError("Feed changed while indexing");
    const checkpoint = await db
      .prepare(`UPDATE article_search_feeds SET next_object = ?, next_article = ?, indexed_articles = ?
      WHERE feed_hash = ? AND token = ? AND status = 'building'`)
      .bind(
        progress.objectIndex,
        progress.articleOffset,
        progress.indexedArticles,
        meta.feedHash,
        token,
      )
      .run();
    if (checkpoint.meta.changes !== 1)
      throw new SearchIndexUnavailableError("Search rebuild was superseded");
    if (progress.objectIndex === objects.length) {
      await finishBuild(db, bucket, meta, snapshot.revision, token);
      progress.ready = true;
    }
    return progress;
  } catch (error) {
    await failBuild(db, meta.feedHash, token).catch(() => undefined);
    throw error;
  }
}

/** Call after R2 commit, and on no-change fetches to repair a prior indexing failure. */
export async function ensureFeedSearchIndex(
  db: D1Database,
  bucket: R2Bucket,
  meta: SharedFeedMeta,
  commit?: FeedArticleCommit,
): Promise<void> {
  const state = await getState(db, meta.feedHash);
  const revision = await readFeedArticleRevision(bucket, meta.feedHash, meta);
  if (state?.status === "ready" && state.source_revision === revision) {
    return;
  }
  if (
    !commit ||
    commit.requiresRebuild ||
    commit.revision !== revision ||
    state?.status !== "ready" ||
    state.source_revision !== commit.previousRevision
  ) {
    await rebuildFeedSearchIndexStep(db, bucket, meta);
    return;
  }
  const token = crypto.randomUUID();
  const claim = await db
    .prepare(`UPDATE article_search_feeds SET source_revision = ?, status = 'building', token = ?, title = ?, mode = 'incremental'
    WHERE feed_hash = ? AND source_revision = ? AND status = 'ready' AND token = ?`)
    .bind(revision, token, meta.title, meta.feedHash, commit.previousRevision, state.token)
    .run();
  if (claim.meta.changes !== 1) {
    await rebuildFeedSearchIndexStep(db, bucket, meta);
    return;
  }
  try {
    const removeKeys = new Set([
      ...commit.removedObjectKeys,
      ...commit.changedObjects.map((batch) => batch.objectKey),
    ]);
    // The token guard prevents an older, superseded writer from editing a newer build.
    await db
      .prepare(`DELETE FROM article_search_articles WHERE feed_hash = ? AND object_key IN (SELECT value FROM json_each(?))
      AND EXISTS (SELECT 1 FROM article_search_feeds WHERE feed_hash = ? AND token = ?)`)
      .bind(meta.feedHash, JSON.stringify([...removeKeys]), meta.feedHash, token)
      .run();
    for (const batch of commit.changedObjects) await writeBatch(db, meta.feedHash, token, batch);
    await finishBuild(db, bucket, meta, revision, token);
  } catch (error) {
    await failBuild(db, meta.feedHash, token).catch(() => undefined);
    throw error;
  }
}

/** Shared-feed deletion/refetch cleanup; never called merely for a user's unsubscribe. */
export async function deleteFeedSearchIndex(db: D1Database, feedHash: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM article_search_articles WHERE feed_hash = ?").bind(feedHash),
    db.prepare("DELETE FROM article_search_feeds WHERE feed_hash = ?").bind(feedHash),
  ]);
}

export interface IndexedArticleSearchOptions {
  db?: D1Database;
  bucket: R2Bucket;
  query: string;
  subscriptions: UserSubscription[];
  savedArticles: Article[];
  readState: ReadState;
  limit?: number;
}

export async function searchIndexedArticles(
  options: IndexedArticleSearchOptions,
): Promise<Article[]> {
  const { db, bucket, query, subscriptions, savedArticles, readState } = options;
  const matcher = compileSearchQuery(query);
  if (!matcher) return [];
  if (!db && subscriptions.length)
    throw new SearchIndexUnavailableError("ARTICLE_SEARCH D1 binding is not configured");
  const limit = Math.min(Math.max(0, options.limit ?? MAX_USER_ARTICLES), MAX_USER_ARTICLES);
  const sources = await pMap(
    subscriptions,
    async (sub) => {
      const meta = await readFeedMeta(bucket, sub.feedHash);
      const revision = await readFeedArticleRevision(bucket, sub.feedHash, meta ?? undefined);
      return {
        feedHash: sub.feedHash,
        title: sub.customTitle || meta?.title || "",
        revision,
        // Orphaned subscriptions previously contributed no articles. Do not turn a
        // positively absent feed into a permanent readiness failure for every query.
        missing: meta === null && revision === "legacy:missing",
      };
    },
    SEARCH_R2_CONCURRENCY,
  );
  const searchContext: SearchContext = {
    feedTitleByHash: new Map(sources.map((s) => [s.feedHash, s.title])),
    tagsByArticleId: readState.tagIds ?? undefined,
  };
  const seen = new Set<string>();
  const matched: Article[] = [];
  for (const article of savedArticles) {
    if (seen.has(article.id)) continue;
    seen.add(article.id);
    if (matcher(article, searchContext)) matched.push(article);
  }
  if (subscriptions.length && db) {
    const compiled = buildIndexedSearchQuery(
      query,
      sources.filter((source) => !source.missing),
      searchContext.tagsByArticleId ?? {},
      [...seen],
      limit,
    );
    if (!compiled) return [];
    const result = await db
      .prepare(compiled.sql)
      .bind(...compiled.params)
      .all<SearchHit>();
    if (result.results.some((row) => !row.ready)) throw new SearchIndexUnavailableError();
    // Merge lightweight indexed references with saved matches before hydration.
    // A newer saved result must not cause an unnecessary shared-object body GET.
    const choices: Array<{
      id: string;
      publishedAt: string | null;
      createdAt: string;
      article?: Article;
      hit?: SearchHit;
    }> = matched.map((article) => ({
      id: article.id,
      publishedAt: article.publishedAt,
      createdAt: article.createdAt,
      article,
    }));
    for (const hit of result.results) {
      if (!hit.article_id || !hit.feed_hash || !hit.object_key || hit.sort_key === null)
        throw new SearchIndexUnavailableError("Invalid search pointer");
      choices.push({ id: hit.article_id, publishedAt: hit.sort_key, createdAt: hit.sort_key, hit });
    }
    choices.sort(compareByDateDesc);
    matched.length = 0;
    const groups = new Map<string, { feedHash: string; ids: Set<string> }>();
    for (const choice of choices.slice(0, limit)) {
      if (choice.article) {
        matched.push(choice.article);
        continue;
      }
      const hit = choice.hit;
      if (!hit?.article_id || !hit.feed_hash || !hit.object_key)
        throw new SearchIndexUnavailableError("Invalid search pointer");
      let group = groups.get(hit.object_key);
      if (!group) {
        group = { feedHash: hit.feed_hash, ids: new Set() };
        groups.set(hit.object_key, group);
      }
      group.ids.add(hit.article_id);
    }
    const revisionByFeed = new Map(sources.map((s) => [s.feedHash, s.revision]));
    const hydrated = await pMap(
      [...groups],
      async ([key, group]) => {
        const object = await readFeedArticleObject(bucket, group.feedHash, key);
        if (
          !object ||
          (object.revision !== null && object.revision !== revisionByFeed.get(group.feedHash))
        )
          throw new SearchIndexUnavailableError("Article object changed during search");
        const selected: Article[] = [];
        const remaining = new Set(group.ids);
        for (const article of object.articles) {
          if (!remaining.delete(article.id)) continue;
          if (!matcher(article, searchContext))
            throw new SearchIndexUnavailableError("Search index is out of date");
          selected.push(article);
        }
        if (remaining.size)
          throw new SearchIndexUnavailableError("Indexed article is missing from R2");
        return selected;
      },
      SEARCH_R2_CONCURRENCY,
    );
    // Even a newly added article in a non-matching object can change the top K.
    // Recheck all source revisions; no article-body scan is used for this check.
    await pMap(
      sources,
      async (source) => {
        if ((await readFeedArticleRevision(bucket, source.feedHash)) !== source.revision)
          throw new SearchIndexUnavailableError("Feed changed during search");
      },
      SEARCH_R2_CONCURRENCY,
    );
    for (const articles of hydrated) matched.push(...articles);
  }
  matched.sort(compareByDateDesc);
  return matched.slice(0, limit);
}
