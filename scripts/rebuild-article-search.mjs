/**
 * Resume one feed's derived D1 index. Local-only by default; R2 is read-only.
 * Production use requires --remote, a separate remote:true binding config,
 * provisioned/migrated D1, paused feed writers, and explicit operator approval.
 */
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { getPlatformProxy, unstable_readConfig } from "wrangler";
import {
  getMaintenanceProxyOptions,
  requireRemoteSearchBindings,
} from "./lib/search-maintenance-options.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const { values } = parseArgs({
  options: {
    feed: { type: "string" },
    config: { type: "string", default: "config/search-index.local.jsonc" },
    "persist-to": { type: "string" },
    remote: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});
if (values.help) {
  console.log(
    "Usage: node scripts/rebuild-article-search.mjs --feed=<16-hex-feed-hash> [--config=<wrangler.jsonc>] [--persist-to=<local-state>] [--remote]",
  );
  console.log(
    "Defaults to isolated local bindings. --remote requires an operator-approved config whose RSS_DATA and ARTICLE_SEARCH bindings both set remote:true. Does not deploy, create a database, migrate SQL, or write R2.",
  );
  console.log(
    "--persist-to is a Wrangler state root (v3 is appended automatically); the default is .wrangler/state beside the selected config.",
  );
  process.exit(0);
}
if (!values.feed || !/^[a-f0-9]{16}$/.test(values.feed)) {
  throw new Error("--feed must be an existing 16-character lowercase hexadecimal feed hash");
}
if (values.remote && values.config === "config/search-index.local.jsonc") {
  throw new Error(
    "Remote maintenance requires an explicit provisioned remote binding config; the local dummy ID is never allowed",
  );
}
const configPath = resolve(root, values.config);
if (values.remote) {
  requireRemoteSearchBindings(unstable_readConfig({ config: configPath }));
}
const result = await build({
  entryPoints: [resolve(root, "src/lib/article-search-index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
  tsconfig: resolve(root, "tsconfig.json"),
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`;
const { rebuildFeedSearchIndexStep } = await import(moduleUrl);
const proxyOptions = getMaintenanceProxyOptions(configPath, {
  persistTo: values["persist-to"],
  remote: values.remote,
});
console.log(
  values.remote
    ? "Initializing explicitly selected remote bindings"
    : `Initializing local bindings at ${proxyOptions.persist.path}`,
);
const proxy = await getPlatformProxy(proxyOptions);
try {
  const { RSS_DATA: bucket, ARTICLE_SEARCH: db } = proxy.env;
  if (!bucket || !db) throw new Error("RSS_DATA and ARTICLE_SEARCH bindings are required");
  const object = await bucket.get(`feeds/${values.feed}/meta.json`);
  if (!object) throw new Error("Feed metadata was not found in the selected bindings");
  const meta = await object.json();
  if (meta.feedHash !== values.feed)
    throw new Error("Feed metadata hash does not match the requested feed");
  console.log(
    values.remote
      ? "Remote binding access enabled: R2 read-only; D1 derived-index writes"
      : "Local bindings only: no production access",
  );
  let revision;
  for (;;) {
    const progress = await rebuildFeedSearchIndexStep(db, bucket, meta);
    if (revision && revision !== progress.revision) {
      throw new Error(
        "Feed changed during backfill. Pause feed writers, then rerun to resume the current revision",
      );
    }
    revision = progress.revision;
    console.log(JSON.stringify({ feedHash: values.feed, ...progress }));
    if (progress.ready) break;
  }
} finally {
  await proxy.dispose();
}
