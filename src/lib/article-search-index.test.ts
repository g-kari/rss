// @vitest-environment node
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildIndexedSearchQuery,
  normalizeSearchArticle,
  rebuildFeedSearchIndex,
  rebuildFeedSearchIndexStep,
  ensureFeedSearchIndex,
  deleteFeedSearchIndex,
  searchIndexedArticles,
  SEARCH_R2_CONCURRENCY,
  createSearchIndexBudget,
  withSearchIndexBudget,
} from "./article-search-index";
import { compileSearchQuery, type SearchContext } from "./full-text-search";
import type {
  Article,
  FeedArticleBatch,
  FeedArticleSegment,
  ReadState,
  SharedFeedMeta,
  UserSubscription,
} from "../types";

const article = (id: string, values: Partial<Article> = {}): Article => ({
  id,
  feedHash: "feed",
  guid: id,
  title: "東京都の検索 substring",
  summary: "A summary",
  content: "<p>hello <b>world</b> 100% literal_</p>",
  author: "ÉLISE",
  categories: ["tech", "日本語"],
  link: "https://example.com/story",
  publishedAt: "2026-09-30T00:00:00Z",
  createdAt: "2026-09-29T00:00:00Z",
  metadata: [
    { key: "dc:language", value: "ja" },
    { key: "source", value: "日本" },
  ],
  ...values,
});

describe("D1 search exact substring semantics", () => {
  it("matches the existing evaluator for Unicode, phrases, NOT, OR and every field", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(
      readFileSync(
        new URL("../../migrations/article-search/0001_article_search.sql", import.meta.url),
        "utf8",
      ),
    );
    db.exec(
      readFileSync(
        new URL("../../migrations/article-search/0002_rebuild_checkpoints.sql", import.meta.url),
        "utf8",
      ),
    );
    db.prepare(
      "INSERT INTO article_search_feeds (feed_hash,source_revision,status,token,title) VALUES (?, ?, ?, ?, ?)",
    ).run("feed", "r1", "ready", "token", "Feed");
    const articles = [
      article("a"),
      article("b", { title: "Other", summary: "no", content: "other", author: "" }),
    ];
    for (const [offset, a] of articles.entries()) {
      const normalized = normalizeSearchArticle(a);
      db.prepare(
        "INSERT INTO article_search_articles (feed_hash,object_key,priority,article_id,ordinal,sort_key,fields,search_text) VALUES (?,?,?,?,?,?,?,?)",
      ).run(
        "feed",
        "feeds/feed/articles/latest.json",
        0,
        a.id,
        offset,
        normalized.sortKey,
        normalized.fields,
        normalized.searchText,
      );
    }
    const ctx: SearchContext = {
      feedTitleByHash: new Map([["feed", "Custom title 日本"]]),
      tagsByArticleId: { a: ["お気に入り", "read later"] },
    };
    const queries = [
      "東京",
      "京",
      "東京都",
      "substring",
      "string",
      '"hello world"',
      'content:"hello world"',
      "title:東京都",
      "author:ÉLI",
      "category:日本語",
      "summary:summary",
      "feed:custom",
      "tag:お気に入り",
      "url:example",
      "guid:a",
      "published:2026-09",
      "language:ja",
      "metadata:source",
      "title:other OR 東京 -tag:absent",
      "-東京",
      "-東京 OR category:日本語",
      '"100% literal_"',
      'content:"100%"',
      "notthere",
      "OR -",
      '"summary \u0001 "',
    ];
    for (const query of queries) {
      const compiled = buildIndexedSearchQuery(
        query,
        [{ feedHash: "feed", title: "Custom title 日本", revision: "r1" }],
        ctx.tagsByArticleId ?? {},
        [],
        100,
      );
      if (!compiled) {
        expect(compileSearchQuery(query)).toBeNull();
        continue;
      }
      const rows = db.prepare(compiled.sql).all(...compiled.params);
      const actual = rows.filter((r) => r.ready === 1).map((r) => r.article_id);
      const expected = articles.filter((a) => compileSearchQuery(query)!(a, ctx)).map((a) => a.id);
      expect(actual, query).toEqual(expected);
    }
    db.close();
  });
});

