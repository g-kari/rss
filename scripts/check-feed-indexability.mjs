/** Read-only row-size preflight against a verified per-feed backup, before any schema/conversion. */
import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { getPlatformProxy, unstable_readConfig } from "wrangler";
import { getMaintenanceProxyOptions } from "./lib/search-maintenance-options.mjs";
import { verifyFeedBackup, resumeMigratedFeed } from "./lib/feed-storage-maintenance.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const { values } = parseArgs({
  options: {
    feed: { type: "string" },
    config: { type: "string", default: "config/search-index.local.jsonc" },
    "persist-to": { type: "string" },
    "backup-dir": { type: "string" },
    "max-bytes": { type: "string", default: String(128 * 1024 * 1024) },
    "max-objects": { type: "string", default: "10000" },
    remote: { type: "boolean", default: false },
  },
});
if (!values.feed || !/^[a-f0-9]{16}$/.test(values.feed) || !values["backup-dir"])
  throw new Error("A valid --feed and --backup-dir are required");
const configPath = resolve(root, values.config);
const config = unstable_readConfig({ config: configPath });
const source = config.r2_buckets.find((binding) => binding.binding === "RSS_DATA");
if (!source?.bucket_name) throw new Error("RSS_DATA bucket configuration is required");
if (values.remote && (!source.remote || !/^[a-f0-9]{32}$/i.test(config.account_id ?? "")))
  throw new Error(
    "Remote preflight requires explicit remote:true RSS_DATA and verified account_id",
  );
const identity = {
  mode: values.remote ? "remote" : "local",
  accountId: values.remote ? config.account_id : null,
  bucketName: source.bucket_name,
};
const budgets = {
  maxBytes: Number(values["max-bytes"]),
  maxObjects: Number(values["max-objects"]),
};
if (Object.values(budgets).some((value) => !Number.isSafeInteger(value) || value < 1))
  throw new Error("Byte/object budgets must be positive safe integers");
const directory = resolve(values["backup-dir"]);
const compiled = await build({
  stdin: {
    contents:
      'export * from "./src/lib/shared-feed-storage.ts"; export {serializeSearchIndexArticle} from "./src/lib/article-search-index.ts";',
    resolveDir: root,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
  tsconfig: resolve(root, "tsconfig.json"),
});
const library = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString("base64")}`
);
const proxy = await getPlatformProxy(
  getMaintenanceProxyOptions(configPath, {
    persistTo: values["persist-to"],
    remote: values.remote,
  }),
);
try {
  const bucket = proxy.env.RSS_DATA;
  if (existsSync(join(directory, "migration-result.json"))) {
    await resumeMigratedFeed({
      bucket,
      feedHash: values.feed,
      directory,
      identity,
      budgets,
      writersPaused: false,
      readOnly: true,
      migrate: library.migrateFeedArticleStorage,
      iterate: library.iterateFeedArticleBatches,
      readSnapshot: library.readFeedArticleSnapshot,
    });
  } else {
    await verifyFeedBackup(bucket, values.feed, directory, identity, budgets);
  }
  const metaObject = await bucket.get(`feeds/${values.feed}/meta.json`);
  if (!metaObject) throw new Error("Feed metadata is missing");
  const meta = await metaObject.json();
  const snapshot = await library.readFeedArticleSnapshot(bucket, values.feed, meta);
  if (!snapshot.exists)
    throw new Error("Article head is missing; inspect empty/uninitialized feeds before conversion");
  let articleRecords = 0,
    normalizedBytes = 0,
    largestRowBytes = 0;
  for await (const batch of library.iterateFeedArticleBatches(bucket, values.feed, snapshot)) {
    for (const article of batch.articles) {
      // Reserve the maximum safe ordinal width so reordering/splitting cannot push a
      // near-limit row over the byte cap after the storage conversion.
      const { bytes } = library.serializeSearchIndexArticle(article, Number.MAX_SAFE_INTEGER);
      articleRecords++;
      normalizedBytes += bytes;
      largestRowBytes = Math.max(largestRowBytes, bytes);
    }
  }
  if (
    (await library.readFeedArticleRevision(bucket, values.feed, meta)) !== snapshot.revision ||
    (await bucket.head(`feeds/${values.feed}/meta.json`))?.etag !== metaObject.etag
  )
    throw new Error("Feed changed during indexability preflight");
  console.log(
    JSON.stringify({
      feedHash: values.feed,
      indexable: true,
      articleRecords,
      normalizedBytes,
      largestRowBytes,
      writesR2: false,
      writesD1: false,
    }),
  );
} finally {
  await proxy.dispose();
}
