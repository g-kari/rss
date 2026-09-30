/** Explicit per-feed maintenance pipeline. Never provisions, deploys or changes writer state. */
import { spawnSync } from "node:child_process";
import { access, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { unstable_readConfig } from "wrangler";
import { requireRemoteSearchBindings } from "./lib/search-maintenance-options.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const { values } = parseArgs({
  options: {
    feed: { type: "string" },
    phase: { type: "string", default: "inspect" },
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
    "Usage: npm run migrate:feed -- --feed=<16-hex-hash> [--phase=inspect|backup|apply] [--config=<wrangler.jsonc>] [--persist-to=<state-root>] [--backup-dir=<private-directory>] [--max-bytes=134217728] [--max-objects=10000] [--writers-paused] [--remote]",
  );
  console.log(
    "Default inspect is read-only. backup creates a new private bounded backup. apply verifies an existing backup, applies D1 migrations, converts/resumes storage, then rebuilds search. It requires --writers-paused after the operator has actually paused and drained writers. No provisioning, deployment, automatic pause or automatic resume.",
  );
  process.exit(0);
}
if (!values.feed || !/^[a-f0-9]{16}$/.test(values.feed))
  throw new Error("--feed must be an existing lowercase hexadecimal feed hash");
if (!["inspect", "backup", "apply"].includes(values.phase)) throw new Error("Unknown phase");
if (values.phase !== "inspect" && !values["backup-dir"])
  throw new Error("--backup-dir is required");
if (values.phase === "apply" && !values["writers-paused"])
  throw new Error(
    "Activate the maintenance guard and drain writers before passing --writers-paused",
  );
for (const key of ["max-bytes", "max-objects"]) {
  const budget = Number(values[key]);
  if (!Number.isSafeInteger(budget) || budget < 1)
    throw new Error(`--${key} must be a positive safe integer`);
}

const configPath = resolve(root, values.config);
const directory = values["backup-dir"] ? resolve(values["backup-dir"]) : undefined;
const sourceArgs = [
  `--feed=${values.feed}`,
  `--config=${configPath}`,
  ...(values["persist-to"] ? [`--persist-to=${values["persist-to"]}`] : []),
  ...(values.remote ? ["--remote"] : []),
];
const storageArgs = [
  ...sourceArgs,
  ...(directory ? [`--backup-dir=${directory}`] : []),
  `--max-bytes=${values["max-bytes"]}`,
  `--max-objects=${values["max-objects"]}`,
];
const storageScript = resolve(root, "scripts/migrate-feed-storage.mjs");
function run(step, script, args) {
  console.log(
    JSON.stringify({
      phase: values.phase,
      step,
      feedHash: values.feed,
      mode: values.remote ? "remote" : "local",
    }),
  );
  // Inherit cwd so explicit relative --persist-to has the same meaning for every child.
  const result = spawnSync(process.execPath, [script, ...args], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${basename(script)} failed (${result.signal ?? result.status}); pipeline stopped, keep writers paused if apply had started`,
    );
}

if (values.phase === "inspect" || values.phase === "backup") {
  run(values.phase, storageScript, [...storageArgs, `--operation=${values.phase}`]);
} else {
  if (!(await stat(directory)).isDirectory())
    throw new Error("--backup-dir must be an existing directory");
  await access(join(directory, "manifest.json"));
  let operation = "migrate";
  try {
    if (!(await stat(join(directory, "migration-result.json"))).isFile())
      throw new Error("Migration receipt must be a file");
    operation = "resume";
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (values.remote) {
    const config = unstable_readConfig({ config: configPath });
    requireRemoteSearchBindings(config);
    if (!/^[a-f0-9]{32}$/i.test(config.account_id ?? ""))
      throw new Error("Remote apply requires a verified account_id in the selected config");
  }
  // Receipt-aware verify is read-only and must succeed before even derived-schema writes.
  run("verify-backup", storageScript, [...storageArgs, "--operation=verify"]);
  run("check-indexability", resolve(root, "scripts/check-feed-indexability.mjs"), storageArgs);
  run("schema", resolve(root, "scripts/migrate-search-schema.mjs"), [
    `--config=${configPath}`,
    ...(values.remote ? ["--remote"] : []),
    ...(values["persist-to"] ? [`--persist-to=${values["persist-to"]}`] : []),
  ]);
  run(operation, storageScript, [...storageArgs, `--operation=${operation}`, "--writers-paused"]);
  run("index", resolve(root, "scripts/rebuild-article-search.mjs"), sourceArgs);
  console.log(
    JSON.stringify({
      feedHash: values.feed,
      phase: "apply",
      ready: true,
      writersRemainPaused: true,
    }),
  );
}