/** Real SQLite+FTS execution behind the small D1 binding surface used by this module. */
function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(
      new URL("../../migrations/article-search/0001_article_search.sql", import.meta.url),
      "utf8",
    ),
  );
  sqlite.exec(
    readFileSync(
      new URL("../../migrations/article-search/0002_rebuild_checkpoints.sql", import.meta.url),
      "utf8",
    ),
  );
  const control: { beforeRun?: (sql: string, params: SQLInputValue[]) => void } = {};
  function prepare(sql: string, params: SQLInputValue[] = []) {
    return {
      bind: (...values: SQLInputValue[]) => prepare(sql, values),
      async run() {
        control.beforeRun?.(sql, params);
        const result = sqlite.prepare(sql).run(...params);
        return { success: true, meta: { changes: Number(result.changes) }, results: [] };
      },
      async all() {
        control.beforeRun?.(sql, params);
        return { success: true, results: sqlite.prepare(sql).all(...params) };
      },
      async first() {
        control.beforeRun?.(sql, params);
        return sqlite.prepare(sql).get(...params) ?? null;
      },
    };
  }
  const binding = {
    prepare,
    async batch(statements: Array<ReturnType<typeof prepare>>) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
  return { sqlite, binding, control };
}

interface StoredObject {
  body: unknown;
  etag: string;
  revision?: string;
}
function bucketFixture() {
  const objects = new Map<string, StoredObject>();
  const gets: string[] = [];
  const heads: string[] = [];
  let active = 0;
  let maximum = 0;
  const control: { onGet?: (key: string) => void; onHead?: (key: string) => void } = {};
  async function io() {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 0));
    active--;
  }
  const bucket = {
    async get(key: string) {
      gets.push(key);
      await io();
      control.onGet?.(key);
      const object = objects.get(key);
      return object
        ? {
            etag: object.etag,
            customMetadata: { articleRevision: object.revision },
            async json() {
              return structuredClone(object.body);
            },
          }
        : null;
    },
    async head(key: string) {
      heads.push(key);
      await io();
      control.onHead?.(key);
      const object = objects.get(key);
      return object
        ? { etag: object.etag, customMetadata: { articleRevision: object.revision } }
        : null;
    },
  } as unknown as R2Bucket;
  return { bucket, objects, gets, heads, control, maximum: () => maximum };
}

const latestKey = (feedHash = "feed") => `feeds/${feedHash}/articles/latest.json`;
const readState: ReadState = { readIds: [], bookmarkIds: [], readingListIds: [], likeIds: [] };
const subscription = (feedHash = "feed"): UserSubscription => ({
  feedHash,
  url: `https://${feedHash}.example/feed`,
  subscribedAt: "2026-01-01",
});
const metadata = (feedHash = "feed", overrides: Partial<SharedFeedMeta> = {}): SharedFeedMeta => ({
  feedHash,
  url: `https://${feedHash}.example/feed`,
  title: "Feed",
  siteUrl: "",
  lastFetchedAt: null,
  fetchError: null,
  articleCount: 0,
  pageCount: 0,
  ...overrides,
});
function storeHead(
  fixture: ReturnType<typeof bucketFixture>,
  revision: string,
  articles: Article[],
  batches: FeedArticleBatch[] = [],
  feedHash = "feed",
) {
  const segments: FeedArticleSegment[] = batches.map((b) => ({
    objectKey: b.objectKey,
    priority: b.priority,
    count: b.articles.length,
    newest: b.articles[0],
    oldest: b.articles[b.articles.length - 1],
  }));
  fixture.objects.set(latestKey(feedHash), {
    etag: revision,
    revision,
    body: { version: 2, revision, articles, segments, nextSegmentId: 10 },
  });
  for (const batch of batches)
    fixture.objects.set(batch.objectKey, { etag: batch.objectKey, body: batch.articles });
  const meta = metadata(feedHash, {
    articleCount: articles.length + batches.reduce((n, b) => n + b.articles.length, 0),
    pageCount: batches.length,
    articleRevision: revision,
  });
  fixture.objects.set(`feeds/${feedHash}/meta.json`, { body: meta, etag: revision });
  return meta;
}

const batch = (name: string, articles: Article[], priority = -1): FeedArticleBatch => ({
  objectKey: `feeds/feed/articles/segments/${name}.json`,
  priority,
  articles,
});

