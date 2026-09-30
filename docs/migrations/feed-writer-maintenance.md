# Feed-writer maintenance pause

This is local rollout preparation. It does not enable maintenance in production, deploy a
Worker, stop existing invocations, or establish a backup. Production activation and
resumption require the operator's separately approved rollout.

## Contract

The optional Worker variable `RSS_FEED_WRITES_PAUSED` is read from the invocation's `env`:

- Unset: normal behavior (backward-compatible default)
- String `"false"`: normal behavior; surrounding whitespace and case are ignored
- String `"true"`: paused
- Any other configured value, including empty/blank, `"0"`, `"1"`, `"yes"`, or a non-string:
  paused. Invalid configuration fails closed; only unset or explicit `"false"` permits writes

While paused, the Worker rejects every non-GET/HEAD/OPTIONS request in `/api/feeds` and its
subtree. This includes registration, import, bulk/single refresh, reinference, PATCH, DELETE,
and content-cache purge. The same guard covers POST/DELETE `/api/test/seed` defensively;
the test route's existing production/auth restrictions remain unchanged when unpaused.
Responses are JSON with status 503, code `FEED_WRITES_PAUSED`, `retryable: true`,
`Retry-After: 300`, and `Cache-Control: no-store`. Retry-After is advisory, not a promise
that the operator will finish maintenance in five minutes.

The boundary runs before the generated OpenNext handler, without reading the request body,
accessing bindings, authenticating, or fetching upstream. GET/HEAD reads, OPTIONS preflight,
article routes, and authentication routes still go through the original handler with the
same request, environment, execution context, and receiver. Existing authentication and
ownership checks are neither removed nor bypassed. Path matching conservatively handles
encoded separators/ASCII, nested escapes, repeated/trailing slashes, backslashes, dot
segments, and case variants without rewriting the actual request.

A paused scheduled invocation returns before both RSS fetching and content/OGP prefetch.
Direct `fetchAllFeeds` calls also return immediately. Direct registration, shared-feed
update, bulk refresh, and single refresh calls throw `FeedWritesPausedError` before any
binding/network work, including D1 repair. The flag is not a bucket-wide lock: explicit
operator migration/backfill scripts and any other deployment accessing the bucket remain
outside this guard. Keep all such writers under the rollout's separate control.

## Preserving the pause through deployments

`wrangler.toml` intentionally does not assign the flag under `[vars]`. Its top-level
`keep_vars = true` retains existing operator/dashboard variables on Wrangler deployments.
The installed Wrangler schema documents this behavior, and its deployment implementation
passes `config.keep_vars` into the upload option. Regression tests assert the checked-in
configuration retains variables and contains no active hardcoded pause value.

An explicit value in a config, environment override, CLI option, or generated deployment
artifact can override a retained variable. A dashboard-only pause is therefore insufficient
without checking the actual deployment path. For every cutover, including automatic master
build/deployment, inspect the effective generated Wrangler configuration and deployed
variables. It must retain `keep_vars = true` or explicitly carry the approved pause value
`"true"`; it must not inject `"false"`. Do not assume a local source-file setting proves
what Cloudflare deployed. If the build pipeline does not preserve this setting, stop the
cutover and supply an explicit paused deployment configuration before proceeding.

No production configuration command is run by this change. The local tests use synthetic
requests, mock bindings, and a test-only virtual OpenNext dependency. They verify runtime
gating and the checked-in configuration, not the effective production variables or drain.

## Activation and cutover checklist

1. Obtain approval for the target Worker/account, maintenance interval, migration, backup,
   and rollback plan. Inventory every deployment, schedule, service binding, external
   writer, and operator job capable of modifying the feed objects. Take and verify a private
   preliminary backup before changing service availability. It must be reconciled/replaced
   with a fresh verified backup after draining if the live source changed in the meantime.
2. First deploy the compatible guard-bearing version with `RSS_ARTICLE_STORAGE_V2` and
   `RSS_ARTICLE_SEARCH_INDEX` unset. It keeps legacy writes/search active without requiring D1.
   Do not enable either rollout gate yet. If deploying with conversion already enabled, the
   pause must be effective from its first exposure to traffic or cron; setting it afterward
   leaves a write window.
3. Set the operator-managed variable to `"true"`, verify the effective deployed value,
   and confirm the approved rollout reaches all relevant routes/versions. A version that
   predates this guard ignores the variable. Mixed-version deployments are not quiescent.
4. Probe the mutating route families with approved harmless requests and confirm the
   maintenance 503/code/headers. Confirm feed/article reads and the normal auth flow still
   work. Verify scheduled logs/observations show both ingestion and prefetch suppressed.
5. Drain old instances and in-flight requests, including background `waitUntil` work.
   This flag does not cancel an invocation already running with an old environment snapshot.
   A successful 503 probe alone does not prove a quiet bucket. Do not use an arbitrary short
   sleep as proof. Check deployed-version status and runtime/log evidence of completed old
   work, then verify feed head revisions/ETags, metadata identities, and relevant object
   listings remain stable across the rollout's quiescence verification interval. If anything
   changes, identify the remaining writer and repeat the drain/verification.
6. Only after quiescence is established, take and verify the final feed backup. Follow
   [the shared-feed migration procedure](shared-feed-segments.md) and
   [the search-index procedure](../article-search-index.md). Keep the flag `"true"` through
   the automatic master deployment, explicit v2 conversion, metadata repair, D1 backfill,
   and final head/index revision verification. Recheck the effective flag after every
   deployment, not just at the start of maintenance.
7. After all migration/backfill results are verified, enable `RSS_ARTICLE_STORAGE_V2=true`
   and `RSS_ARTICLE_SEARCH_INDEX=true` while still paused. Resume only after verification. Explicitly
   change the effective flag to `"false"`; deleting it from the local config does not remove
   a retained remote `"true"`. Verify the actual deployment value and normal mutation
   behavior, then observe the next scheduled ingestion/prefetch, R2 writes, and index health.

## Reversibility

The guard can be resumed by setting `"false"` without changing stored data. Re-enabling
`"true"` blocks new work again but still requires a drain before another backup/restore.
Do not remove the guard or deploy an old writer while maintenance depends on it. Reverting
this guard is not a storage rollback: after v2 heads exist, the legacy code still requires
the compatibility/restore procedure described in the storage migration document.
