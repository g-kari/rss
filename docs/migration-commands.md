# Migration commands

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
4. For the first rollout, deploy the guard-bearing code with `RSS_FEED_WRITES_PAUSED=true` already effective from that first deployment. Old code ignores this flag. Verify the deployed [writer maintenance guard](migrations/feed-writer-maintenance.md) actually blocks writes, then drain all old/in-flight writers. On subsequent runs, activate and verify the existing guard before draining. `--writers-paused` only records this operator assertion; it does not stop writers
5. Apply the pipeline. Verify `ready: true` and representative search results before resuming writers or approving the final merge/deployment. Keep writers paused on any failure

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

`npm run deploy` runs `build:cf`, then `migrate:search:remote`, then the actual `wrangler deploy`; a schema failure stops deployment. Ordinary startup, `dev`, `build`, `build:cf` and `preview` do not apply schema. Deployment schema application does not replace the per-feed backup/storage/backfill workflow above.

The Cloudflare project's actual configured deployment command has **not been verified**. Automatic deployment must use `npm run deploy`, or explicitly run the schema step before its existing deployment command. Merely running `build:cf` does not run migrations. Confirm the real deployment configuration rather than assuming this repository change updates it.