async function search(
  db: D1Database | undefined,
  fixture: ReturnType<typeof bucketFixture>,
  query: string,
  overrides: Partial<Parameters<typeof searchIndexedArticles>[0]> = {},
) {
  return searchIndexedArticles({
    db,
    bucket: fixture.bucket,
    query,
    subscriptions: [subscription()],
    savedArticles: [],
    readState,
    ...overrides,
  });
}

describe("D1 projection lifecycle and R2 isolation", () => {
  it("streams legacy rebuild including the final historical page and preserves first-copy priority", async () => {
    const db = database();
    const fixture = bucketFixture();
    fixture.objects.set(latestKey(), {
      etag: "initial",
      body: [article("same", { title: "current" })],
    });
    fixture.objects.set("feeds/feed/articles/p2.json", {
      etag: "p2",
      body: [article("same", { title: "oldmatch" }), article("middle")],
    });
    fixture.objects.set("feeds/feed/articles/p3.json", {
      etag: "p3",
      body: [article("last", { title: "finalmatch" })],
    });
    const meta = metadata("feed", { pageCount: 2, articleCount: 4 });
    fixture.objects.set("feeds/feed/meta.json", { body: meta, etag: "meta" });
    await rebuildFeedSearchIndex(db.binding, fixture.bucket, meta);
    expect(fixture.gets).toEqual([
      latestKey(),
      "feeds/feed/articles/p2.json",
      "feeds/feed/articles/p3.json",
    ]);
    expect(await search(db.binding, fixture, "oldmatch")).toEqual([]);
    expect((await search(db.binding, fixture, "finalmatch")).map((a) => a.id)).toEqual(["last"]);
    expect(db.sqlite.prepare("SELECT status FROM article_search_feeds").get()?.status).toBe(
      "ready",
    );
    db.sqlite.close();
  });

  it("updates only changed objects, removes obsolete pointers, and repairs after deletion/refetch", async () => {
    const db = database();
    const fixture = bucketFixture();
    const archive = batch("unchanged", [article("archive", { title: "archive" })]);
    let meta = storeHead(fixture, "r1", [article("old", { title: "oldword" })], [archive]);
    await rebuildFeedSearchIndex(db.binding, fixture.bucket, meta);
    const replacement = article("new", { title: "newword" });
    meta = storeHead(fixture, "r2", [replacement], [archive]);
    fixture.gets.length = 0;
    await ensureFeedSearchIndex(db.binding, fixture.bucket, meta, {
      previousRevision: "r1",
      revision: "r2",
      changedObjects: [
        { objectKey: latestKey(), priority: -Number.MAX_SAFE_INTEGER, articles: [replacement] },
      ],
      removedObjectKeys: [],
      requiresRebuild: false,
    });
    expect(fixture.gets).toEqual([]); // The commit already contains article bodies.
    expect(await search(db.binding, fixture, "oldword")).toEqual([]);
    expect((await search(db.binding, fixture, "newword OR archive")).map((a) => a.id)).toEqual([
      "archive",
      "new",
    ]);
    await deleteFeedSearchIndex(db.binding, "feed");
    expect(
      db.sqlite
        .prepare(
          "SELECT count(*) AS n FROM article_search_fts WHERE article_search_fts MATCH 'newword'",
        )
        .get()?.n,
    ).toBe(0);
    meta = storeHead(fixture, "r3", [article("refetched", { title: "refetched" })]);
    await ensureFeedSearchIndex(db.binding, fixture.bucket, meta);
    expect((await search(db.binding, fixture, "refetched")).map((a) => a.id)).toEqual([
      "refetched",
    ]);
    expect(await search(db.binding, fixture, "archive")).toEqual([]);
    db.sqlite.close();
  });

  it("leaves a failed index unready without changing R2, and no-change retry rebuilds it", async () => {
    const db = database();
    const fixture = bucketFixture();
    const meta = storeHead(fixture, "r1", [article("a")]);
    const before = JSON.stringify([...fixture.objects]);
    db.control.beforeRun = (sql) => {
      if (/INSERT(?: OR IGNORE)? INTO article_search_articles/.test(sql))
        throw new Error("D1 outage");
    };
    await expect(rebuildFeedSearchIndex(db.binding, fixture.bucket, meta)).rejects.toThrow(
      "D1 outage",
    );
    expect(db.sqlite.prepare("SELECT status FROM article_search_feeds").get()?.status).toBe(
      "failed",
    );
    expect(JSON.stringify([...fixture.objects])).toBe(before);
    db.control.beforeRun = undefined;
    fixture.gets.length = 0;
    await expect(search(db.binding, fixture, "東京都")).rejects.toThrow("not ready");
    expect(fixture.gets.filter((k) => k.includes("/articles/"))).toEqual([]);
    await ensureFeedSearchIndex(db.binding, fixture.bucket, meta);
    expect((await search(db.binding, fixture, "東京都")).map((a) => a.id)).toEqual(["a"]);
    db.sqlite.close();
  });

  it("aborts a rebuild when its source revision changes or an indexing owner supersedes it", async () => {
    const db = database();
    const fixture = bucketFixture();
    const archive = batch("archive", [article("b")]);
    const meta = storeHead(fixture, "r1", [article("a")], [archive]);
    fixture.control.onGet = (key) => {
      if (key === archive.objectKey) fixture.objects.get(latestKey())!.revision = "r2";
    };
    await expect(rebuildFeedSearchIndex(db.binding, fixture.bucket, meta)).rejects.toThrow(
      "Feed changed",
    );
    fixture.control.onGet = undefined;
    fixture.objects.get(latestKey())!.revision = "r1";
    let changed = false;
    db.control.beforeRun = (sql) => {
      if (!changed && /INSERT(?: OR IGNORE)? INTO article_search_articles/.test(sql)) {
        changed = true;
        db.sqlite.prepare("UPDATE article_search_feeds SET token = 'other'").run();
      }
    };
    await expect(rebuildFeedSearchIndex(db.binding, fixture.bucket, meta)).rejects.toThrow(
      "superseded",
    );
    expect(db.sqlite.prepare("SELECT status, token FROM article_search_feeds").get()).toMatchObject(
      { status: "building", token: "other" },
    );
    db.sqlite.close();
  });

  it("atomically rejects unreadiness inside the search SQL, including empty matches", async () => {
    const db = database();
    const fixture = bucketFixture();
    const meta = storeHead(fixture, "r1", [article("a")]);
    await rebuildFeedSearchIndex(db.binding, fixture.bucket, meta);
    db.control.beforeRun = (sql) => {
      if (sql.startsWith("WITH requested"))
        db.sqlite.prepare("UPDATE article_search_feeds SET status = 'building'").run();
    };
    fixture.gets.length = 0;
    await expect(search(db.binding, fixture, "no match at all")).rejects.toThrow("not ready");
    expect(fixture.gets).toEqual(["feeds/feed/meta.json"]);
    db.sqlite.close();
  });

  it("cannot incrementally claim an index state replaced since its initial read", async () => {
    const db = database();
    const fixture = bucketFixture();
    let meta = storeHead(fixture, "r1", [article("a")]);
    await rebuildFeedSearchIndex(db.binding, fixture.bucket, meta);
    const fresh = article("fresh", { title: "fresh" });
    meta = storeHead(fixture, "r2", [fresh]);
    let claimed = false;
    db.control.beforeRun = (sql) => {
      if (!claimed && sql.startsWith("UPDATE article_search_feeds SET source_revision")) {
        claimed = true;
        db.sqlite
          .prepare("UPDATE article_search_feeds SET token = 'other', status = 'building'")
          .run();
        db.sqlite.prepare("DELETE FROM article_search_articles").run();
      }
    };
    await ensureFeedSearchIndex(db.binding, fixture.bucket, meta, {
      previousRevision: "r1",
      revision: "r2",
      changedObjects: [
        { objectKey: latestKey(), priority: -Number.MAX_SAFE_INTEGER, articles: [fresh] },
      ],
      removedObjectKeys: [],
      requiresRebuild: false,
    });
    expect(claimed).toBe(true);
    expect((await search(db.binding, fixture, "fresh")).map((a) => a.id)).toEqual(["fresh"]);
    db.sqlite.close();
  });
});

