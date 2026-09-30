# Derived article search index (#1378)

R2 remains the source of truth. `ARTICLE_SEARCH` is a separate, disposable D1 projection of shared feed articles. It is not the retired D1 primary database from `migrations/0001_initial.sql`. Its migrations live only in `migrations/article-search/`:

- `0001_article_search.sql`: normalized article rows, feed readiness and trigram FTS
- `0002_rebuild_checkpoints.sql`: bounded rebuild progress
- `0003_rebuild_nul_safe_fts.sql`: invalidate old FTS readiness/checkpoints so every existing projection is rebuilt with NUL-safe candidate text

Applying migration 0003 intentionally makes previously indexed feeds unready until their rebuild completes. Do not manually mark old rows ready. It changes no R2 source data.

## Request behavior

This section applies after explicit `RSS_ARTICLE_SEARCH_INDEX=true` activation. With that flag unset, false or invalid, requests retain legacy full-text search, using dual-format R2 readers and at most four concurrent article object reads. Merely adding `ARTICLE_SEARCH` does not enable request/index-maintenance access to D1. This preserves search availability during a normal deployment before database setup and backfill. See [migration commands](migration-commands.md) for the separate rollout gates.

`GET /api/articles?q=...` parses the same AST as the client search evaluator. It reads subscriptions, saved articles, read state, small feed metadata and HEAD revision metadata. It never walks every article page or segment in the request.

- Normalization is shared with `full-text-search.ts`: JavaScript lowercase; content HTML stripping; raw summary; joined category/language/metadata fields; the same default-field separators
- FTS5 uses `trigram case_sensitive 1`, only as a candidate prefilter. Exact `instr` predicates evaluate every term and the full AND/OR/NOT AST. It is **not** `unicode61` word matching. Candidate fields use newline separators and replace embedded NUL with newline because workerd FTS stops tokenizing at NUL; exact normalized fields remain untouched
- One- and two-character terms (including Japanese), NUL/separator terms, and user-specific feed/tag predicates run exact SQL without the trigram shortcut. These can scan eligible D1 rows, but do not read the R2 corpus
- Saved articles are checked first with the existing evaluator. All saved IDs, including nonmatches, are excluded from shared results before SQL LIMIT. Among duplicate shared IDs the first subscription and then first physical object wins, before matching
- Feed custom titles and article tags come from current user data, not a shared index. Search deliberately retains the old behavior of ignoring feed keyword filters and TTL
- SQL selects the global newest `MAX_USER_ARTICLES` matching references, ordered by the existing `publishedAt ?? createdAt` string comparison and ascending ID tie-break. Those lightweight references are merged with saved matches and capped before hydration. Only the final selected shared physical objects are fetched, with one shared concurrency limit of four
- Empty/unparseable queries still return `[]`. Successful responses remain Article arrays with `Cache-Control: private, max-age=30`; `q` keeps precedence over `feed`/`page`
- Missing binding, incomplete/stale indexes, concurrent source changes or missing pointers return HTTP 503 with `SEARCH_INDEX_UNAVAILABLE`. There is no hidden R2 full-scan fallback and no silently partial search result. Saved-only users and empty queries work without D1

A query carries five bound parameters regardless of the number of subscriptions, tags, saved IDs or search terms. User strings are bound values; AST field names are selected from the existing fixed parser vocabulary. Trigram MATCH strings are quoted/escaped and never used as the authority for matching.

## Publication, readiness and recovery

The append-oriented R2 head has an article revision, also stored in R2 custom metadata so readiness checks use HEAD without downloading latest article bodies. D1 `article_search_feeds.source_revision` must match that head revision and have `status = 'ready'` for every requested feed.

Indexing follows an already-successful R2 commit. `ensureFeedSearchIndex(db, bucket, meta, commit?)` applies changed physical objects and removed keys when its prior ready revision equals `commit.previousRevision`. It consumes the commit's article batches directly, so unchanged historical objects need no reads or rewrites. The changed-object delete and inserts are hidden by the building state until all batches succeed. Triggers keep FTS and normalized rows synchronized.

