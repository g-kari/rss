# Migration commands

## Normal Cloudflare deployment stays available

The default Worker configuration keeps the existing article storage and full-text search paths. UI, recommendation and ingestion-memory improvements are active immediately. A missing D1 database does not make normal search unavailable, and a D1 binding alone does not activate indexed search or its cron maintenance.

- `RSS_ARTICLE_STORAGE_V2=true` opts feed ingestion into converting legacy arrays to v2 storage. Missing, false or invalid values keep legacy writes. An already-v2 head always stays v2, including after the flag is removed; this prevents a destructive format downgrade
- `RSS_ARTICLE_SEARCH_INDEX=true` opts requests and ingestion into the prepared D1 search index. Enable it only after all relevant feed indexes are ready. Before activation, legacy full-text search remains available using bounded body concurrency; it still scans the corpus and therefore does not yet deliver the D1 I/O reduction
- `RSS_FEED_WRITES_PAUSED` is independent and takes precedence over both flags. Do not activate storage conversion on a mixed deployment with old writers still running

Leave the two rollout flags unset for the first ordinary Cloudflare Workers Builds deployment. No SQL or data migration runs during normal build/deploy. This lets the compatible code and maintenance guard land before an explicitly planned storage/index transition.

## One-command per-feed migration

SQL is part of the maintenance pipeline; operators do not need to run individual SQL files. The schema wrapper validates the selected migration directory and pattern before any SQL, then verifies migration versions, required columns and FTS objects before storage conversion can proceed.

Package commands:

- `npm run migrate:search:local`: apply the isolated local search schema
- `npm run migrate:search:remote`: apply the search schema from the production Wrangler configuration (an existing, verified D1 binding is required)
- `npm run migrate:feed -- ...`: inspect, back up, or apply one feed's storage and index migration
- `npm run test:migrations`: run the isolated local maintenance tests

One-time preparation:

1. Use the existing authorized Wrangler login, create the dedicated D1 database once, and copy `config/search-index.remote.example.jsonc` to a private operator configuration. Fill its verified real account/database IDs and correct R2 bucket
2. Set the same database ID and `migrations_dir` on the production `ARTICLE_SEARCH` binding. The directory must resolve to this checkout’s `migrations/article-search`, with the default `*.sql` pattern and `d1_migrations` table. If the private configuration is outside this checkout, use an absolute migration directory; relative paths resolve beside that configuration. The retired root `migrations` directory is rejected. Provisioning and configuration are operator steps, outside this pipeline
3. Inspect the selected feed and prepare a bounded private backup. Raise byte/object budgets explicitly if needed
4. Deploy the compatible guard-bearing code with both rollout flags unset. When ready for migration, set `RSS_FEED_WRITES_PAUSED=true`, verify the deployed [writer maintenance guard](migrations/feed-writer-maintenance.md) actually blocks writes, then drain all old/in-flight writers. Old code ignores the pause flag. `--writers-paused` only records this operator assertion; it does not stop writers
5. Apply the pipeline. Verify `ready: true` and representative search results for every relevant feed. Set both rollout flags to `true` only after this verification, then resume writers. Keep writers paused on any failure

```sh
# Inspect only; no R2 or D1 writes
npm run migrate:feed -- --feed=0123456789abcdef --config=config/search-index.remote.jsonc --remote
# New private backup directory, before the operator pause/drain step
npm run migrate:feed -- --phase=backup --feed=0123456789abcdef --config=config/search-index.remote.jsonc --remote --backup-dir=/private/rss-backups/feed-0123456789abcdef
# Only after the effective guard is active and all writers are drained
npm run migrate:feed -- --phase=apply --feed=0123456789abcdef --config=config/search-index.remote.jsonc --remote --backup-dir=/private/rss-backups/feed-0123456789abcdef --writers-paused
```

Local use omits `--remote` and defaults to `config/search-index.local.jsonc`. Pass the same `--persist-to`, `--backup-dir`, `--max-bytes` and `--max-objects` across phases. The default backup bounds are 128 MiB and 10,000 objects, scoped to one feed. If the source changed between backup and pause, verification aborts; create a fresh backup in a new directory while writers remain paused.

The apply sequence is strictly `verify backup → check indexability → validate/apply/verify D1 schema → migrate/resume R2 → rebuild index`. The read-only indexability check uses the same UTF-8 serialization/size guard as D1 writes, reports record/byte counts, and rejects oversized rows before schema or R2 changes. Each child receives argument arrays, and any error stops subsequent steps. An existing `migration-result.json` selects receipt validation/resumption rather than repeating conversion. Rerun the same apply command after resolving a recoverable failure; the pipeline never deploys, provisions resources, clears the maintenance flag or deletes source objects/backups.

## Explicit deployment integration

`npm run deploy` preserves the normal build-and-deploy flow and does not apply schema. Ordinary startup, `dev`, `build`, `build:cf` and `preview` also do not migrate. The opt-in `npm run deploy:search` command applies and verifies the existing `ARTICLE_SEARCH` schema, then runs `wrangler deploy`; use it as a Cloudflare Workers Builds **Deploy command**, after its normal `build:cf` Build command, only once that dedicated binding exists. A schema failure stops that opt-in deployment. It does not provision D1 or run the per-feed backup/storage/backfill workflow.

The Cloudflare project's actual configured commands and token permissions have **not been verified**. Changing package scripts does not change its dashboard settings. [Workers Builds' documented default token](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#api-token) includes Workers, KV and R2 permissions, but not D1. D1 creation/schema automation requires an already-authorized token with the necessary D1 permission; this code does not create credentials or expand their scope.

[Wrangler automatic provisioning](https://developers.cloudflare.com/workers/wrangler/configuration/#automatic-provisioning) can create an ID-less D1 binding during upload/deploy and retain the association across builds. This is not sufficient by itself for a schema-before-first-deploy command: the database must exist before SQL runs. A future provisioning-aware Cloudflare command must sequence inactive version upload, verified database resolution, schema and final deployment, and handle uncertain provisioning safely. No such account configuration or automatic initial provisioning has been performed by this change.