describe("bounded indexed article search", () => {
  it("keeps saved-article priority before matching, user-scoped titles/tags, date fallback and top K", async () => {
    const db = database();
    const fixture = bucketFixture();
    const articles = [
      article("duplicate", { title: "match" }),
      article("older", { title: "match", publishedAt: null, createdAt: "2026-09-28" }),
      article("newer", { title: "match", publishedAt: null, createdAt: "2026-10-01" }),
    ];
    const meta = storeHead(fixture, "r1", articles);
    await rebuildFeedSearchIndex(db.binding, fixture.bucket, meta);
    const saved = article("duplicate", {
      title: "no",
      summary: "",
      content: "",
      feedHash: "__saved__",
    });
    const opts = { savedArticles: [saved], limit: 1 };
    expect((await search(db.binding, fixture, "match", opts)).map((a) => a.id)).toEqual(["newer"]);
    expect(
      await search(db.binding, fixture, "title:match tag:personal", {
        ...opts,
        readState: { ...readState, tagIds: { newer: ["personal"] } },
      }),
    ).toEqual([articles[2]]);
    expect(
      (
        await search(db.binding, fixture, "feed:custom", {
          subscriptions: [{ ...subscription(), customTitle: "Custom" }],
        })
      ).map((a) => a.id),
    ).toEqual(["newer", "duplicate", "older"]);
    expect(await search(db.binding, fixture, "feed:custom")).toEqual([]);
    db.sqlite.close();
  });

  it("hydrates only selected physical objects, not unmatched objects or every candidate", async () => {
    const db = database();
    const fixture = bucketFixture();
    const batches = Array.from({ length: 12 }, (_, i) =>
      batch(
        `segment-${i}`,
        [article(`a${String(i).padStart(2, "0")}`, { title: i === 11 ? "unmatched" : "needle" })],
        -i - 1,
      ),
    );
    const meta = storeHead(fixture, "r1", [], batches);
    await rebuildFeedSearchIndex(db.binding, fixture.bucket, meta);
    fixture.gets.length = 0;
    const result = await search(db.binding, fixture, "needle", { limit: 7 });
    expect(result).toHaveLength(7);
    expect(fixture.gets.filter((key) => key.includes("/articles/"))).toHaveLength(7);
    expect(fixture.gets).not.toContain(batches[11].objectKey);
    expect(fixture.gets).not.toContain(latestKey());
    expect(fixture.maximum()).toBeLessThanOrEqual(SEARCH_R2_CONCURRENCY);
    db.sqlite.close();
  });

  it("does no body reads for zero hits, and rejects stale/missing/moved search pointers", async () => {
    const db = database();
    const fixture = bucketFixture();
    const archive = batch("archive", [article("a")]);
    const meta = storeHead(fixture, "r1", [], [archive]);
    await rebuildFeedSearchIndex(db.binding, fixture.bucket, meta);
    fixture.gets.length = 0;
    expect(await search(db.binding, fixture, "absent")).toEqual([]);
    expect(fixture.gets).toEqual(["feeds/feed/meta.json"]);
    fixture.objects.get(latestKey())!.revision = "changed";
    await expect(search(db.binding, fixture, "東京")).rejects.toThrow("not ready");
    fixture.objects.get(latestKey())!.revision = "r1";
    fixture.objects.delete(archive.objectKey);
    await expect(search(db.binding, fixture, "東京")).rejects.toThrow("object changed");
    fixture.objects.set(archive.objectKey, { etag: "archive", body: [] });
    await expect(search(db.binding, fixture, "東京")).rejects.toThrow("missing from R2");
    fixture.objects.set(archive.objectKey, { etag: "archive", body: archive.articles });
    fixture.control.onGet = (key) => {
      if (key === archive.objectKey) fixture.objects.get(latestKey())!.revision = "new revision";
    };
    await expect(search(db.binding, fixture, "東京")).rejects.toThrow("Feed changed during search");
    db.sqlite.close();
  });

  it("supports over 1000 subscriptions and tags using five bound parameters", () => {
    const db = database();
    const sources = Array.from({ length: 1001 }, (_, i) => ({
      feedHash: `feed${i}`,
      title: `Title ${i}`,
      revision: "r1",
    }));
    const tags = Object.fromEntries(
      Array.from({ length: 1001 }, (_, i) => [`article${i}`, ["tag"]]),
    );
    const compiled = buildIndexedSearchQuery("東京 OR -tag:tag", sources, tags, ["saved"], 10)!;
    expect(compiled.params).toHaveLength(5);
    expect(db.sqlite.prepare(compiled.sql).all(...compiled.params)).toEqual([
      { article_id: null, feed_hash: null, object_key: null, sort_key: null, ready: 0 },
    ]);
    db.sqlite.close();
  });

  it("keeps empty and saved-only searches usable without D1", async () => {
    const fixture = bucketFixture();
    expect(await search(undefined, fixture, "OR -")).toEqual([]);
    expect(
      await search(undefined, fixture, "東京", {
        subscriptions: [],
        savedArticles: [article("saved")],
      }),
    ).toHaveLength(1);
    await expect(search(undefined, fixture, "東京")).rejects.toThrow("binding");
    expect(fixture.gets).toEqual([]);
  });
});

