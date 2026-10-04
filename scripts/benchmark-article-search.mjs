/**
 * Offline D1 materialization/affinity query-plan/performance comparison. No account, credentials or remote bindings.
 * Run from the repository root: node scripts/benchmark-article-search.mjs
 * Only disposable local D1 receives synthetic rows; all state is removed in finally.
 * Timings are informational, never a CI threshold or a claim of production latency.
 */
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { strict as assert } from "node:assert";
import { build } from "esbuild";
const dir = await mkdtemp(join(tmpdir(), "rss-search-workerd-cte-offline-"));
let proxy;
try {
  process.env.XDG_CONFIG_HOME = join(dir, "config");
  process.env.CLOUDFLARE_CF_FETCH_ENABLED = "false";
  process.env.WRANGLER_SEND_METRICS = "false";
  const compiled = await build({
    entryPoints: [resolve("src/lib/article-search-index.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  const { buildIndexedSearchQuery, normalizeSearchArticle } = await import(
    `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString("base64")}`
  );
  const require = createRequire(import.meta.url);
  const wranglerPackage = require.resolve("wrangler/package.json");
  const miniflarePackage = require.resolve("miniflare/package.json", { paths: [wranglerPackage] });
  const workerdPackage = require.resolve("workerd/package.json", { paths: [miniflarePackage] });
  const versions = {
    wrangler: JSON.parse(await readFile(wranglerPackage, "utf8")).version,
    miniflare: JSON.parse(await readFile(miniflarePackage, "utf8")).version,
    workerd: JSON.parse(await readFile(workerdPackage, "utf8")).version,
  };
  const configPath = join(dir, "wrangler.json");
  await writeFile(
    configPath,
    JSON.stringify({
      name: "rss-search-workerd-offline",
      compatibility_date: "2026-05-01",
      d1_databases: [
        {
          binding: "DB",
          database_name: "offline-only",
          database_id: "00000000-0000-0000-0000-000000000000",
          migrations_dir: resolve("migrations/article-search"),
        },
      ],
    }),
  );
  const migrated = spawnSync(
    process.execPath,
    [
      resolve("node_modules/wrangler/bin/wrangler.js"),
      "d1",
      "migrations",
      "apply",
      "DB",
      "--local",
      `--config=${configPath}`,
      `--persist-to=${join(dir, "state")}`,
    ],
    { env: process.env, encoding: "utf8", timeout: 30000 },
  );
  assert.equal(migrated.status, 0, `${migrated.stdout}\n${migrated.stderr}`);
  const { getPlatformProxy } = await import("wrangler");
  proxy = await getPlatformProxy({
    configPath,
    remoteBindings: false,
    persist: { path: join(dir, "state", "v3") },
  });
  const db = proxy.env.DB;
  const reports = [];
  let plans;
  for (const feeds of [1, 16, 250, 1000]) {
    await db.batch([
      db.prepare("DELETE FROM article_search_articles"),
      db.prepare("DELETE FROM article_search_feeds"),
    ]);
    const sources = Array.from({ length: feeds }, (_, i) => ({
      feedHash: i.toString(16).padStart(16, "0"),
      title: `Fixture ${i} ${"長".repeat(feeds === 1000 ? 200 : 10)}`,
      revision: "r1",
    }));
    await db
      .prepare(
        `INSERT INTO article_search_feeds(feed_hash,source_revision,status,token,title) SELECT json_extract(value,'$.feedHash'), 'r1','ready','offline',json_extract(value,'$.title') FROM json_each(?1)`,
      )
      .bind(JSON.stringify(sources))
      .run();
    const rowsPerFeed = feeds === 1000 ? 5 : 20;
    for (let start = 0; start < feeds; start += 10) {
      const rows = [];
      for (const s of sources.slice(start, start + 10))
        for (let j = 0; j < rowsPerFeed; j++) {
          const a = {
            id: `${s.feedHash}-${j}`,
            feedHash: s.feedHash,
            guid: `g${j}`,
            title: j === 0 ? "東京都 rare-needle" : "ordinary match",
            summary: "fixture",
            content: "<p>red fox</p>",
            author: "ÉLISE",
            categories: ["science"],
            link: "https://example.invalid",
            publishedAt: null,
            createdAt: `2026-09-${String(1 + j).padStart(2, "0")}`,
            metadata: [{ key: "language", value: "ja" }],
          };
          const n = normalizeSearchArticle(a);
          rows.push({
            feedHash: s.feedHash,
            key: `feeds/${s.feedHash}/articles/latest.json`,
            priority: -Number.MAX_SAFE_INTEGER,
            id: a.id,
            ordinal: j,
            ...n,
          });
        }
      await db
        .prepare(
          `INSERT INTO article_search_articles(feed_hash,object_key,priority,article_id,ordinal,sort_key,fields,search_text) SELECT json_extract(value,'$.feedHash'),json_extract(value,'$.key'),json_extract(value,'$.priority'),json_extract(value,'$.id'),json_extract(value,'$.ordinal'),json_extract(value,'$.sortKey'),json_extract(value,'$.fields'),json_extract(value,'$.searchText') FROM json_each(?1)`,
        )
        .bind(JSON.stringify(rows))
        .run();
    }
    for (const query of [
      "rare-needle",
      "title:rare-needle",
      "title:nonexistent",
      "title:a",
      "title:ma OR -tag:absent",
      "京",
      "title:ma",
      "-title:absent",
      "tag:favorite OR feed:Fixture",
    ]) {
      const compiled = buildIndexedSearchQuery(
        query,
        sources,
        { [`${sources[0].feedHash}-1`]: ["favorite"] },
        [`${sources[0].feedHash}-0`],
        20,
      );
      assert.ok(compiled.sql.includes("WITH requested AS MATERIALIZED ("));
      const affinity = compiled.sql;
      const q2 = compiled.sql.replace(
        "CAST(json_extract(value, '$.feedHash') AS TEXT) AS feed_hash",
        "json_extract(value, '$.feedHash') AS feed_hash",
      );
      const inline = q2.replace("WITH requested AS MATERIALIZED (", "WITH requested AS (");
      const records = [];
      for (let repeat = 0; repeat < 4; repeat++) {
        for (const [kind, sql] of repeat % 2
          ? [
              ["affinity", affinity],
              ["materialized", q2],
              ["inline", inline],
            ]
          : [
              ["inline", inline],
              ["materialized", q2],
              ["affinity", affinity],
            ]) {
          const result = await db
            .prepare(sql)
            .bind(...compiled.params)
            .all();
          records.push({ kind, repeat, results: result.results, meta: result.meta });
        }
      }
      for (const r of records)
        assert.deepEqual(r.results, records[0].results, `${feeds}/${query}/${r.kind}`);
      const summarize = (kind) => {
        const runs = records.filter((r) => r.kind === kind && r.repeat > 0);
        const durations = runs.map((r) => r.meta.duration).sort((a, b) => a - b);
        return {
          kind,
          rowsRead: runs[0].meta.rows_read,
          rowsWritten: runs[0].meta.rows_written,
          durationMedianMs: durations[1],
        };
      };
      const report = {
        feeds,
        rows: feeds * rowsPerFeed,
        requestedBytes: Buffer.byteLength(compiled.params[1]),
        query,
        returned: records[0].results.length,
        parity: true,
        inline: summarize("inline"),
        materialized: summarize("materialized"),
        affinity: summarize("affinity"),
      };
      console.log(JSON.stringify(report));
      reports.push(report);
    }
    if (feeds === 250) {
      const c = buildIndexedSearchQuery("title:ma", sources, {}, [], 20);
      plans = {
        inline: await db
          .prepare(
            `EXPLAIN QUERY PLAN ${c.sql
              .replace(
                "CAST(json_extract(value, '$.feedHash') AS TEXT) AS feed_hash",
                "json_extract(value, '$.feedHash') AS feed_hash",
              )
              .replace("WITH requested AS MATERIALIZED (", "WITH requested AS (")}`,
          )
          .bind(...c.params)
          .all(),
        materialized: await db
          .prepare(
            `EXPLAIN QUERY PLAN ${c.sql.replace("CAST(json_extract(value, '$.feedHash') AS TEXT) AS feed_hash", "json_extract(value, '$.feedHash') AS feed_hash")}`,
          )
          .bind(...c.params)
          .all(),
        affinity: await db
          .prepare(`EXPLAIN QUERY PLAN ${c.sql}`)
          .bind(...c.params)
          .all(),
        affinityBytecode: await db
          .prepare(`EXPLAIN ${c.sql}`)
          .bind(...c.params)
          .all(),
      };
    }
  }
  console.log(
    JSON.stringify({
      localOnly: true,
      versions,
      sqliteVersion: "sqlite_version() is not exposed by local D1; exact version not asserted",
      reports,
      plans,
    }),
  );
} finally {
  try {
    await proxy?.dispose();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
