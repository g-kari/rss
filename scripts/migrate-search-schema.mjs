/** Apply only this checkout's derived search migrations, then verify the resulting schema. */
import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { unstable_readConfig } from "wrangler";

const root = fileURLToPath(new URL("../", import.meta.url));
const { values } = parseArgs({
  options: {
    config: { type: "string", default: "config/search-index.local.jsonc" },
    "persist-to": { type: "string" },
    remote: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});
if (values.help) {
  console.log(
    "Usage: node scripts/migrate-search-schema.mjs [--config=<wrangler-config>] [--persist-to=<local-state-root>] [--remote]",
  );
  console.log(
    "Local by default. Requires ARTICLE_SEARCH to point at this checkout's migrations/article-search with *.sql and the default migration table. Applies migrations and verifies the schema; never provisions a database or touches R2.",
  );
  process.exit(0);
}
const configPath = resolve(root, values.config);
const config = unstable_readConfig({ config: configPath });
const bindings = config.d1_databases.filter((binding) => binding.binding === "ARTICLE_SEARCH");
if (bindings.length !== 1)
  throw new Error("Configure exactly one existing ARTICLE_SEARCH D1 binding");
const binding = bindings[0];
const expectedDirectory = resolve(root, "migrations/article-search");
const configuredDirectory = resolve(
  dirname(config.userConfigPath ?? configPath),
  binding.migrations_dir ?? "migrations",
);
if (
  configuredDirectory !== expectedDirectory ||
  (binding.migrations_pattern ?? "*.sql") !== "*.sql" ||
  (binding.migrations_table ?? "d1_migrations") !== "d1_migrations"
) {
  throw new Error(
    `Refusing unexpected ARTICLE_SEARCH migrations directory/pattern/table. Set migrations_dir to ${expectedDirectory}, migrations_pattern to *.sql, and use d1_migrations. No SQL was executed.`,
  );
}
const databaseId = binding.database_id ?? "";
if (
  !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(databaseId) ||
  (values.remote && databaseId === "00000000-0000-0000-0000-000000000000")
) {
  throw new Error(
    "ARTICLE_SEARCH needs a configured D1 UUID; remote use requires a real verified database ID",
  );
}
const names = (await readdir(expectedDirectory)).filter((name) => name.endsWith(".sql")).sort();
if (!names.length || names.some((name) => !/^\d+_[a-z0-9_]+\.sql$/i.test(name)))
  throw new Error("Unexpected search migration filenames; no SQL was executed");
const scope = [
  "ARTICLE_SEARCH",
  values.remote ? "--remote" : "--local",
  `--config=${configPath}`,
  ...(values["persist-to"] ? [`--persist-to=${values["persist-to"]}`] : []),
];
function wrangler(args, capture = false) {
  const result = spawnSync(
    process.execPath,
    [resolve(root, "node_modules/wrangler/bin/wrangler.js"), ...args],
    {
      stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Search schema command failed (${result.signal ?? result.status}); subsequent maintenance/deploy steps must not run`,
    );
  return result.stdout;
}
console.log(
  JSON.stringify({
    schema: "article-search",
    mode: values.remote ? "remote" : "local",
    migrations: names,
  }),
);
wrangler(["d1", "migrations", "apply", ...scope]);
const sql = `SELECT
  (SELECT count(DISTINCT name) FROM d1_migrations WHERE name IN (${names.map((name) => `'${name}'`).join(",")})) AS migrations,
  (SELECT count(*) FROM pragma_table_info('article_search_feeds') WHERE name IN ('feed_hash','source_revision','status','token','title','mode','next_object','next_article','indexed_articles')) AS feed_columns,
  (SELECT count(*) FROM pragma_table_info('article_search_articles') WHERE name IN ('id','feed_hash','object_key','priority','article_id','ordinal','sort_key','fields','search_text')) AS article_columns,
  (SELECT count(*) FROM sqlite_master WHERE type='table' AND name='article_search_fts' AND sql LIKE '%fts5%') AS fts,
  (SELECT count(*) FROM sqlite_master WHERE type='trigger' AND name IN ('article_search_insert','article_search_delete','article_search_update')) AS triggers`;
const response = JSON.parse(
  wrangler(["d1", "execute", ...scope, `--command=${sql}`, "--json"], true),
);
const result = response[0]?.results?.[0];
if (
  response[0]?.success !== true ||
  result?.migrations !== names.length ||
  result.feed_columns !== 9 ||
  result.article_columns !== 9 ||
  result.fts !== 1 ||
  result.triggers !== 3
)
  throw new Error("Derived search schema verification failed; do not convert R2 or deploy");
console.log(JSON.stringify({ schema: "article-search", verified: true, migrations: names }));
