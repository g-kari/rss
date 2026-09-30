// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  backupFeedStorage,
  inspectFeedStorage,
  migrateBackedUpFeed,
  resumeMigratedFeed,
  verifyFeedBackup,
} from "../../scripts/lib/feed-storage-maintenance.mjs";
import {
  iterateFeedArticleBatches,
  migrateFeedArticleStorage,
  readFeedArticleSnapshot,
} from "./shared-feed-storage";
import type { Article, FeedArticleSnapshot, SharedFeedMeta } from "../types";

const hash = "0123456789abcdef";
const prefix = `feeds/${hash}/`;
const identity = { mode: "local", accountId: null, bucketName: "rss-reader-data" };
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function directory() {
  const parent = await mkdtemp(join(tmpdir(), "rss-feed-backup-test-"));
  directories.push(parent);
  return join(parent, "backup");
}

function article(id: number): Article {
  return {
    id: String(id),
    feedHash: hash,
    guid: String(id),
    title: `東京 ${id}`,
    content: `<p>記事 ${id}</p>`,
    summary: "要約",
    link: `https://example.com/${id}`,
    publishedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, id)).toISOString(),
    createdAt: "2026-01-01T00:00:00Z",
  };
}

function source(count = 501) {
  const records = new Map<
    string,
    { text: string; etag: string; customMetadata: Record<string, string> }
  >();
  const writes: string[] = [];
  let gets = 0;
  let onGet: ((key: string) => void) | undefined;
  let rejectHead = false;
  let rejectMeta = false;
  const set = (key: string, value: unknown) => {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    records.set(key, {
      text,
      etag: createHash("sha256").update(text).digest("hex"),
      customMetadata: {},
    });
  };
  const articles = Array.from({ length: count }, (_, i) => article(count - i));
  const meta: SharedFeedMeta = {
    feedHash: hash,
    url: "https://example.com/feed",
    title: "Test",
    siteUrl: "https://example.com",
    lastFetchedAt: null,
    fetchError: null,
    articleCount: count,
    pageCount: Math.max(0, Math.ceil(count / 500) - 1),
    knownIds: articles.map((value) => value.id),
  };
  set(`${prefix}meta.json`, meta);
  set(`${prefix}articles/latest.json`, articles.slice(0, 500));
  for (let offset = 500; offset < count; offset += 500)
    set(`${prefix}articles/p${offset / 500 + 1}.json`, articles.slice(offset, offset + 500));
  const object = (key: string) => {
    const value = records.get(key);
    if (!value) return null;
    return {
      key,
      etag: value.etag,
      size: Buffer.byteLength(value.text),
      customMetadata: value.customMetadata,
      httpMetadata: { contentType: "application/json" },
      body: new Response(value.text).body!,
      json: async () => JSON.parse(value.text),
      text: async () => value.text,
    };
  };
  const bucket = {
    async get(key: string) {
      gets++;
      onGet?.(key);
      return object(key);
    },
    async head(key: string) {
      return object(key);
    },
    async list({ prefix: selectedPrefix }: { prefix: string }) {
      return {
        truncated: false,
        objects: [...records.keys()]
          .filter((key) => key.startsWith(selectedPrefix))
          .map((key) => object(key)!),
      };
    },
    async put(key: string, text: string, options?: R2PutOptions) {
      if (
        (rejectHead && key.endsWith("/latest.json")) ||
        (rejectMeta && key.endsWith("/meta.json"))
      )
        return null;
      const condition = options?.onlyIf;
      if (condition instanceof Headers) {
        if (condition.get("If-None-Match") === "*" && records.has(key)) return null;
      } else if (condition?.etagMatches && records.get(key)?.etag !== condition.etagMatches)
        return null;
      writes.push(key);
      set(key, text);
      records.get(key)!.customMetadata = options?.customMetadata ?? {};
      return object(key);
    },
  } as unknown as R2Bucket;
  return {
    bucket,
    records,
    writes,
    articles,
    set,
    get gets() {
      return gets;
    },
    onGet(callback: (key: string) => void) {
      onGet = callback;
    },
    rejectHead() {
      rejectHead = true;
    },
    rejectMeta() {
      rejectMeta = true;
    },
    allowMeta() {
      rejectMeta = false;
    },
  };
}

