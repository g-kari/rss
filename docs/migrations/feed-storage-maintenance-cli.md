# Verified per-feed storage migration

`scripts/migrate-feed-storage.mjs` makes the R2 preparation steps executable. It does not deploy a Worker, create resources, stop writers, apply SQL, or delete data. It defaults to local bindings. Keep real backups private and outside the repository; the CLI rejects a backup directory inside this checkout, including paths resolving there through symlinks. Feed metadata and articles can contain private subscription content. For the combined schema → conversion → indexing workflow, use the `migrate:feed` package command described in [migration commands](../migration-commands.md).

## Preconditions

1. Verify the actual account, bucket, deployed Worker version, bindings, plan and data inventory. Do not use a preview that shares production bindings for test writes.
2. Prepare and verify a preliminary backup before changing service availability. Activate the feed-writer maintenance guard and drain old invocations. The guard must stay enabled through the eventual automatic master deployment.
3. After draining, verify that the source still matches the backup. If it changed, make and verify a new backup in a new directory; retain the earlier copy. All referenced objects and the complete feed-prefix inventory must match before conversion. Stable observations alone do not cancel an old request or substitute for draining it.
4. Rehearse the same commands in isolated local/test bindings first. Inspect feed sizes, normalized article sizes, costs and database capacity before choosing production limits. An index record above 1.9 MB remains unsupported; resolve such data before cutover.

The tool operates on one explicit 16-character feed hash. Its default limits are 128 MiB and 10,000 objects for that feed. An excess fails before article downloads. Raising `--max-bytes` or `--max-objects` is an explicit operator choice after inventory/cost review. Backups stream object bodies to disk; migration/parity verification still parses each article object, so an oversized legacy final page needs enough executor memory.

## Local rehearsal

Use an existing synthetic local feed and an unused backup directory whose parent exists. The state root is shared with Wrangler CLI: `.wrangler/state` next to the selected config, or `--persist-to=<root>`; the proxy's `/v3` suffix is added automatically.

```sh
node scripts/migrate-feed-storage.mjs --feed=0123456789abcdef --operation=inspect
node scripts/migrate-feed-storage.mjs --feed=0123456789abcdef --operation=backup --backup-dir=/private/backups/feed-before-v2
node scripts/migrate-feed-storage.mjs --feed=0123456789abcdef --operation=verify --backup-dir=/private/backups/feed-before-v2
# Only after all relevant writers have actually been paused and drained:
node scripts/migrate-feed-storage.mjs --feed=0123456789abcdef --operation=migrate --backup-dir=/private/backups/feed-before-v2 --writers-paused
```

`--writers-paused` records the operator's assertion; it does **not** stop the deployed Worker. No request is sent to prove that flag. Inspect the effective deployment and source revisions as part of the pause procedure.

For production, copy `config/feed-maintenance.remote.example.jsonc` to a private operator file and fill the verified account ID and RSS_DATA bucket. Every command additionally requires `--config=/absolute/operator-config.jsonc --remote`. The remote config requires explicit `remote: true` and a real account ID. Never commit that operator file or its backups. Use existing authorized access; the tool does not create credentials.

## What is checked

- `inspect` lists only the requested feed prefix, verifies pagination advances, enforces byte/object limits and returns counts/sizes without article text
- `backup` requires a new directory and writes raw object bytes under hashed filenames, including orphan objects. It records object key, ETag, size, HTTP/custom metadata and SHA-256, rereads local checksums, and rechecks the source inventory/metadata before writing a complete manifest
- `verify` checks binding/feed identity, allowed filenames, local checksums/sizes and the entire current source inventory/metadata. New or changed objects make the backup stale
- If a migration receipt exists, `verify` instead checks the recorded v2 revision, original archive retention and article contents against the legacy backup. It remains read-only, including when the metadata mirror needs repair
- `migrate` requires the exact verified legacy backup. Every migration read is checked against the captured source. Writes are restricted to new immutable segments, the conditionally committed latest head, and a conditional metadata mirror update. No old object is deleted
- After conversion, every logically referenced article is compared by ID and canonical content hash with the backup. Legacy first-copy duplicate precedence is retained; unreferenced old page files stay backed up but are not counted as live articles
- A `migration-result.json` receipt records the committed revision, metadata update and final article verification. An existing receipt prevents blind reruns
- `resume` requires the original verified backup, its matching receipt and `--writers-paused`. It never writes another article head; it validates the recorded v2 contents, repairs only a still-original metadata mirror (or accepts the exact already-repaired value), verifies the final state and updates the receipt. An unrelated revision or independently changed metadata is rejected

An existing empty `latest.json` array can be converted. A missing source head is an explicit error; inspect genuinely empty/uninitialized feeds and handle their index-only setup separately. Already-v2 feeds need only index backfill; this CLI deliberately rejects converting an already-v2 backup.

## Then build the search projection

Create/configure the approved dedicated D1 database and apply all SQL files in `migrations/article-search/` (including `0003_rebuild_nul_safe_fts.sql`). Do not apply retired root migrations. Keep writers paused while building against the final v2 revision:

```sh
# Local binding example; use the separately approved remote search config for production.
node scripts/rebuild-article-search.mjs --feed=0123456789abcdef --config=config/search-index.local.jsonc
```

Repeat for the intended feed set and verify every source revision is ready before exposing indexed search/resuming writers. The search runner never writes R2. See [index operations](../article-search-index.md) for readiness, checkpointing, resource budgets and query semantics.

## Failures and recovery

An incomplete backup has no complete manifest and is never accepted for migration. Partial files are kept for inspection. A pre-commit R2 failure leaves the old authoritative head readable; immutable objects written before a failure may remain orphaned and must not be deleted automatically.

If a head commit succeeds but the metadata mirror or final verification fails, the operation reports failure and retains its receipt and backups. This is **not** a rollback. Keep writers paused. Use receipt-aware `verify`, then `--operation=resume --writers-paused` (or re-run the combined apply command) to recover only the exact recorded revision. If no receipt was durably recorded, the source has drifted, or metadata changed independently, stop for operator inspection/restoration. Do not delete a receipt or fabricate one to bypass the check.

The old Worker cannot read v2 heads. A code revert alone is unsafe after conversion. Preserve source objects and backups, reconcile any post-backup articles before restoration, and use the [storage rollback procedure](shared-feed-segments.md#rollback).

## Tests

```sh
pnpm exec vitest run src/lib/feed-storage-maintenance.test.ts src/lib/shared-feed-storage.test.ts
node --test scripts/lib/search-maintenance-options.test.mjs scripts/rebuild-article-search.test.mjs
```

The binding-backed smoke uses isolated temporary local R2/D1 and synthetic articles. It covers private backup, checksum/ETag checks, explicit legacy conversion, 601 article content verification, all search migrations, resumable D1 indexing, ready revision, search parity and preservation of the legacy archive.