describe("bounded resumable rebuild", () => {
  it("checkpoints inside physical objects and completes without rereading earlier archive bodies", async () => {
    const db = database();
    const fixture = bucketFixture();
    const archived = batch("archive", [article("archive-a"), article("archive-b")]);
    const meta = storeHead(fixture, "r1", [article("a"), article("b"), article("c")], [archived]);
    const first = await rebuildFeedSearchIndexStep(db.binding, fixture.bucket, meta, {
      maxArticles: 2,
    });
    expect(first).toEqual({
      ready: false,
      revision: "r1",
      objectIndex: 0,
      articleOffset: 2,
      indexedArticles: 2,
    });
    await expect(search(db.binding, fixture, "東京")).rejects.toThrow("not ready");
    const second = await rebuildFeedSearchIndexStep(db.binding, fixture.bucket, meta, {
      maxArticles: 2,
    });
    expect(second).toEqual({
      ready: false,
      revision: "r1",
      objectIndex: 1,
      articleOffset: 1,
      indexedArticles: 4,
    });
    const third = await rebuildFeedSearchIndexStep(db.binding, fixture.bucket, meta, {
      maxArticles: 2,
    });
    expect(third).toEqual({
      ready: true,
      revision: "r1",
      objectIndex: 2,
      articleOffset: 0,
      indexedArticles: 5,
    });
    expect((await search(db.binding, fixture, "東京")).map((a) => a.id)).toEqual([
      "a",
      "archive-a",
      "archive-b",
      "b",
      "c",
    ]);
    // Appending a new object does not cause already-checkpointed archives to be read.
    expect(fixture.gets.filter((key) => key === archived.objectKey)).toHaveLength(3); // two steps + hydration
    db.sqlite.close();
  });

  it("restarts after a revision change instead of publishing an incomplete old snapshot", async () => {
    const db = database();
    const fixture = bucketFixture();
    let meta = storeHead(fixture, "r1", [article("a"), article("b")]);
    expect(
      (await rebuildFeedSearchIndexStep(db.binding, fixture.bucket, meta, { maxArticles: 1 }))
        .ready,
    ).toBe(false);
    meta = storeHead(fixture, "r2", [article("fresh", { title: "fresh" })]);
    const result = await rebuildFeedSearchIndexStep(db.binding, fixture.bucket, meta);
    expect(result).toMatchObject({ ready: true, revision: "r2", indexedArticles: 1 });
    expect(await search(db.binding, fixture, "東京")).toEqual([]);
    expect((await search(db.binding, fixture, "fresh")).map((a) => a.id)).toEqual(["fresh"]);
    db.sqlite.close();
  });

  it("keeps a repeated chunk idempotent and retains the first duplicate across checkpoints", async () => {
    const db = database();
    const fixture = bucketFixture();
    const meta = storeHead(fixture, "r1", [
      article("duplicate", { title: "first" }),
      article("other"),
      article("duplicate", { title: "second" }),
    ]);
    await rebuildFeedSearchIndexStep(db.binding, fixture.bucket, meta, { maxArticles: 1 });
    // Simulate interruption after inserts but before the durable cursor commit.
    db.sqlite
      .prepare(
        "UPDATE article_search_feeds SET next_object = 0, next_article = 0, indexed_articles = 0",
      )
      .run();
    const result = await rebuildFeedSearchIndexStep(db.binding, fixture.bucket, meta);
    expect(result.ready).toBe(true);
    expect((await search(db.binding, fixture, "first")).map((a) => a.id)).toEqual(["duplicate"]);
    expect(await search(db.binding, fixture, "second")).toEqual([]);
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM article_search_articles").get()?.n).toBe(2);
    db.sqlite.close();
  });

  it("caps even a caller-requested huge step and keeps normalized chunks bounded", async () => {
    const db = database();
    const fixture = bucketFixture();
    const articles = Array.from({ length: 405 }, (_, i) =>
      article(`article-${i}`, { summary: "x".repeat(20_000) }),
    );
    const meta = storeHead(fixture, "r1", articles);
    const sizes: number[] = [];
    db.control.beforeRun = (sql, params) => {
      if (/INSERT OR IGNORE INTO article_search_articles/.test(sql)) {
        expect(params).toHaveLength(5);
        sizes.push(new TextEncoder().encode(String(params[3])).byteLength);
      }
    };
    const result = await rebuildFeedSearchIndexStep(db.binding, fixture.bucket, meta, {
      maxArticles: 100_000,
    });
    expect(result).toMatchObject({ ready: false, indexedArticles: 200, articleOffset: 200 });
    expect(Math.max(...sizes)).toBeLessThanOrEqual(256 * 1024);
    expect(sizes.length).toBeLessThan(201);
    await ensureFeedSearchIndex(db.binding, fixture.bucket, meta);
    expect(
      db.sqlite.prepare("SELECT status, next_article FROM article_search_feeds").get(),
    ).toMatchObject({ status: "building", next_article: 400 });
    await ensureFeedSearchIndex(db.binding, fixture.bucket, meta);
    expect(db.sqlite.prepare("SELECT status FROM article_search_feeds").get()?.status).toBe(
      "ready",
    );
    db.sqlite.close();
  });

  it("rejects oversized rows without truncating searchable fields or modifying R2", async () => {
    const db = database();
    const fixture = bucketFixture();
    const meta = storeHead(fixture, "r1", [article("big", { content: "x".repeat(1_000_000) })]);
    const before = JSON.stringify([...fixture.objects]);
    await expect(rebuildFeedSearchIndexStep(db.binding, fixture.bucket, meta)).rejects.toThrow(
      "row limit",
    );
    expect(JSON.stringify([...fixture.objects])).toBe(before);
    expect(db.sqlite.prepare("SELECT status FROM article_search_feeds").get()?.status).toBe(
      "failed",
    );
    db.sqlite.close();
  });
});