describe("verified feed backup and explicit migration", () => {
  it("verifies and resumes a complete receipt without rewriting any source object", async () => {
    const input = source();
    const backup = await directory();
    await backupFeedStorage(input.bucket, hash, backup, identity);
    const options = {
      bucket: input.bucket,
      feedHash: hash,
      directory: backup,
      identity,
      writersPaused: true,
      migrate: migrateFeedArticleStorage,
      iterate: iterateFeedArticleBatches,
      readSnapshot: readFeedArticleSnapshot,
    };
    const migrated = await migrateBackedUpFeed(options);
    const before = [...input.writes];
    const receipt = await readFile(join(backup, "migration-result.json"), "utf8");
    await expect(
      resumeMigratedFeed({ ...options, writersPaused: false, readOnly: true }),
    ).resolves.toMatchObject({
      verified: true,
      resumable: true,
      metadataUpdateRequired: false,
      revision: migrated.revision,
    });
    expect(await readFile(join(backup, "migration-result.json"), "utf8")).toBe(receipt);
    await expect(resumeMigratedFeed(options)).resolves.toMatchObject({
      resumed: true,
      migrated: false,
      articleCount: 501,
      revision: migrated.revision,
    });
    expect(input.writes).toEqual(before);
  });

  it("resumes a committed-head interruption only after validating data, then repairs its original metadata", async () => {
    const input = source();
    const backup = await directory();
    await backupFeedStorage(input.bucket, hash, backup, identity);
    const options = {
      bucket: input.bucket,
      feedHash: hash,
      directory: backup,
      identity,
      writersPaused: true,
      migrate: migrateFeedArticleStorage,
      iterate: iterateFeedArticleBatches,
      readSnapshot: readFeedArticleSnapshot,
    };
    input.rejectMeta();
    await expect(migrateBackedUpFeed(options)).rejects.toThrow("Head committed");
    const head = input.records.get(`${prefix}articles/latest.json`)!.text;
    const before = [...input.writes];
    const receipt = await readFile(join(backup, "migration-result.json"), "utf8");
    await expect(
      resumeMigratedFeed({ ...options, writersPaused: false, readOnly: true }),
    ).resolves.toMatchObject({ verified: true, metadataUpdateRequired: true });
    expect(input.writes).toEqual(before);
    expect(await readFile(join(backup, "migration-result.json"), "utf8")).toBe(receipt);
    input.allowMeta();
    await expect(resumeMigratedFeed(options)).resolves.toMatchObject({
      resumed: true,
      articleCount: 501,
    });
    expect(input.records.get(`${prefix}articles/latest.json`)!.text).toBe(head);
    expect(input.writes).toEqual([...before, `${prefix}meta.json`]);
    expect(JSON.parse(await readFile(join(backup, "migration-result.json"), "utf8"))).toMatchObject(
      { metadataUpdated: true, articlesVerified: true },
    );
  });

  it.each(["revision", "metadata"])(
    "refuses to resume an independently changed %s",
    async (target) => {
      const input = source(1);
      const backup = await directory();
      await backupFeedStorage(input.bucket, hash, backup, identity);
      const options = {
        bucket: input.bucket,
        feedHash: hash,
        directory: backup,
        identity,
        writersPaused: true,
        migrate: migrateFeedArticleStorage,
        iterate: iterateFeedArticleBatches,
        readSnapshot: readFeedArticleSnapshot,
      };
      await migrateBackedUpFeed(options);
      if (target === "revision") {
        const key = `${prefix}articles/latest.json`;
        const value = JSON.parse(input.records.get(key)!.text);
        input.set(key, { ...value, revision: "another-commit" });
      } else {
        const key = `${prefix}meta.json`;
        input.set(key, {
          ...JSON.parse(input.records.get(key)!.text),
          title: "changed independently",
        });
      }
      const before = [...input.writes];
      await expect(resumeMigratedFeed(options)).rejects.toThrow(
        target === "revision" ? "no longer current" : "changed independently",
      );
      expect(input.writes).toEqual(before);
    },
  );

  it("retains the first legacy latest duplicate before verifying committed contents", async () => {
    const input = source(1);
    const first = input.articles[0];
    input.set(`${prefix}articles/latest.json`, [
      first,
      { ...first, title: "Conflicting later duplicate" },
    ]);
    const backup = await directory();
    await backupFeedStorage(input.bucket, hash, backup, identity);
    const result = await migrateBackedUpFeed({
      bucket: input.bucket,
      feedHash: hash,
      directory: backup,
      identity,
      writersPaused: true,
      migrate: migrateFeedArticleStorage,
      iterate: iterateFeedArticleBatches,
      readSnapshot: readFeedArticleSnapshot,
    });
    expect(result).toMatchObject({ migrated: true, articleCount: 1 });
    expect(JSON.parse(input.records.get(`${prefix}articles/latest.json`)!.text).articles).toEqual([
      first,
    ]);
  });

  it.each(["legacy head", "head metadata", "feed metadata"])(
    "does not report verification success after a concurrent %s change",
    async (target) => {
      const input = source(1);
      const originalHead = input.records.get(`${prefix}articles/latest.json`)!.text;
      const backup = await directory();
      await backupFeedStorage(input.bucket, hash, backup, identity);
      async function* racingIterator(
        bucket: R2Bucket,
        feedHash: string,
        snapshot?: FeedArticleSnapshot,
      ) {
        if (target === "legacy head") input.set(`${prefix}articles/latest.json`, originalHead);
        else {
          const key =
            target === "head metadata" ? `${prefix}articles/latest.json` : `${prefix}meta.json`;
          const record = input.records.get(key)!;
          record.customMetadata = { ...record.customMetadata, changed: "concurrently" };
        }
        yield* iterateFeedArticleBatches(bucket, feedHash, snapshot);
      }
      await expect(
        migrateBackedUpFeed({
          bucket: input.bucket,
          feedHash: hash,
          directory: backup,
          identity,
          writersPaused: true,
          migrate: migrateFeedArticleStorage,
          iterate: racingIterator,
          readSnapshot: readFeedArticleSnapshot,
        }),
      ).rejects.toThrow("changed during verification");
      expect(
        JSON.parse(await readFile(join(backup, "migration-result.json"), "utf8")),
      ).toMatchObject({ metadataUpdated: true, articlesVerified: false });
    },
  );

  it("backs up every object and verifies all referenced article contents after real migration", async () => {
    const input = source(601);
    input.set(`${prefix}articles/p99.json`, [article(9999)]); // Orphan objects are retained, not treated as live articles.
    const backup = await directory();
    const saved = await backupFeedStorage(input.bucket, hash, backup, identity);
    expect(saved.objects).toBe(4);
    expect(input.writes).toEqual([]);
    const verified = await verifyFeedBackup(input.bucket, hash, backup, identity);
    expect(verified.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    const result = await migrateBackedUpFeed({
      bucket: input.bucket,
      feedHash: hash,
      directory: backup,
      identity,
      writersPaused: true,
      migrate: migrateFeedArticleStorage,
      iterate: iterateFeedArticleBatches,
      readSnapshot: readFeedArticleSnapshot,
    });
    expect(result).toMatchObject({ migrated: true, articleCount: 601 });
    expect(JSON.parse(input.records.get(`${prefix}articles/latest.json`)!.text).version).toBe(2);
    expect(input.records.has(`${prefix}articles/p99.json`)).toBe(true);
    expect(JSON.parse(await readFile(join(backup, "migration-result.json"), "utf8"))).toMatchObject(
      { metadataUpdated: true, articlesVerified: true },
    );
    expect(input.writes).toEqual([`${prefix}articles/latest.json`, `${prefix}meta.json`]);
  });

  it("rejects a byte budget before downloading or creating a backup", async () => {
    const input = source();
    const backup = await directory();
    await expect(
      backupFeedStorage(input.bucket, hash, backup, identity, { maxBytes: 1 }),
    ).rejects.toThrow("budget");
    expect(input.gets).toBe(0);
    await expect(access(backup)).rejects.toThrow();
  });

  it("retains partial files without a valid manifest when the source changes during backup", async () => {
    const input = source();
    const backup = await directory();
    input.onGet((key) => {
      if (key.endsWith("/meta.json")) input.set(key, { changed: true });
    });
    await expect(backupFeedStorage(input.bucket, hash, backup, identity)).rejects.toThrow(
      "changed",
    );
    await expect(access(join(backup, "objects"))).resolves.toBeUndefined();
    await expect(access(join(backup, "manifest.json"))).rejects.toThrow();
    expect(input.writes).toEqual([]);
  });

  it("refuses modified local backup data before any source writes", async () => {
    const input = source();
    const backup = await directory();
    await backupFeedStorage(input.bucket, hash, backup, identity);
    const manifest = JSON.parse(await readFile(join(backup, "manifest.json"), "utf8"));
    await writeFile(join(backup, manifest.objects[0].file), "corrupt");
    await expect(
      migrateBackedUpFeed({
        bucket: input.bucket,
        feedHash: hash,
        directory: backup,
        identity,
        writersPaused: true,
        migrate: migrateFeedArticleStorage,
        iterate: iterateFeedArticleBatches,
        readSnapshot: readFeedArticleSnapshot,
      }),
    ).rejects.toThrow("modified");
    expect(input.writes).toEqual([]);
  });

  it("detects R2 metadata changes even when content ETag is unchanged", async () => {
    const input = source();
    const backup = await directory();
    await backupFeedStorage(input.bucket, hash, backup, identity);
    input.records.get(`${prefix}meta.json`)!.customMetadata = { changed: "true" };
    await expect(verifyFeedBackup(input.bucket, hash, backup, identity)).rejects.toThrow(
      "metadata changed",
    );
    expect(input.writes).toEqual([]);
  });

  it("rejects identity mismatch, new source objects and absent pause acknowledgement", async () => {
    const input = source();
    const backup = await directory();
    await backupFeedStorage(input.bucket, hash, backup, identity);
    await expect(
      verifyFeedBackup(input.bucket, hash, backup, { ...identity, bucketName: "other" }),
    ).rejects.toThrow("identity");
    await expect(
      migrateBackedUpFeed({
        bucket: input.bucket,
        feedHash: hash,
        directory: backup,
        identity,
        writersPaused: false,
        migrate: migrateFeedArticleStorage,
        iterate: iterateFeedArticleBatches,
        readSnapshot: readFeedArticleSnapshot,
      }),
    ).rejects.toThrow("confirmation");
    input.set(`${prefix}articles/unexpected.json`, []);
    await expect(verifyFeedBackup(input.bucket, hash, backup, identity)).rejects.toThrow("differs");
    expect(input.writes).toEqual([]);
  });

  it("detects a source change after verification and before the migration snapshot", async () => {
    const input = source();
    const backup = await directory();
    await backupFeedStorage(input.bucket, hash, backup, identity);
    input.onGet((key) => {
      if (key.endsWith("/latest.json")) input.set(key, [article(999)]);
    });
    await expect(
      migrateBackedUpFeed({
        bucket: input.bucket,
        feedHash: hash,
        directory: backup,
        identity,
        writersPaused: true,
        migrate: migrateFeedArticleStorage,
        iterate: iterateFeedArticleBatches,
        readSnapshot: readFeedArticleSnapshot,
      }),
    ).rejects.toThrow("Source changed");
    expect(input.writes).toEqual([]);
  });

  it("does not overwrite a head that rejects conditional publication", async () => {
    const input = source();
    const backup = await directory();
    const original = input.records.get(`${prefix}articles/latest.json`)!.text;
    await backupFeedStorage(input.bucket, hash, backup, identity);
    input.rejectHead();
    await expect(
      migrateBackedUpFeed({
        bucket: input.bucket,
        feedHash: hash,
        directory: backup,
        identity,
        writersPaused: true,
        migrate: migrateFeedArticleStorage,
        iterate: iterateFeedArticleBatches,
        readSnapshot: readFeedArticleSnapshot,
      }),
    ).rejects.toThrow();
    expect(input.records.get(`${prefix}articles/latest.json`)!.text).toBe(original);
    expect(input.writes).toEqual([]);
  });

  it("records a committed head if metadata CAS fails, retaining data and backup for recovery", async () => {
    const input = source();
    const backup = await directory();
    const originalMeta = input.records.get(`${prefix}meta.json`)!.text;
    await backupFeedStorage(input.bucket, hash, backup, identity);
    input.rejectMeta();
    await expect(
      migrateBackedUpFeed({
        bucket: input.bucket,
        feedHash: hash,
        directory: backup,
        identity,
        writersPaused: true,
        migrate: migrateFeedArticleStorage,
        iterate: iterateFeedArticleBatches,
        readSnapshot: readFeedArticleSnapshot,
      }),
    ).rejects.toThrow("Head committed");
    expect(JSON.parse(await readFile(join(backup, "migration-result.json"), "utf8"))).toMatchObject(
      { migrated: true, metadataUpdated: false, articlesVerified: false },
    );
    expect(input.records.get(`${prefix}meta.json`)!.text).toBe(originalMeta);
    expect(JSON.parse(input.records.get(`${prefix}articles/latest.json`)!.text).version).toBe(2);
    await expect(access(join(backup, "manifest.json"))).resolves.toBeUndefined();
  });

  it("rejects unsafe feed hashes and reusing backup directories", async () => {
    const input = source();
    await expect(inspectFeedStorage(input.bucket, "../wrong")).rejects.toThrow("Invalid feed");
    const backup = await directory();
    await backupFeedStorage(input.bucket, hash, backup, identity);
    await expect(backupFeedStorage(input.bucket, hash, backup, identity)).rejects.toThrow();
    expect(input.writes).toEqual([]);
  });
});
