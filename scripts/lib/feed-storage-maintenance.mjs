import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const FORMAT = "rss-feed-backup-v1";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) =>
  JSON.stringify(value, (_, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );

function prefixFor(feedHash) {
  if (!/^[a-f0-9]{16}$/.test(feedHash)) throw new Error("Invalid feed hash");
  return `feeds/${feedHash}/`;
}

function validateBudget(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${name}`);
}

/** List one feed only, refusing unexpectedly large inventories before downloading data. */
export async function inspectFeedStorage(
  bucket,
  feedHash,
  { maxBytes = 128 * 1024 * 1024, maxObjects = 10000 } = {},
) {
  validateBudget(maxBytes, "maxBytes");
  validateBudget(maxObjects, "maxObjects");
  const prefix = prefixFor(feedHash);
  const objects = [];
  const seen = new Set();
  let totalBytes = 0;
  let cursor;
  do {
    const page = await bucket.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const object of page.objects) {
      if (!object.key.startsWith(prefix) || seen.has(object.key)) {
        throw new Error("Unexpected or duplicate object in feed inventory");
      }
      if (!Number.isSafeInteger(object.size) || object.size < 0 || !object.etag) {
        throw new Error("Incomplete object metadata in feed inventory");
      }
      seen.add(object.key);
      totalBytes += object.size;
      objects.push({ key: object.key, size: object.size, etag: object.etag });
      if (objects.length > maxObjects || totalBytes > maxBytes) {
        throw new Error(
          "Feed exceeds the approved backup byte/object budget; inspect and raise it explicitly",
        );
      }
    }
    if (page.truncated && (!page.cursor || page.cursor === cursor)) {
      throw new Error("Feed inventory did not advance");
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  if (!seen.has(`${prefix}meta.json`)) throw new Error("Feed metadata does not exist");
  objects.sort((a, b) => a.key.localeCompare(b.key));
  return { objects, totalBytes };
}

function sameInventory(left, right) {
  return (
    canonical(left.objects.map(({ key, etag, size }) => ({ key, etag, size }))) ===
    canonical(right.objects.map(({ key, etag, size }) => ({ key, etag, size })))
  );
}

function sameMetadata(object, expected) {
  return (
    object &&
    object.etag === expected.etag &&
    object.size === expected.size &&
    canonical(object.httpMetadata ?? {}) === canonical(expected.httpMetadata ?? {}) &&
    canonical(object.customMetadata ?? {}) === canonical(expected.customMetadata ?? {})
  );
}

async function verifySourceMetadata(bucket, entries) {
  for (const entry of entries) {
    if (!sameMetadata(await bucket.head(entry.key), entry)) {
      throw new Error("Source object content or metadata changed; backup is not current");
    }
  }
}

function repairedMetaMetadata(original) {
  const httpMetadata = { ...original.httpMetadata, contentType: "application/json" };
  if (typeof httpMetadata.cacheExpiry === "string")
    httpMetadata.cacheExpiry = new Date(httpMetadata.cacheExpiry);
  return { httpMetadata, customMetadata: original.customMetadata };
}

async function hashFile(path) {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    size += chunk.length;
  }
  return { sha256: hash.digest("hex"), size };
}

/** A new private directory is mandatory. Partial backups are retained without a manifest. */
export async function backupFeedStorage(bucket, feedHash, directory, identity, budgets) {
  const before = await inspectFeedStorage(bucket, feedHash, budgets);
  await mkdir(directory, { recursive: false, mode: 0o700 });
  await mkdir(join(directory, "objects"), { mode: 0o700 });
  const records = [];
  for (const entry of before.objects) {
    const object = await bucket.get(entry.key);
    if (!object || object.etag !== entry.etag || object.size !== entry.size) {
      throw new Error(
        "Feed changed during backup; keep writers paused and use a new backup directory",
      );
    }
    const file = `objects/${digest(entry.key)}.bin`;
    const hash = createHash("sha256");
    let bytes = 0;
    async function* chunks() {
      for await (const chunk of object.body) {
        bytes += chunk.byteLength;
        if (bytes > entry.size) throw new Error("Object grew during backup");
        hash.update(chunk);
        yield chunk;
      }
    }
    await writeFile(join(directory, file), chunks(), { flag: "wx", mode: 0o600 });
    if (bytes !== entry.size) throw new Error("Incomplete backup object");
    const sha256 = hash.digest("hex");
    const disk = await hashFile(join(directory, file));
    if (disk.sha256 !== sha256 || disk.size !== bytes) throw new Error("Backup checksum mismatch");
    records.push({
      ...entry,
      file,
      sha256,
      httpMetadata: object.httpMetadata,
      customMetadata: object.customMetadata,
    });
  }
  const after = await inspectFeedStorage(bucket, feedHash, budgets);
  if (!sameInventory(before, after))
    throw new Error("Feed changed during backup; backup is not verified");
  await verifySourceMetadata(bucket, records);
  const manifest = {
    format: FORMAT,
    feedHash,
    identity,
    capturedAt: new Date().toISOString(),
    totalBytes: before.totalBytes,
    objects: records,
  };
  await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  return { objects: records.length, totalBytes: manifest.totalBytes };
}

/** Validate local backup identity and bytes without assuming its source is still legacy. */
async function readVerifiedLocalBackup(feedHash, directory, identity, budgets) {
  const text = await readFile(join(directory, "manifest.json"), "utf8");
  const manifest = JSON.parse(text);
  if (
    manifest.format !== FORMAT ||
    manifest.feedHash !== feedHash ||
    canonical(manifest.identity) !== canonical(identity) ||
    !Array.isArray(manifest.objects)
  ) {
    throw new Error("Backup identity does not match the selected feed and bindings");
  }
  const prefix = prefixFor(feedHash);
  const maxBytes = budgets?.maxBytes ?? 128 * 1024 * 1024;
  const maxObjects = budgets?.maxObjects ?? 10000;
  validateBudget(maxBytes, "maxBytes");
  validateBudget(maxObjects, "maxObjects");
  if (
    manifest.objects.length > maxObjects ||
    !Number.isSafeInteger(manifest.totalBytes) ||
    manifest.totalBytes < 0 ||
    manifest.totalBytes > maxBytes
  )
    throw new Error("Backup exceeds the approved budget");
  const seen = new Set();
  let totalBytes = 0;
  for (const entry of manifest.objects) {
    if (
      typeof entry.key !== "string" ||
      !entry.key.startsWith(prefix) ||
      seen.has(entry.key) ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      entry.file !== `objects/${digest(entry.key)}.bin` ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    ) {
      throw new Error("Invalid backup manifest entry");
    }
    seen.add(entry.key);
    totalBytes += entry.size;
    if (totalBytes > maxBytes) throw new Error("Backup exceeds the approved budget");
    const actual = await hashFile(join(directory, entry.file));
    if (actual.sha256 !== entry.sha256 || actual.size !== entry.size)
      throw new Error("Backup file is incomplete or modified");
  }
  if (totalBytes !== manifest.totalBytes) throw new Error("Backup size summary is inconsistent");
  return { manifest, manifestSha256: digest(text) };
}

/** Verify the complete current source, including newly added objects and metadata changes. */
export async function verifyFeedBackup(bucket, feedHash, directory, identity, budgets) {
  const verified = await readVerifiedLocalBackup(feedHash, directory, identity, budgets);
  const { manifest } = verified;
  const current = await inspectFeedStorage(bucket, feedHash, budgets);
  if (!sameInventory(manifest, current) || current.totalBytes !== manifest.totalBytes) {
    throw new Error(
      "Current feed differs from backup; do not migrate until a stable backup is verified",
    );
  }
  await verifySourceMetadata(bucket, manifest.objects);
  return verified;
}

async function readBackupArticles(manifest, directory, meta) {
  const pageCount = meta.pageCount ?? 0;
  if (!Number.isSafeInteger(pageCount) || pageCount < 0)
    throw new Error("Invalid legacy page count");
  const entries = manifest.objects.filter(({ key }) => {
    if (key.endsWith("/articles/latest.json")) return true;
    const page = key.match(/\/articles\/p(\d+)\.json$/);
    return page && Number(page[1]) >= 2 && Number(page[1]) <= Math.min(pageCount + 1, 500);
  });
  entries.sort((a, b) => {
    const page = (key) =>
      key.endsWith("/latest.json") ? 1 : Number(key.match(/\/p(\d+)\.json$/)[1]);
    return page(a.key) - page(b.key);
  });
  const articles = new Map();
  for (const entry of entries) {
    const value = JSON.parse(await readFile(join(directory, entry.file), "utf8"));
    if (!Array.isArray(value))
      throw new Error(
        "Explicit storage migration expects a legacy backup; already-v2 feeds only need indexing",
      );
    for (const article of value) {
      if (!article || typeof article.id !== "string") throw new Error("Invalid backed-up article");
      if (!articles.has(article.id)) articles.set(article.id, digest(canonical(article)));
    }
  }
  return articles;
}

async function verifyMigratedContents({
  bucket,
  feedHash,
  meta,
  revision,
  originalArticles,
  mirrored,
  readSnapshot,
  iterate,
}) {
  const latestKey = `${prefixFor(feedHash)}articles/latest.json`;
  const metaKey = `${prefixFor(feedHash)}meta.json`;
  const captured = await readSnapshot(bucket, feedHash, meta);
  const committedHead = await bucket.head(latestKey);
  if (
    captured.legacy ||
    captured.revision !== revision ||
    !captured.etag ||
    committedHead?.etag !== captured.etag ||
    committedHead?.customMetadata?.articleRevision !== revision
  ) {
    throw new Error("Committed revision changed before verification; keep writers paused");
  }
  const archiveHeads = [];
  for (const segment of captured.segments) {
    const object = await bucket.head(segment.objectKey);
    if (!object) throw new Error("Committed archive is missing before verification");
    archiveHeads.push({
      key: segment.objectKey,
      etag: object.etag,
      size: object.size,
      httpMetadata: object.httpMetadata,
      customMetadata: object.customMetadata,
    });
  }
  const actual = new Map();
  for await (const batch of iterate(bucket, feedHash, captured)) {
    for (const article of batch.articles) {
      if (actual.has(article.id)) throw new Error("Migrated feed contains duplicate article IDs");
      actual.set(article.id, digest(canonical(article)));
    }
  }
  if (
    actual.size !== originalArticles.size ||
    [...originalArticles].some(([id, hash]) => actual.get(id) !== hash)
  ) {
    throw new Error(
      "Post-migration article verification failed; keep writers paused and preserve backup and v2 objects",
    );
  }
  await verifySourceMetadata(bucket, archiveHeads);
  const finalHead = await bucket.head(latestKey);
  const finalMeta = await bucket.head(metaKey);
  if (
    !sameMetadata(finalHead, committedHead) ||
    finalHead?.customMetadata?.articleRevision !== revision ||
    finalHead?.customMetadata?.articleCount !== String(actual.size) ||
    finalHead?.customMetadata?.pageCount !== String(captured.pageCount) ||
    captured.articleCount !== actual.size ||
    !sameMetadata(finalMeta, mirrored)
  ) {
    throw new Error(
      "Committed revision or metadata changed during verification; keep writers paused",
    );
  }
  return actual.size;
}

/** Convert one quiescent legacy feed, gated by an exact verified backup. No index writes/deletes. */
export async function migrateBackedUpFeed({
  bucket,
  feedHash,
  directory,
  identity,
  budgets = {},
  writersPaused,
  migrate,
  iterate,
  readSnapshot,
}) {
  if (writersPaused !== true)
    throw new Error("Explicit confirmation of drained, paused writers is required");
  try {
    await access(join(directory, "migration-result.json"));
    throw new Error(
      "A migration receipt already exists; inspect it and the current source before another attempt",
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const { manifest, manifestSha256 } = await verifyFeedBackup(
    bucket,
    feedHash,
    directory,
    identity,
    budgets,
  );
  const expected = new Map(manifest.objects.map((entry) => [entry.key, entry]));
  const metaKey = `${prefixFor(feedHash)}meta.json`;
  const latestKey = `${prefixFor(feedHash)}articles/latest.json`;
  const metaRecord = expected.get(metaKey);
  const meta = JSON.parse(await readFile(join(directory, metaRecord.file), "utf8"));
  if (meta.feedHash !== feedHash) throw new Error("Backed-up feed metadata hash does not match");
  const originalArticles = await readBackupArticles(manifest, directory, meta);
  const checkedObject = (key, object) => {
    const original = expected.get(key);
    if (original ? !sameMetadata(object, original) : object !== null) {
      throw new Error("Source changed after backup verification; migration aborted");
    }
    return object;
  };
  const guardedBucket = {
    get: async (key, ...options) => checkedObject(key, await bucket.get(key, ...options)),
    head: async (key) => checkedObject(key, await bucket.head(key)),
    put: async (key, body, options) => {
      if (key === latestKey) return bucket.put(key, body, options);
      if (!key.startsWith(`${prefixFor(feedHash)}articles/segments/`) || expected.has(key))
        throw new Error("Migration attempted an unexpected object write");
      const result = await bucket.put(key, body, {
        ...options,
        onlyIf: new Headers({ "If-None-Match": "*" }),
      });
      if (result === null) throw new Error("Immutable migration segment already exists");
      return result;
    },
  };
  const result = await migrate(guardedBucket, meta);
  const receipt = {
    format: "rss-feed-migration-v1",
    feedHash,
    manifestSha256,
    migrated: result.migrated,
    revision: meta.articleRevision,
    metadataUpdated: false,
    articlesVerified: false,
  };
  // Record a committed head before the metadata mirror: failure here must not be called a rollback.
  await writeFile(
    join(directory, "migration-result.json"),
    JSON.stringify(receipt, null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  const mirrored = await bucket.put(metaKey, JSON.stringify(meta), {
    onlyIf: { etagMatches: metaRecord.etag },
    ...repairedMetaMetadata(metaRecord),
  });
  if (mirrored === null)
    throw new Error(
      "Head committed but metadata changed; keep writers paused and repair the mirror after inspection",
    );
  receipt.metadataUpdated = true;
  await writeFile(
    join(directory, "migration-result.json"),
    JSON.stringify(receipt, null, 2) + "\n",
    { mode: 0o600 },
  );
  const articleCount = await verifyMigratedContents({
    bucket,
    feedHash,
    meta,
    revision: receipt.revision,
    originalArticles,
    mirrored,
    readSnapshot,
    iterate,
  });
  receipt.articlesVerified = true;
  await writeFile(
    join(directory, "migration-result.json"),
    JSON.stringify(receipt, null, 2) + "\n",
    { mode: 0o600 },
  );
  return { migrated: result.migrated, revision: meta.articleRevision, articleCount };
}

/** Resume only a recorded v2 revision; reject drift instead of adopting unrelated live state. */
export async function resumeMigratedFeed({
  bucket,
  feedHash,
  directory,
  identity,
  budgets = {},
  writersPaused,
  migrate,
  iterate,
  readSnapshot,
  readOnly = false,
}) {
  if (!readOnly && writersPaused !== true)
    throw new Error("Explicit confirmation of drained, paused writers is required");
  const { manifest, manifestSha256 } = await readVerifiedLocalBackup(
    feedHash,
    directory,
    identity,
    budgets,
  );
  const receipt = JSON.parse(await readFile(join(directory, "migration-result.json"), "utf8"));
  if (
    receipt.format !== "rss-feed-migration-v1" ||
    receipt.feedHash !== feedHash ||
    receipt.manifestSha256 !== manifestSha256 ||
    typeof receipt.revision !== "string" ||
    !receipt.revision
  ) {
    throw new Error("Migration receipt does not match the verified backup");
  }
  const metaKey = `${prefixFor(feedHash)}meta.json`;
  const latestKey = `${prefixFor(feedHash)}articles/latest.json`;
  const metaRecord = manifest.objects.find((entry) => entry.key === metaKey);
  if (!metaRecord) throw new Error("Backup metadata is missing");
  const meta = JSON.parse(await readFile(join(directory, metaRecord.file), "utf8"));
  if (meta.feedHash !== feedHash) throw new Error("Backed-up feed metadata hash does not match");
  const originalArticles = await readBackupArticles(manifest, directory, meta);
  await verifySourceMetadata(
    bucket,
    manifest.objects.filter((entry) => entry.key !== metaKey && entry.key !== latestKey),
  );
  const captured = await readSnapshot(bucket, feedHash, meta);
  if (captured.legacy || captured.revision !== receipt.revision)
    throw new Error("Recorded migration revision is no longer current; keep writers paused");
  // The API repairs the in-memory mirror for v2. Deny PUT defensively if a concurrent
  // replacement changes the source back to legacy between the two reads.
  const recovered = await migrate(
    {
      get: bucket.get.bind(bucket),
      head: bucket.head.bind(bucket),
      put: async () => {
        throw new Error("Resume cannot publish another article revision");
      },
    },
    meta,
  );
  if (recovered.migrated || meta.articleRevision !== receipt.revision)
    throw new Error("Recorded migration revision changed during recovery");
  let mirrored = await bucket.get(metaKey);
  if (!mirrored) throw new Error("Feed metadata is missing during recovery");
  const currentMeta = await mirrored.json();
  const currentIsOriginal = sameMetadata(mirrored, metaRecord);
  const currentIsRepaired =
    canonical(currentMeta) === canonical(meta) &&
    canonical(mirrored.httpMetadata ?? {}) ===
      canonical(repairedMetaMetadata(metaRecord).httpMetadata) &&
    canonical(mirrored.customMetadata ?? {}) === canonical(metaRecord.customMetadata ?? {});
  if (!currentIsOriginal && !currentIsRepaired)
    throw new Error("Feed metadata changed independently; inspect before recovery");
  let articleCount = await verifyMigratedContents({
    bucket,
    feedHash,
    meta,
    revision: receipt.revision,
    originalArticles,
    mirrored,
    readSnapshot,
    iterate,
  });
  if (readOnly)
    return {
      verified: true,
      resumable: true,
      manifestSha256,
      revision: receipt.revision,
      articleCount,
      metadataUpdateRequired: !currentIsRepaired,
    };
  if (!currentIsRepaired) {
    mirrored = await bucket.put(metaKey, JSON.stringify(meta), {
      onlyIf: { etagMatches: mirrored.etag },
      ...repairedMetaMetadata(metaRecord),
    });
    if (!mirrored) throw new Error("Metadata changed during recovery; keep writers paused");
    articleCount = await verifyMigratedContents({
      bucket,
      feedHash,
      meta,
      revision: receipt.revision,
      originalArticles,
      mirrored,
      readSnapshot,
      iterate,
    });
  }
  receipt.metadataUpdated = true;
  receipt.articlesVerified = true;
  await writeFile(
    join(directory, "migration-result.json"),
    JSON.stringify(receipt, null, 2) + "\n",
    { mode: 0o600 },
  );
  return { migrated: false, resumed: true, revision: receipt.revision, articleCount };
}