describe("request-wide maintenance budget", () => {
  it("charges execution only, counts batched statements once, and stops before the limit", async () => {
    const db = database();
    const budget = createSearchIndexBudget(3);
    const limited = withSearchIndexBudget(db.binding, budget);
    const first = limited.prepare("SELECT ? AS n").bind(1);
    expect(budget.used).toBe(0);
    await first.first();
    expect(budget.used).toBe(1);
    await limited.batch([limited.prepare("SELECT 1"), limited.prepare("SELECT 2")]);
    expect(budget.remaining).toBe(0);
    expect(() => limited.prepare("SELECT 1").first()).toThrow("budget exhausted");
    expect(budget.used).toBe(3);
    db.sqlite.close();
  });

  it("resumes partially written rebuilds with a fresh invocation budget", async () => {
    const db = database();
    const fixture = bucketFixture();
    const meta = storeHead(
      fixture,
      "r1",
      Array.from({ length: 45 }, (_, i) => article(`a${i}`)),
    );
    const budget = createSearchIndexBudget(4);
    await expect(
      rebuildFeedSearchIndexStep(withSearchIndexBudget(db.binding, budget), fixture.bucket, meta),
    ).rejects.toThrow("budget exhausted");
    expect(budget.used).toBe(4);
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM article_search_articles").get()?.n).toBe(
      20,
    );
    expect(
      db.sqlite.prepare("SELECT status, next_article FROM article_search_feeds").get(),
    ).toMatchObject({ status: "building", next_article: 0 });
    const result = await rebuildFeedSearchIndexStep(
      withSearchIndexBudget(db.binding, createSearchIndexBudget(100)),
      fixture.bucket,
      meta,
    );
    expect(result.ready).toBe(true);
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM article_search_articles").get()?.n).toBe(
      45,
    );
    db.sqlite.close();
  });

  it("resumes a same-revision failed rebuild from its last durable checkpoint", async () => {
    const db = database();
    const fixture = bucketFixture();
    const meta = storeHead(fixture, "r1", [article("a"), article("b"), article("c")]);
    await rebuildFeedSearchIndexStep(db.binding, fixture.bucket, meta, { maxArticles: 1 });
    db.control.beforeRun = (sql) => {
      if (sql.startsWith("INSERT OR IGNORE")) throw new Error("temporary D1 failure");
    };
    await expect(
      rebuildFeedSearchIndexStep(db.binding, fixture.bucket, meta, { maxArticles: 1 }),
    ).rejects.toThrow("temporary D1 failure");
    expect(
      db.sqlite.prepare("SELECT status, next_article FROM article_search_feeds").get(),
    ).toMatchObject({ status: "failed", next_article: 1 });
    db.control.beforeRun = undefined;
    expect(
      (await rebuildFeedSearchIndexStep(db.binding, fixture.bucket, meta, { maxArticles: 1 }))
        .articleOffset,
    ).toBe(2);
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM article_search_articles").get()?.n).toBe(2);
    db.sqlite.close();
  });
});

