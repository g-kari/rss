/** Local binding-backed maintenance smoke; no account, credentials or remote resources. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const sandbox = await mkdtemp(join(tmpdir(), "rss-search-cli-test-"));
process.env.XDG_CONFIG_HOME = join(sandbox, "wrangler-config");
process.env.CLOUDFLARE_CF_FETCH_ENABLED = "false";
process.env.WRANGLER_SEND_METRICS = "false";
const { getPlatformProxy } = await import("wrangler");
const buildResult = await build({
  stdin: {
    contents: `export {searchIndexedArticles} from "./src/lib/article-search-index.ts";
      export {compileSearchQuery} from "./src/lib/full-text-search.ts";
      export {compareByDateDesc} from "./src/lib/article-utils.ts";`,
    resolveDir: root,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
});
const { searchIndexedArticles, compileSearchQuery, compareByDateDesc } = await import(
  `data:text/javascript;base64,${Buffer.from(buildResult.outputFiles[0].contents).toString("base64")}`
);
after(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

function run(args, cwd) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    env: process.env,
    encoding: "utf8",
    timeout: 30_000,
    killSignal: "SIGKILL",
    maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

const feedHash = "0123456789abcdef";
const latestKey = `feeds/${feedHash}/articles/latest.json`;
const archiveKey = `feeds/${feedHash}/articles/segments/smoke.json`;
const metaKey = `feeds/${feedHash}/meta.json`;
const articles = Array.from({ length: 601 }, (_, i) => {
  const timestamp = new Date(Date.UTC(2026, 8, 30) - i * 60_000).toISOString();
  return {
    id: `article-${String(i).padStart(4, "0")}`,
    feedHash,
    guid: `guid-${i}`,
    title: `東京都の検索 substring ${i}`,
    summary: "migration summary",
    content: "<p>migration <b>phrase</b>\u0000tail_token</p>",
    author: i % 2 ? "ÉLISE" : "別の著者",
    link: `https://example.invalid/articles/${i}`,
    categories: ["テスト"],
    publishedAt: i % 11 ? timestamp : null,
    createdAt: timestamp,
  };
});
const meta = {
  feedHash,
  url: "https://example.invalid/feed",
  title: "Test feed",
  siteUrl: "",
  lastFetchedAt: null,
  fetchError: null,
  articleCount: 601,
  pageCount: 1,
  articleRevision: "smoke-r1",
};
const head = {
  version: 2,
  revision: "smoke-r1",
  articles: articles.slice(0, 300),
  nextSegmentId: 2,
  segments: [
    {
      objectKey: archiveKey,
      priority: -1,
      count: 301,
      newest: articles[300],
      oldest: articles[600],
    },
  ],
};

async function sourceSnapshot(bucket) {
  const values = [];
  for (const key of [metaKey, latestKey, archiveKey]) {
    const object = await bucket.get(key);
    assert.ok(object);
    values.push({
      key,
      etag: object.etag,
      customMetadata: object.customMetadata,
      text: await object.text(),
    });
  }
  return values;
}

for (const explicit of [false, true]) {
  test(
    `real CLI shares Wrangler local storage (${explicit ? "explicit relative --persist-to" : "config-relative default"})`,
    { timeout: 90_000 },
    async () => {
      const cwd = join(sandbox, explicit ? "explicit-cwd" : "default-cwd");
      const configPath = join(cwd, "nested", "wrangler.json");
      await mkdir(dirname(configPath), { recursive: true });
      const stateRoot = explicit
        ? resolve(cwd, "custom-state")
        : resolve(dirname(configPath), ".wrangler/state");
      const config = {
        name: "rss-search-cli-smoke",
        compatibility_date: "2026-05-01",
        r2_buckets: [{ binding: "RSS_DATA", bucket_name: "local-rss-cli-smoke" }],
        d1_databases: [
          {
            binding: "ARTICLE_SEARCH",
            database_name: "local-rss-cli-smoke",
            database_id: "00000000-0000-0000-0000-000000000000",
            migrations_dir: resolve(root, "migrations/article-search"),
          },
        ],
      };
      await writeFile(configPath, JSON.stringify(config));
      const persistArgs = explicit ? ["--persist-to=custom-state"] : [];
      run(
        [
          resolve(root, "node_modules/wrangler/bin/wrangler.js"),
          "d1",
          "migrations",
          "apply",
          "ARTICLE_SEARCH",
          "--local",
          `--config=${configPath}`,
          ...persistArgs,
        ],
        cwd,
      );
      let proxy = await getPlatformProxy({
        configPath,
        remoteBindings: false,
        persist: { path: join(stateRoot, "v3") },
      });
      let originalSources;
      try {
        await proxy.env.RSS_DATA.put(metaKey, JSON.stringify(meta));
        await proxy.env.RSS_DATA.put(latestKey, JSON.stringify(head), {
          customMetadata: { articleRevision: "smoke-r1" },
        });
        await proxy.env.RSS_DATA.put(archiveKey, JSON.stringify(articles.slice(300)));
        originalSources = await sourceSnapshot(proxy.env.RSS_DATA);
      } finally {
        await proxy.dispose();
      }

      const output = run(
        [
          resolve(root, "scripts/rebuild-article-search.mjs"),
          `--feed=${feedHash}`,
          `--config=${configPath}`,
          ...persistArgs,
        ],
        cwd,
      );
      const progress = output
        .split("\n")
        .filter((line) => line.startsWith("{"))
        .map((line) => JSON.parse(line));
      assert.deepEqual(
        progress.map((step) => step.indexedArticles),
        [200, 400, 600, 601],
      );
      assert.equal(progress.at(-1).ready, true);
      assert.equal(progress.at(-1).revision, "smoke-r1");
      proxy = await getPlatformProxy({
        configPath,
        remoteBindings: false,
        persist: { path: join(stateRoot, "v3") },
      });
      try {
        assert.deepEqual(
          await sourceSnapshot(proxy.env.RSS_DATA),
          originalSources,
          "CLI must not modify R2 source data",
        );
        const status = await proxy.env.ARTICLE_SEARCH.prepare(
          "SELECT status, source_revision, indexed_articles FROM article_search_feeds WHERE feed_hash = ?",
        )
          .bind(feedHash)
          .first();
        assert.deepEqual(status, {
          status: "ready",
          source_revision: "smoke-r1",
          indexed_articles: 601,
        });
        const count = await proxy.env.ARTICLE_SEARCH.prepare(
          "SELECT count(*) AS n FROM article_search_articles",
        ).first();
        assert.equal(count.n, 601);
        const saved = {
          ...articles[1],
          feedHash: "__saved__",
          title: "Saved needle",
          summary: "",
          content: "",
          author: "",
          publishedAt: null,
          createdAt: "2027-01-01T00:00:00Z",
        };
        const readState = {
          readIds: [],
          bookmarkIds: [],
          readingListIds: [],
          likeIds: [],
          tagIds: { [articles[2].id]: ["お気に入り", "work note"] },
        };
        const ctx = {
          feedTitleByHash: new Map([[feedHash, "Custom フィード"]]),
          tagsByArticleId: readState.tagIds,
        };
        for (const query of [
          "京",
          "東京",
          "東京都",
          "string",
          'content:"migration phrase"',
          "title:absent OR tag:お気に入り",
          "-author:ÉLISE",
          "feed:custom",
          'tag:"work note"',
          "東京 -tag:work",
          "published:2026-09",
          "content:tail_token",
          'content:"phrase\u0000tail_token"',
          "Saved",
        ]) {
          const seen = new Set();
          const expected = [saved, ...articles]
            .filter((article) => {
              if (seen.has(article.id)) return false;
              seen.add(article.id);
              return compileSearchQuery(query)(article, ctx);
            })
            .sort(compareByDateDesc)
            .slice(0, 37);
          const actual = await searchIndexedArticles({
            db: proxy.env.ARTICLE_SEARCH,
            bucket: proxy.env.RSS_DATA,
            query,
            subscriptions: [
              {
                feedHash,
                url: meta.url,
                subscribedAt: "2026-01-01",
                customTitle: "Custom フィード",
              },
            ],
            savedArticles: [saved],
            readState,
            limit: 37,
          });
          assert.deepEqual(actual, expected, query);
        }
      } finally {
        await proxy.dispose();
      }
      // A repeated invocation must recognize the same durable ready state.
      const repeated = run(
        [
          resolve(root, "scripts/rebuild-article-search.mjs"),
          `--feed=${feedHash}`,
          `--config=${configPath}`,
          ...persistArgs,
        ],
        cwd,
      );
      assert.ok(repeated.includes('"ready":true'));
      console.log(
        `${explicit ? "explicit" : "default"}: ${stateRoot}/v3; four rebuild steps; 601 rows; 14 query parity checks; R2 unchanged`,
      );
    },
  );
}

test(
  "private backup, explicit legacy migration and index backfill share real local bindings",
  { timeout: 90_000 },
  async () => {
    const cwd = join(sandbox, "storage-migration");
    await mkdir(cwd);
    const configPath = join(cwd, "wrangler.json");
    const backup = join(cwd, "verified-backup");
    await writeFile(
      configPath,
      JSON.stringify({
        name: "rss-storage-migration-smoke",
        compatibility_date: "2026-05-01",
        r2_buckets: [{ binding: "RSS_DATA", bucket_name: "local-rss-migration-smoke" }],
        d1_databases: [
          {
            binding: "ARTICLE_SEARCH",
            database_name: "local-rss-migration-smoke",
            database_id: "00000000-0000-0000-0000-000000000000",
            migrations_dir: resolve(root, "migrations/article-search"),
          },
        ],
      }),
    );
    run(
      [
        resolve(root, "node_modules/wrangler/bin/wrangler.js"),
        "d1",
        "migrations",
        "apply",
        "ARTICLE_SEARCH",
        "--local",
        `--config=${configPath}`,
      ],
      cwd,
    );
    const proxyOptions = {
      configPath,
      remoteBindings: false,
      persist: { path: join(cwd, ".wrangler/state/v3") },
    };
    let proxy = await getPlatformProxy(proxyOptions);
    let archiveBefore;
    const legacyArchiveKey = `feeds/${feedHash}/articles/p2.json`;
    try {
      await proxy.env.RSS_DATA.put(
        metaKey,
        JSON.stringify({
          ...meta,
          articleRevision: undefined,
          knownIds: articles.map((article) => article.id),
        }),
      );
      await proxy.env.RSS_DATA.put(latestKey, JSON.stringify(articles.slice(0, 500)));
      await proxy.env.RSS_DATA.put(legacyArchiveKey, JSON.stringify(articles.slice(500)));
      const object = await proxy.env.RSS_DATA.get(legacyArchiveKey);
      archiveBefore = { etag: object.etag, text: await object.text() };
    } finally {
      await proxy.dispose();
    }
    const common = [
      resolve(root, "scripts/migrate-feed-storage.mjs"),
      `--feed=${feedHash}`,
      `--config=${configPath}`,
      `--backup-dir=${backup}`,
    ];
    assert.ok(run([...common, "--operation=inspect"], cwd).includes('"objects":3'));
    run([...common, "--operation=backup"], cwd);
    assert.ok(run([...common, "--operation=verify"], cwd).includes('"verified":true'));
    const migrated = run([...common, "--operation=migrate", "--writers-paused"], cwd);
    assert.ok(migrated.includes('"migrated":true'));
    assert.ok(migrated.includes('"articleCount":601'));
    const indexed = run(
      [
        resolve(root, "scripts/rebuild-article-search.mjs"),
        `--feed=${feedHash}`,
        `--config=${configPath}`,
      ],
      cwd,
    );
    assert.ok(indexed.includes('"ready":true'));
    proxy = await getPlatformProxy(proxyOptions);
    try {
      const current = await (await proxy.env.RSS_DATA.get(latestKey)).json();
      assert.equal(current.version, 2);
      assert.equal(current.articles.length, 500);
      const archive = await proxy.env.RSS_DATA.get(legacyArchiveKey);
      assert.deepEqual(
        { etag: archive.etag, text: await archive.text() },
        archiveBefore,
        "legacy source objects are preserved",
      );
      const status = await proxy.env.ARTICLE_SEARCH.prepare(
        "SELECT status,source_revision,indexed_articles FROM article_search_feeds WHERE feed_hash=?",
      )
        .bind(feedHash)
        .first();
      assert.deepEqual(status, {
        status: "ready",
        source_revision: current.revision,
        indexed_articles: 601,
      });
      const actual = await searchIndexedArticles({
        db: proxy.env.ARTICLE_SEARCH,
        bucket: proxy.env.RSS_DATA,
        query: "published:2026-09",
        subscriptions: [{ feedHash, url: meta.url, subscribedAt: "2026-01-01" }],
        savedArticles: [],
        readState: { readIds: [], bookmarkIds: [], readingListIds: [], likeIds: [] },
        limit: 37,
      });
      const expected = articles
        .filter((article) => compileSearchQuery("published:2026-09")(article))
        .sort(compareByDateDesc)
        .slice(0, 37);
      assert.deepEqual(actual, expected);
    } finally {
      await proxy.dispose();
    }
    console.log(
      "legacy backup → checksum/ETag verification → v2 CAS conversion → 601 article content verification → D1 ready → published query parity; original archive retained",
    );
  },
);

test(
  "explicit migration pipeline includes schema, verifies backup first, and resumes a receipt",
  { timeout: 120_000 },
  async () => {
    const cwd = join(sandbox, "pipeline cwd with spaces");
    const configPath = join(cwd, "nested config", "wrangler.json");
    const backup = join(cwd, "private backup");
    const stateRoot = join(cwd, "selected state");
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify({
        name: "rss-pipeline-smoke",
        compatibility_date: "2026-05-01",
        r2_buckets: [{ binding: "RSS_DATA", bucket_name: "local-rss-pipeline-smoke" }],
        d1_databases: [
          {
            binding: "ARTICLE_SEARCH",
            database_name: "local-rss-pipeline-smoke",
            database_id: "00000000-0000-0000-0000-000000000000",
            migrations_dir: resolve(root, "migrations/article-search"),
          },
        ],
      }),
    );
    const proxyOptions = {
      configPath,
      remoteBindings: false,
      persist: { path: join(stateRoot, "v3") },
    };
    let proxy = await getPlatformProxy(proxyOptions);
    const legacyArchiveKey = `feeds/${feedHash}/articles/p2.json`;
    let originals;
    try {
      await proxy.env.RSS_DATA.put(
        metaKey,
        JSON.stringify({
          ...meta,
          articleRevision: undefined,
          knownIds: articles.map((article) => article.id),
        }),
      );
      await proxy.env.RSS_DATA.put(latestKey, JSON.stringify(articles.slice(0, 500)));
      await proxy.env.RSS_DATA.put(legacyArchiveKey, JSON.stringify(articles.slice(500)));
      originals = await Promise.all(
        [metaKey, latestKey, legacyArchiveKey].map(async (key) => {
          const object = await proxy.env.RSS_DATA.get(key);
          return { key, etag: object.etag, text: await object.text() };
        }),
      );
    } finally {
      await proxy.dispose();
    }
    const common = [
      resolve(root, "scripts/migrate-feed.mjs"),
      `--feed=${feedHash}`,
      `--config=${configPath}`,
      "--persist-to=selected state",
      `--backup-dir=${backup}`,
      "--max-bytes=2097152",
      "--max-objects=20",
    ];
    const inspectOutput = run(common, cwd);
    assert.ok(inspectOutput.includes('"step":"inspect"'));
    assert.ok(inspectOutput.includes('"objects":3'));
    assert.ok(!inspectOutput.includes('"step":"schema"'));
    run([...common, "--phase=backup"], cwd);
    const manifestPath = join(backup, "manifest.json");
    const manifestText = await readFile(manifestPath, "utf8");
    function rejected(extra, pattern) {
      const result = spawnSync(process.execPath, [...common, "--phase=apply", ...extra], {
        cwd,
        env: process.env,
        encoding: "utf8",
        timeout: 30_000,
        killSignal: "SIGKILL",
      });
      assert.ifError(result.error);
      assert.notEqual(result.status, 0);
      assert.match(result.stdout + result.stderr, pattern);
      assert.ok(!result.stdout.includes('"step":"schema"'), "must abort before D1 migration");
    }
    rejected([], /Activate the maintenance guard/);
    await writeFile(
      manifestPath,
      JSON.stringify({ ...JSON.parse(manifestText), feedHash: "fedcba9876543210" }),
    );
    rejected(["--writers-paused"], /Backup identity does not match/);
    await writeFile(manifestPath, manifestText);
    const badConfigPath = join(cwd, "bad-schema.json");
    const badConfig = JSON.parse(await readFile(configPath, "utf8"));
    badConfig.d1_databases[0].migrations_dir = resolve(root, "migrations");
    await writeFile(badConfigPath, JSON.stringify(badConfig));
    const schemaFailed = spawnSync(
      process.execPath,
      [
        ...common.map((arg) => (arg.startsWith("--config=") ? `--config=${badConfigPath}` : arg)),
        "--phase=apply",
        "--writers-paused",
      ],
      { cwd, env: process.env, encoding: "utf8", timeout: 30_000, killSignal: "SIGKILL" },
    );
    assert.ifError(schemaFailed.error);
    assert.notEqual(schemaFailed.status, 0);
    assert.match(schemaFailed.stderr, /Refusing unexpected ARTICLE_SEARCH migrations/);
    assert.ok(schemaFailed.stdout.includes('"step":"schema"'));
    assert.ok(!schemaFailed.stdout.includes('"step":"migrate"'));
    assert.ok(!schemaFailed.stdout.includes('"step":"index"'));
    proxy = await getPlatformProxy(proxyOptions);
    try {
      const table = await proxy.env.ARTICLE_SEARCH.prepare(
        "SELECT name FROM sqlite_master WHERE name='article_search_feeds'",
      ).first();
      assert.equal(
        table,
        null,
        "failed prerequisites or wrong migrations directory must not apply schema",
      );
      assert.equal(
        await proxy.env.ARTICLE_SEARCH.prepare(
          "SELECT name FROM sqlite_master WHERE name='d1_migrations'",
        ).first(),
        null,
      );
      for (const original of originals) {
        const object = await proxy.env.RSS_DATA.get(original.key);
        assert.equal(object.etag, original.etag);
        assert.equal(await object.text(), original.text);
      }
    } finally {
      await proxy.dispose();
    }

    const applied = run([...common, "--phase=apply", "--writers-paused"], cwd);
    const events = applied
      .split("\n")
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      events.filter((event) => event.step).map((event) => event.step),
      ["verify-backup", "check-indexability", "schema", "migrate", "index"],
    );
    assert.equal(events.at(-1).ready, true);
    assert.equal(events.at(-1).writersRemainPaused, true);
    const receipt = JSON.parse(await readFile(join(backup, "migration-result.json"), "utf8"));
    assert.equal(receipt.articlesVerified, true);
    proxy = await getPlatformProxy(proxyOptions);
    let headEtag;
    try {
      const object = await proxy.env.RSS_DATA.get(latestKey);
      headEtag = object.etag;
      const current = await object.json();
      assert.equal(current.version, 2);
      const state = await proxy.env.ARTICLE_SEARCH.prepare(
        "SELECT status,source_revision,indexed_articles FROM article_search_feeds WHERE feed_hash=?",
      )
        .bind(feedHash)
        .first();
      assert.deepEqual(state, {
        status: "ready",
        source_revision: current.revision,
        indexed_articles: 601,
      });
      const result = await searchIndexedArticles({
        db: proxy.env.ARTICLE_SEARCH,
        bucket: proxy.env.RSS_DATA,
        query: "published:2026-09",
        subscriptions: [{ feedHash, url: meta.url, subscribedAt: "2026-01-01" }],
        savedArticles: [],
        readState: { readIds: [], bookmarkIds: [], readingListIds: [], likeIds: [] },
        limit: 37,
      });
      assert.deepEqual(
        result,
        articles
          .filter((article) => compileSearchQuery("published:2026-09")(article))
          .sort(compareByDateDesc)
          .slice(0, 37),
      );
      const legacy = await proxy.env.RSS_DATA.get(legacyArchiveKey);
      assert.equal(legacy.etag, originals[2].etag);
      assert.equal(await legacy.text(), originals[2].text);
    } finally {
      await proxy.dispose();
    }
    const resumed = run([...common, "--phase=apply", "--writers-paused"], cwd);
    assert.ok(resumed.includes('"step":"resume"'));
    assert.ok(!resumed.includes('"step":"migrate"'));
    assert.ok(resumed.includes('"ready":true'));
    proxy = await getPlatformProxy(proxyOptions);
    try {
      assert.equal((await proxy.env.RSS_DATA.head(latestKey)).etag, headEtag);
    } finally {
      await proxy.dispose();
    }
    const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
    assert.ok(pkg.scripts.deploy.includes("migrate:search:remote"));
    assert.ok(
      pkg.scripts.deploy.indexOf("migrate:search:remote") <
        pkg.scripts.deploy.indexOf("wrangler deploy"),
    );
    for (const name of ["dev", "predev", "build", "prebuild", "build:cf", "preview"])
      assert.ok(!pkg.scripts[name].includes("migrate:"), `${name} must not mutate schema`);
    console.log(
      "pipeline: default inspect; bounded backup; paused/verified prerequisites; automatic schema → storage → index; 601 ready; receipt resume preserves head; prerequisite failures stop before schema; schema failure stops before storage",
    );
  },
);

test(
  "pipeline rejects an unindexable article before SQL or R2 conversion",
  { timeout: 60_000 },
  async () => {
    const cwd = join(sandbox, "oversized preflight");
    await mkdir(cwd);
    const configPath = join(cwd, "wrangler.json");
    const backup = join(cwd, "private backup");
    await writeFile(
      configPath,
      JSON.stringify({
        name: "rss-oversized-preflight",
        compatibility_date: "2026-05-01",
        r2_buckets: [{ binding: "RSS_DATA", bucket_name: "local-rss-oversized-preflight" }],
        d1_databases: [
          {
            binding: "ARTICLE_SEARCH",
            database_name: "local-rss-oversized-preflight",
            database_id: "00000000-0000-0000-0000-000000000000",
            migrations_dir: resolve(root, "migrations/article-search"),
          },
        ],
      }),
    );
    const options = {
      configPath,
      remoteBindings: false,
      persist: { path: join(cwd, ".wrangler/state/v3") },
    };
    let proxy = await getPlatformProxy(options);
    let original;
    try {
      await proxy.env.RSS_DATA.put(
        metaKey,
        JSON.stringify({ ...meta, articleCount: 1, pageCount: 0, articleRevision: undefined }),
      );
      await proxy.env.RSS_DATA.put(
        latestKey,
        JSON.stringify([{ ...articles[0], content: "x".repeat(1_000_000) }]),
      );
      const head = await proxy.env.RSS_DATA.get(latestKey);
      original = { etag: head.etag, text: await head.text() };
    } finally {
      await proxy.dispose();
    }
    const common = [
      resolve(root, "scripts/migrate-feed.mjs"),
      `--feed=${feedHash}`,
      `--config=${configPath}`,
      `--backup-dir=${backup}`,
      "--max-bytes=2097152",
      "--max-objects=10",
    ];
    run([...common, "--phase=backup"], cwd);
    const failed = spawnSync(process.execPath, [...common, "--phase=apply", "--writers-paused"], {
      cwd,
      env: process.env,
      encoding: "utf8",
      timeout: 30_000,
      killSignal: "SIGKILL",
      maxBuffer: 1024 * 1024,
    });
    assert.ifError(failed.error);
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /Article exceeds D1 search row limit/);
    assert.ok(failed.stdout.includes('"step":"check-indexability"'));
    assert.ok(!failed.stdout.includes('"step":"schema"'));
    assert.ok(!failed.stdout.includes('"step":"migrate"'));
    proxy = await getPlatformProxy(options);
    try {
      const head = await proxy.env.RSS_DATA.get(latestKey);
      assert.deepEqual({ etag: head.etag, text: await head.text() }, original);
      assert.equal(
        await proxy.env.ARTICLE_SEARCH.prepare(
          "SELECT name FROM sqlite_master WHERE name='d1_migrations'",
        ).first(),
        null,
      );
      assert.equal(
        (await proxy.env.RSS_DATA.list({ prefix: `feeds/${feedHash}/articles/segments/` })).objects
          .length,
        0,
      );
    } finally {
      await proxy.dispose();
    }
  },
);
