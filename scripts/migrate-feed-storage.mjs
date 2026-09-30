/** Per-feed bounded backup and explicit storage conversion. No deploy, provisioning or deletion. */
import { parseArgs } from "node:util";
import { resolve, join, dirname, basename, sep } from "node:path";
import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { getPlatformProxy, unstable_readConfig } from "wrangler";
import { getMaintenanceProxyOptions } from "./lib/search-maintenance-options.mjs";
import {
  inspectFeedStorage,
  backupFeedStorage,
  verifyFeedBackup,
  migrateBackedUpFeed,
  resumeMigratedFeed,
} from "./lib/feed-storage-maintenance.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const { values } = parseArgs({
  options: {
    feed: { type: "string" },
    operation: { type: "string", default: "inspect" },
    config: { type: "string", default: "config/search-index.local.jsonc" },
    "persist-to": { type: "string" },
    "backup-dir": { type: "string" },
    "max-bytes": { type: "string", default: String(128 * 1024 * 1024) },
    "max-objects": { type: "string", default: "10000" },
    "writers-paused": { type: "boolean", default: false },
    remote: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});
if (values.help) {
  console.log(
    "Usage: node scripts/migrate-feed-storage.mjs --feed=<16-hex-hash> --operation=inspect|backup|verify|migrate|resume [--backup-dir=<private-directory>] [--config=<wrangler.jsonc>] [--persist-to=<state-base>] [--max-bytes=134217728] [--max-objects=10000] [--writers-paused] [--remote]",
  );
  console.log(
    "Local-only by default. inspect/backup/verify never write R2. migrate requires a matching verified backup and --writers-paused, writes immutable segments/head/meta only, verifies article contents, and never deletes data. --writers-paused is an operator assertion, not a command to stop production writers.",
  );
  process.exit(0);
}
if (!values.feed || !/^[a-f0-9]{16}$/.test(values.feed))
  throw new Error("--feed must be an existing lowercase hexadecimal feed hash");
if (!["inspect", "backup", "verify", "migrate", "resume"].includes(values.operation))
  throw new Error("Unknown operation");
if (values.operation !== "inspect" && !values["backup-dir"])
  throw new Error("--backup-dir is required");
const writesR2 = ["migrate", "resume"].includes(values.operation);
if (writesR2 && !values["writers-paused"])
  throw new Error("Drain and pause all writers before explicitly passing --writers-paused");
const budgets = {
  maxBytes: Number(values["max-bytes"]),
  maxObjects: Number(values["max-objects"]),
};
if (Object.values(budgets).some((value) => !Number.isSafeInteger(value) || value < 1))
  throw new Error("Byte/object budgets must be positive safe integers");
const configPath = resolve(root, values.config);
const config = unstable_readConfig({ config: configPath });
const binding = config.r2_buckets.find((entry) => entry.binding === "RSS_DATA");
if (!binding?.bucket_name) throw new Error("RSS_DATA bucket configuration is required");
if (values.remote && (!binding.remote || !/^[a-f0-9]{32}$/i.test(config.account_id ?? ""))) {
  throw new Error(
    "Remote use requires an explicit remote:true RSS_DATA binding and verified account_id in a separate maintenance config",
  );
}
const identity = {
  mode: values.remote ? "remote" : "local",
  accountId: values.remote ? config.account_id : null,
  bucketName: binding.bucket_name,
};
const directory = values["backup-dir"] ? resolve(values["backup-dir"]) : undefined;
if (directory && values.operation !== "inspect") {
  const realRoot = await realpath(root);
  const realDirectory = existsSync(directory)
    ? await realpath(directory)
    : join(await realpath(dirname(directory)), basename(directory));
  if (realDirectory === realRoot || realDirectory.startsWith(`${realRoot}${sep}`))
    throw new Error("Choose a private backup directory outside this repository");
}
const verifyReceipt =
  values.operation === "verify" &&
  directory &&
  existsSync(join(directory, "migration-result.json"));
let storage;
if (writesR2 || verifyReceipt) {
  const compiled = await build({
    entryPoints: [resolve(root, "src/lib/shared-feed-storage.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    write: false,
    tsconfig: resolve(root, "tsconfig.json"),
  });
  storage = await import(
    `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString("base64")}`
  );
}
console.log(
  JSON.stringify({
    mode: identity.mode,
    operation: values.operation,
    feedHash: values.feed,
    writesR2,
    ...budgets,
  }),
);
const proxy = await getPlatformProxy(
  getMaintenanceProxyOptions(configPath, {
    persistTo: values["persist-to"],
    remote: values.remote,
  }),
);
try {
  const bucket = proxy.env.RSS_DATA;
  if (!bucket) throw new Error("RSS_DATA binding is missing");
  let result;
  if (values.operation === "inspect") {
    const inventory = await inspectFeedStorage(bucket, values.feed, budgets);
    result = {
      objects: inventory.objects.length,
      totalBytes: inventory.totalBytes,
      largestObjectBytes: Math.max(0, ...inventory.objects.map((entry) => entry.size)),
    };
  } else if (values.operation === "backup") {
    result = await backupFeedStorage(bucket, values.feed, directory, identity, budgets);
  } else if (values.operation === "verify" && !verifyReceipt) {
    const verified = await verifyFeedBackup(bucket, values.feed, directory, identity, budgets);
    result = {
      verified: true,
      manifestSha256: verified.manifestSha256,
      objects: verified.manifest.objects.length,
      totalBytes: verified.manifest.totalBytes,
    };
  } else {
    const perform =
      values.operation === "resume" || verifyReceipt ? resumeMigratedFeed : migrateBackedUpFeed;
    result = await perform({
      bucket,
      feedHash: values.feed,
      directory,
      identity,
      budgets,
      writersPaused: values["writers-paused"],
      migrate: storage.migrateFeedArticleStorage,
      iterate: storage.iterateFeedArticleBatches,
      readSnapshot: storage.readFeedArticleSnapshot,
      ...(verifyReceipt ? { readOnly: true } : {}),
    });
  }
  console.log(JSON.stringify({ feedHash: values.feed, ...result }));
} finally {
  await proxy.dispose();
}