describe("subscription absence and isolation", () => {
  it("ignores truly absent feed subscriptions, but does not hide missing existing source data", async () => {
    const db = database();
    const fixture = bucketFixture();
    expect(await search(db.binding, fixture, "query")).toEqual([]);
    fixture.objects.set("feeds/feed/meta.json", {
      etag: "meta",
      body: metadata("feed", { articleCount: 10 }),
    });
    // An old empty-feed index must not mask a subsequently missing populated head.
    db.sqlite
      .prepare(
        "INSERT INTO article_search_feeds (feed_hash, source_revision, status, token, title) VALUES ('feed', 'legacy:missing', 'ready', 'old', 'Feed')",
      )
      .run();
    await expect(search(db.binding, fixture, "query")).rejects.toThrow(
      "Missing latest article object",
    );
    db.sqlite.close();
  });

  it("scopes results and first-ID precedence to subscription order across multiple feeds", async () => {
    const db = database();
    const fixture = bucketFixture();
    const first = storeHead(
      fixture,
      "r1",
      [article("same", { title: "first", feedHash: "first" })],
      [],
      "first",
    );
    const second = storeHead(
      fixture,
      "r1",
      [
        article("same", { title: "second", feedHash: "second" }),
        article("private", { title: "private", feedHash: "second" }),
      ],
      [],
      "second",
    );
    await rebuildFeedSearchIndex(db.binding, fixture.bucket, first);
    await rebuildFeedSearchIndex(db.binding, fixture.bucket, second);
    expect(
      await search(db.binding, fixture, "second", {
        subscriptions: [subscription("first"), subscription("second")],
      }),
    ).toEqual([]);
    expect(
      (
        await search(db.binding, fixture, "second", {
          subscriptions: [subscription("second"), subscription("first")],
        })
      ).map((a) => a.id),
    ).toEqual(["same"]);
    expect(
      await search(db.binding, fixture, "private", { subscriptions: [subscription("first")] }),
    ).toEqual([]);
    db.sqlite.close();
  });
});

it("merges saved matches into the top K before hydrating shared references", async () => {
  const db = database();
  const fixture = bucketFixture();
  const meta = storeHead(fixture, "r1", [
    article("shared", { title: "needle", publishedAt: "2026-01-01" }),
  ]);
  await rebuildFeedSearchIndex(db.binding, fixture.bucket, meta);
  fixture.gets.length = 0;
  const saved = article("saved", {
    feedHash: "__saved__",
    title: "needle",
    publishedAt: null,
    createdAt: "2026-10-01",
  });
  expect(await search(db.binding, fixture, "needle", { savedArticles: [saved], limit: 1 })).toEqual(
    [saved],
  );
  expect(fixture.gets.filter((key) => key.includes("/articles/"))).toEqual([]);
  db.sqlite.close();
});
