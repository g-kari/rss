import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
for (const [name, override] of [
  ["retired root migrations", { migrations_dir: resolve(root, "migrations") }],
  ["a pattern that skips SQL", { migrations_pattern: "*.txt" }],
  ["a different tracking table", { migrations_table: "legacy_migrations" }],
]) {
  test(`schema wrapper rejects ${name} before any SQL`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "rss-schema-guard-"));
    try {
      const configPath = join(directory, "wrangler.json");
      await writeFile(
        configPath,
        JSON.stringify({
          name: "rss-schema-guard",
          compatibility_date: "2026-05-01",
          d1_databases: [
            {
              binding: "ARTICLE_SEARCH",
              database_name: "local-schema-guard",
              database_id: "00000000-0000-0000-0000-000000000000",
              migrations_dir: resolve(root, "migrations/article-search"),
              ...override,
            },
          ],
        }),
      );
      const result = spawnSync(
        process.execPath,
        [resolve(root, "scripts/migrate-search-schema.mjs"), `--config=${configPath}`],
        {
          cwd: directory,
          encoding: "utf8",
          timeout: 10_000,
          killSignal: "SIGKILL",
          env: {
            ...process.env,
            XDG_CONFIG_HOME: join(directory, "settings"),
            WRANGLER_SEND_METRICS: "false",
            CLOUDFLARE_CF_FETCH_ENABLED: "false",
          },
        },
      );
      assert.ifError(result.error);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Refusing unexpected ARTICLE_SEARCH migrations/);
      assert.ok(!result.stdout.includes('"schema":"article-search"'));
      await assert.rejects(access(join(directory, ".wrangler/state")), { code: "ENOENT" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
