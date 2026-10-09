/**
 * Derived per-feed search index stored in R2.
 * A ready index answers `q=` with a constant number of objects per feed.
 * Article pages remain the source of truth; a failed index write must not roll them back.
 */
import type { Article, SharedFeedMeta } from "../types";
import {
  iterateFeedArticleBatches,
  readFeedArticleRevision,
  readFeedArticleSnapshot,
} from "./shared-feed-storage";

const MAX_INDEX_BYTES = 32 * 1024 * 1024;

export interface FeedR2SearchManifest {
  version: 1;
  sourceRevision: string;
  objectKey: string;
  docCount: number;
}

export function feedSearchManifestKey(feedHash: string): string {
  return `feeds/${feedHash}/search/manifest.json`;
}

function docsObjectKey(feedHash: string, revision: string): string {
  return `feeds/${feedHash}/search/docs/${revision}.json`;
}

function parseManifest(value: unknown, feedHash: string): FeedR2SearchManifest | null {
  if (!value || typeof value !== "object") return null;
  const manifest = value as FeedR2SearchManifest;
  const prefix = `feeds/${feedHash}/search/docs/`;
  if (
    manifest.version !== 1 ||
    typeof manifest.sourceRevision !== "string" ||
    manifest.sourceRevision.length === 0 ||
    typeof manifest.objectKey !== "string" ||
    !manifest.objectKey.startsWith(prefix) ||
    manifest.objectKey.includes("..") ||
    !Number.isSafeInteger(manifest.docCount) ||
    manifest.docCount < 0
  ) {
    return null;
  }
  return manifest;
}

async function readManifest(
  bucket: R2Bucket,
  feedHash: string,
): Promise<FeedR2SearchManifest | null> {
  const object = await bucket.get(feedSearchManifestKey(feedHash));
  if (!object) return null;
  return parseManifest(await object.json<unknown>(), feedHash);
}

async function readDocs(bucket: R2Bucket, objectKey: string): Promise<Article[] | null> {
  const object = await bucket.get(objectKey);
  if (!object) return null;
  const stored = await object.json<unknown>();
  if (!Array.isArray(stored)) return null;
  return stored as Article[];
}

async function writeIndex(
  bucket: R2Bucket,
  feedHash: string,
  revision: string,
  docs: Article[],
): Promise<void> {
  const body = JSON.stringify(docs);
  if (body.length > MAX_INDEX_BYTES) {
    throw new Error(`Search index for ${feedHash} exceeds ${MAX_INDEX_BYTES} bytes`);
  }
  const objectKey = docsObjectKey(feedHash, revision);
  const manifest: FeedR2SearchManifest = {
    version: 1,
    sourceRevision: revision,
    objectKey,
    docCount: docs.length,
  };
  await bucket.put(objectKey, body, {
    httpMetadata: { contentType: "application/json" },
  });
  await bucket.put(feedSearchManifestKey(feedHash), JSON.stringify(manifest), {
    httpMetadata: { contentType: "application/json" },
  });
}

/** Null when the index is absent, stale, or unreadable. Callers then scan article pages. */
export async function loadReadySearchIndex(
  bucket: R2Bucket,
  feedHash: string,
  revision: string,
): Promise<Article[] | null> {
  let manifest: FeedR2SearchManifest | null;
  try {
    manifest = await readManifest(bucket, feedHash);
  } catch (error) {
    console.error("R2 search manifest is unreadable", { feedHash, error });
    return null;
  }
  if (!manifest || manifest.sourceRevision !== revision) return null;
  try {
    const docs = await readDocs(bucket, manifest.objectKey);
    if (!docs || docs.length !== manifest.docCount) {
      console.error("R2 search index is missing or incomplete", { feedHash });
      return null;
    }
    return docs;
  } catch (error) {
    console.error("R2 search index is unreadable", { feedHash, error });
    return null;
  }
}

/** Replace the index from the current article snapshot. First physical copy of an id wins. */
export async function rebuildFeedR2SearchIndex(
  bucket: R2Bucket,
  feedHash: string,
  meta?: SharedFeedMeta | null,
): Promise<void> {
  const snapshot = await readFeedArticleSnapshot(bucket, feedHash, meta);
  const seen = new Set<string>();
  const docs: Article[] = [];
  for await (const batch of iterateFeedArticleBatches(bucket, feedHash, snapshot)) {
    for (const article of batch.articles) {
      if (seen.has(article.id)) continue;
      seen.add(article.id);
      docs.push(article);
    }
  }
  await writeIndex(bucket, feedHash, snapshot.revision, docs);
}

/**
 * Apply changed articles when the previous index revision is still current.
 * Returns false when a full rebuild is required. Does not read historical pages.
 */
export async function upsertFeedR2SearchIndex(
  bucket: R2Bucket,
  feedHash: string,
  previousRevision: string,
  nextRevision: string,
  upserts: Article[],
): Promise<boolean> {
  if (upserts.length === 0) return true;
  const manifest = await readManifest(bucket, feedHash);
  if (!manifest || manifest.sourceRevision !== previousRevision) return false;
  const docs = await readDocs(bucket, manifest.objectKey);
  if (!docs || docs.length !== manifest.docCount) return false;
  const byId = new Map(docs.map((article) => [article.id, article]));
  for (const article of upserts) byId.set(article.id, article);
  await writeIndex(bucket, feedHash, nextRevision, [...byId.values()]);
  return true;
}

/** Build or refresh the index. A no-op when the manifest already names the current revision. */
export async function ensureFeedR2SearchIndex(
  bucket: R2Bucket,
  feedHash: string,
  meta?: SharedFeedMeta | null,
): Promise<void> {
  const revision = await readFeedArticleRevision(bucket, feedHash, meta);
  if (revision === "legacy:missing") return;
  const manifest = await readManifest(bucket, feedHash);
  if (manifest?.sourceRevision === revision) return;
  await rebuildFeedR2SearchIndex(bucket, feedHash, meta);
}

/** Incremental update when possible; otherwise rebuild from the committed snapshot. */
export async function syncFeedR2SearchIndex(
  bucket: R2Bucket,
  feedHash: string,
  previousRevision: string,
  nextRevision: string,
  upserts: Article[],
  meta?: SharedFeedMeta | null,
): Promise<void> {
  if (
    upserts.length > 0 &&
    nextRevision &&
    (await upsertFeedR2SearchIndex(bucket, feedHash, previousRevision, nextRevision, upserts))
  ) {
    return;
  }
  await ensureFeedR2SearchIndex(bucket, feedHash, meta);
}