Missing projections, a revision gap, or a storage migration trigger `rebuildFeedSearchIndexStep`. Each call processes at most 200 article records and four physical objects, checkpoints the object index and article offset, and leaves the feed unready until completion. Failed same-revision rebuilds resume their last durable checkpoint; repeated uncheckpointed inserts are idempotent. An incremental-update failure instead starts a full rebuild. The unbounded `rebuildFeedSearchIndex` helper is for offline/testing callers only. Rebuild reads a stable head and streams one physical object at a time, including all legacy pages through `pageCount + 1`. A unique build token guards every deletion/insertion and completion. Incremental ownership uses a compare-and-set on the exact prior state/token. Superseded builders cannot write or mark a newer build ready. A failed build remains unready and a no-change refresh can advance its repair. If the R2 revision changes, the next step starts a fresh snapshot; it never publishes old partial results as current.

An orphaned subscription contributes no shared articles if both its metadata and article head are absent. This does not bypass readiness for an existing feed whose head is missing.

The query's readiness check and row selection are one SQL snapshot, including an explicit unready sentinel even when there are no hits. Hydration validates head revisions/pointers and the evaluator result. All feed HEAD revisions are checked again before a response, so additions in a previously unmatched segment cannot silently alter the top K.

`deleteFeedSearchIndex(db, feedHash)` deletes only derived D1 rows and state, atomically; use it for physical shared-feed deletion/reset. User unsubscribe does not delete a shared feed's index. Queries always scope their reads to current subscriptions. A refetch can rebuild the projection from R2. Index failure never rolls back or mutates R2 article data.

## Rollout and operations

Production D1 creation, binding changes, data migration and deployment require separate operator approval. None of the implementation/test commands provision or change production.

1. Create a dedicated D1 database and add its real ID as `ARTICLE_SEARCH` in the production Wrangler configuration
2. Use `migrations_dir = "migrations/article-search"`. Never apply the root retired migrations to this binding
3. Apply the search migrations and backfill existing feeds before setting `RSS_ARTICLE_SEARCH_INDEX=true`. Legacy search remains active until then. Once enabled, an incomplete subscription set returns the explicit 503 described above
4. Activate `RSS_ARTICLE_STORAGE_V2=true` only after the storage migration safety steps. With the search flag enabled, refresh/cron invokes index maintenance after committed writes, including no-change repair paths
5. Observe `[articles-search]` failures and index-maintenance logs; repair/rebuild affected feeds. D1 is derived and can be dropped/rebuilt without losing RSS article data

For isolated local verification (the dummy database ID is local-only):

```sh
pnpm exec wrangler d1 migrations apply ARTICLE_SEARCH --local --config config/search-index.local.jsonc
pnpm exec vitest run src/lib/article-search-index.test.ts src/lib/article-search-route.test.ts
pnpm exec tsc --noEmit
```

Large backfills must respect D1's per-invocation statement/query, duration and row-size limits. `createSearchIndexBudget` and `withSearchIndexBudget` charge actual executed statements across all feeds in an invocation (preparing/binding is free; a batch charges its statement count). Use one shared budget, normally 800 statements for the Paid target; configure a smaller budget below the platform limit for other plans. Exhaustion occurs before executing another statement, leaves R2 intact, and resumes on a later invocation. Normalized writes use a constant-size statement with five bindings, at most 20 rows and a 256 KiB target chunk. One larger row can occupy its own chunk.

Individual normalized records above 1.9 MB are rejected before binding rather than silently truncated. Normalized exact fields and FTS text retain roughly two copies of text; depending on other fields and JSON escaping, an article around 900 KB of plain text can reach that limit. Such a feed remains unready until the oversized-data issue is addressed. This implementation does not claim support for indexing arbitrary multi-megabyte article bodies in D1.

### Migration commands

Use the [combined migration commands](migration-commands.md) for the one-time setup, bounded backup, effective writer pause, automatic schema/storage/index sequence, receipt resumption and explicit deployment integration. The shared schema wrapper rejects the retired migration directory and verifies the resulting search schema before conversion.

### Resumable maintenance runner

Pause article writers for the affected feed during an initial large backfill. Otherwise, a new article revision restarts the snapshot and a frequently updated large feed may never finish at cron cadence. Run the resumable driver repeatedly/continuously until it reports `ready: true`, then resume writers. Normal search remains 503 until the full subscribed set is ready. Cron and bulk refresh rotate their starting feed across time windows so a fixed ordering does not permanently favor early feeds when maintenance budgets are exhausted.

```sh
# Local data and local D1 only by default; no production database is provisioned
node scripts/rebuild-article-search.mjs --feed=0123456789abcdef --config=config/search-index.local.jsonc
# Optional local state root: pass the SAME root to migrations and the rebuild CLI
pnpm exec wrangler d1 migrations apply ARTICLE_SEARCH --local --config=config/search-index.local.jsonc --persist-to=./local-search-state
node scripts/rebuild-article-search.mjs --feed=0123456789abcdef --config=config/search-index.local.jsonc --persist-to=./local-search-state
```

The default local root is `.wrangler/state` beside the selected config, matching Wrangler CLI. An explicit `--persist-to` is relative to the shell's current directory. Both are state **roots**: the maintenance helper appends `v3` for `getPlatformProxy`. Do not append `v3` yourself. With the checked-in local config, both migrations and maintenance therefore use `config/.wrangler/state/v3`. The CLI prints its resolved local directory before connecting, so a wrong local database is visible.

### Binding startup troubleshooting

Run the actual `.mjs` file as shown above. A diagnostic launched using `node --input-type=module` can hang even though the file-based CLI works: this Node option is inherited by Miniflare's CommonJS `eval` worker, which fails with `require is not defined`; its host is waiting synchronously in `Atomics.wait`. Use a `.mjs` file for probes, or plain `node scripts/rebuild-article-search.mjs ...`. Do not interpret this probe-only failure as an authentication or D1 service failure, and do not change credentials or remote resources to fix it.

The separate “Feed metadata was not found” failure can indicate mismatched local persistence roots. Apply local migrations and seed/import local R2 data using the same state root; do not silently switch to remote bindings. The isolated smoke below verifies both the config-relative default and an explicit relative root using real local Wrangler migrations, 601 synthetic R2 articles and a four-step rebuild:

```sh
npm run test:migrations
```

It checks durable ready state, 14 representative query/result comparisons per configuration, repeat invocation, and unchanged R2 source bytes/ETags. The same suite includes legacy backup/conversion/backfill and the complete pipeline, including missing-pause and invalid-backup rejection before schema, schema-failure abortion before storage, plus receipt resumption. Fixtures live in temporary directories and use local-only dummy bindings; the smoke does not require a Cloudflare account.

`config/search-index.remote.example.jsonc` documents the separately approved remote binding setup. The driver requires explicit `--remote` plus a different config with remote bindings for production access. It only reads R2 and writes derived D1 data; it does not create databases, apply migrations, delete R2 data or deploy. No production maintenance command has been run as part of this change.

## Verification and performance checks

The tests execute the real schema, FTS triggers and search SQL against Node's built-in SQLite. They cover differential parity with the existing evaluator; Japanese substrings and short terms; phrases/NOT/OR/field queries; title/tag isolation; duplicate/saved priority; date fallback/top K; incremental/rebuild/refetch/deletion; D1 failure isolation; conflicting builders; readiness races; source changes during hydration; no-hit zero body reads; over 1,000 subscriptions with five parameters; and global hydration concurrency.

All three SQL migrations and the file-based maintenance CLI are also validated using real local Wrangler/workerd D1 and R2 bindings. This catches runtime differences that a Node SQLite-only test cannot: in particular, workerd FTS stops at NUL while `instr` still sees the text after it. No production database is used.

A reproducible selective-query check is the test “hydrates only selected physical objects, not unmatched objects or every candidate”: 12 indexed archive objects, 11 matching, `limit=7`, exactly seven article-body GETs, zero latest-body GETs, and at most four concurrent R2 operations. The no-hit test performs only metadata GETs/HEADs, with zero article-body GETs. Increase archive count while keeping the selected limit fixed to verify that R2 hydration cost depends on returned physical objects, not corpus size. Short-term/NOT-only SQL latency must be measured separately because their exact D1 predicates can examine many rows.

References:

- [Cloudflare D1 SQLite extensions](https://developers.cloudflare.com/d1/sql-api/sql-statements/)
- [Cloudflare D1 indexes and substring queries](https://developers.cloudflare.com/d1/best-practices/use-indexes/)
- [SQLite FTS5 trigram semantics](https://sqlite.org/fts5.html#the_trigram_tokenizer)
- [D1 batch transaction behavior](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
