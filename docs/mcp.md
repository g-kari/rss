# RSS MCP: read-only by default, optional public-feed additions

## Public-feed subscription additions (separate opt-in)

The optional `add_subscription({url})` tool requires the separate `rss:subscriptions:add` OAuth scope and `RSS_MCP_SUBSCRIBE_ENABLED="true"`, in addition to the existing approved MCP setup. Both gates are set to `"true"` in the committed `wrangler.toml` `[vars]` (Workers Builds deploys them from master), and the dedicated `OAUTH_KV` binding (namespace `rss-reader-OAUTH_KV`) is active in `wrangler.toml`, so MCP is enabled once deployed (no secrets are required by this feature). Existing `rss:read` grants do not gain write authority. A write-only grant does not gain stored article or subscription read authority. Scope expansion, production configuration, plugin installation, and user-controlled OAuth consent remain separate approval steps after exact-diff review and verification.

The authorization server advertises its scope catalogue. When additions are enabled, the resource has no globally required scope: each read tool still requires `rss:read`, and the add tool requires `rss:subscriptions:add`. Tool descriptors and insufficient-scope challenges name the operation's exact permission. Consent displays and binds the exact requested scopes; refresh may downscope but cannot expand a grant. Account connection status shows the union of explicitly approved scopes, which never authorizes an individual token beyond that token's own grant.

This tool accepts one bounded, credential-free public HTTPS RSS/Atom/JSON Feed URL. It refuses private/reserved/IP-literal targets, credentials, fragments, non-default ports, unknown query formats, known default/configured RSSHub origins, and conservatively identified secret-looking paths. The one public query format supported in this MVP is the official YouTube channel feed with a well-formed `channel_id`. Some legitimate feed URLs are intentionally unsupported. Opaque path secrecy and generic publisher ownership cannot be perfectly inferred; callers must discover publisher-provided official feeds. All labels, source text and URLs remain untrusted data.

The network helper validates the initial URL and every redirect before fetching, applies the stricter feed policy without weakening existing callers, bounds redirects/time/body/parser work, and records only actual validated visited URLs. No Cookies, auth headers, selectors, HTML conversion, RSSHub conversion, or AI fallback are used. Actual RSS/Atom/JSON Feed structure is validated; MIME alone is insufficient. The existing Worker public-fetch policy is reused and this feature does not claim DNS pinning.

An addition uses the final validated URL as its canonical identity. An optional backward-compatible `publicFeedAliases` array stores at most five actually visited safe redirect URLs so repeated alias calls can return `already_subscribed` before another fetch/cooldown. Unverified feed self links are not aliases. The read lane's allowlisted DTOs do not expose this new field.

All production subscription writers transform a fresh bounded snapshot with conditional ETag writes: add, import, targeted PATCH/DELETE, group clearing, and last-access updates. No data-layout migration or new storage key is required. Dedupe/capacity are rechecked after contention; existing settings and unrelated concurrent entries are preserved. User-index additions are conditional too. An empty account conservatively remains in the index after unsubscribe because deletion from a separate object can race an add and hide the new subscription; cron safely skips empty arrays. Index compaction is outside this change.

The add lane respects the existing 30-second add cooldown and `RSS_FEED_WRITES_PAUSED`, and rechecks scope, token expiry, ownership, connection revision, and maintenance before committing. Normal GET last-access maintenance writes are also suppressed while paused. Revocation blocks subsequent requests; an already-started operation is not promised to be cancellable atomically across independent records.

Results distinguish `added`, `already_subscribed`, `repair_required`, and bounded failure statuses. `repair_required` has `subscriptionCommitted:true`: the subscription exists, but an index/cache repair failed; clients must not report completion or blindly add another copy. Repeated calls repair idempotent index/cache state without changing settings or fetching a private resource. Initial articles arrive through the normal cron; the MCP add call does not invoke a generic refetch or promise instant article availability.

Offline verification: `node scripts/verify-mcp-subscription-worker.mjs` bundles the actual native code and runs local workerd with disposable synthetic KV/R2 and a fixed in-memory publisher response. It verifies real synthetic token exchange, per-tool scopes, add/repeat/read, aliases excluded from read DTOs, maintenance, feature-off rejection, and revocation. No production account, real credentials, publisher network, or live configuration is used. Miniflare substitutes a loopback transport Host; the fixture reconstructs only its canonical synthetic request envelope. The production Host guard is unchanged and independently unit-tested. This is not real-browser consent/DBSC/CIMD, a live plugin connection, or a final security review.

Keep this change local/draft until independent exact-diff security review, final aggregate checks/builds, and browser/live-connection verification pass. Do not activate an X-to-RSS automation until harmless reads succeed on Twilog and the actual personal reader, and both list/add capabilities are confirmed. The intended recurring workflow finds only officially published public feeds from the owner's X posts/reposts, deduplicates canonical identity and server idempotent results, reports confirmed additions/actionable blockers, and remains quiet on no-op runs.

The application can expose its current user's subscriptions and stored feed articles to an OAuth-linked MCP client. It keeps the existing `rss.0g0.xyz` hosting and 0g0 ID sign-in. There is no Site proxy, AI request, live article fetch, Durable Object, or persistent MCP transport session.

## Rollout is opt-in

`RSS_MCP_ENABLED="true"` and the dedicated `OAUTH_KV` binding (`rss-reader-OAUTH_KV`) are both set in `wrangler.toml`; removing either turns MCP off. Missing, malformed, or partial setup fails closed; ordinary RSS login, feed routes, maintenance, and cron retain their behavior.

Provisioning a production namespace, setting its binding/enable variable, creating/installing the private plugin, granting OAuth access, and reading real user data are separate rollout actions. Do not create a namespace or grant while merely testing this code. Never alias `OAUTH_KV` to `RATE_LIMIT`, put a placeholder namespace ID in active config, or paste tokens into chat/plugin files/query URLs.

After approved rollout, a private plugin can reference the canonical Streamable HTTP endpoint `https://rss.0g0.xyz/mcp`. OAuth discovery and S256 PKCE handle connection; no API key is needed in the plugin package. Successful package creation alone does not prove installation, authorization, or authenticated tool calls.

## Identity and consent

- The RSS first-party session verifies the current user's existing pairwise 0g0 subject. An RSS-side OAuth adapter issues a separate resource-bound `rss:read` grant. 0g0 access/refresh tokens are never sent to the MCP client.
- The authorization page shows the client name, verified CIMD domain, redirect hostname, account, scope, lifetime, and disconnection limitations. Client metadata is untrusted and escaped. No remote client logo is loaded.
- `rss:read` covers subscription labels and stored articles from currently subscribed feeds, including private/NSFW subscriptions. It excludes personal notes, read/likes/bookmark state, saved private clips, profile fields, request cookies, credential-bearing feed URLs, GUIDs, and arbitrary metadata. Reading cannot edit subscriptions, mark read, or issue new credentials.
- A logged-out request uses a 10-minute browser-bound provider transaction and returns only to the exact authorization route after normal 0g0 login. Logged-in final consent binds the account/revision shown on the page. Account changes, expired/replayed handles, invalid Origin, and stale approval are refused. Ordinary login's state/Cookie/DBSC path is retained.
- After an approve/deny/login form POST, a script-free same-origin continuation page automatically continues to the client for approve/deny via a zero-delay `<meta http-equiv="refresh">` (scripts and a 303 are blocked by the CSP/`form-action 'self'`), keeping “アプリへ戻る” as the manual fallback; “ログインへ進む” still requires one click. Only a provider-validated callback or the server-constructed first-party login URI becomes the link/refresh target. `form-action 'self'`, no-store and anti-framing remain; the link uses `noreferrer` and the refresh carries no Referer. MCP browser responses use `Referrer-Policy: same-origin` so native same-origin forms keep their Origin while cross-origin Referer is withheld.
- API access is Bearer-only. Cookie sessions, clip write tokens, ordinary login JWTs, wrong audience/user/scope, expired tokens, and disconnected revisions are refused. Missing Origin is permitted for server MCP clients; present Origin and canonical Host are checked.

## Protocol and endpoints

The implementation uses pinned `@modelcontextprotocol/server` 2.3.0 and `@cloudflare/workers-oauth-provider` 1.2.1, plus zod 4.6.5. The SDK's native handler supports modern per-request MCP and the 2025 stateless Streamable HTTP compatibility lane. GET/DELETE session/listen operations return 405; modern subscriptions/listen/subscribe operations and JSON-RPC batch arrays are refused before SDK dispatch. One bounded tool call is permitted per HTTP request. No MCP session ID/event stream state is stored.

- `/mcp`: protected MCP endpoint; request body max 16 KiB; private/no-store responses.
- `/.well-known/oauth-protected-resource/mcp`: RFC 9728 canonical resource metadata. The root `/.well-known/oauth-protected-resource` is a discovery alias.
- `/.well-known/oauth-authorization-server`: OAuth metadata, exact issuer/resource and S256/CIMD support; no DCR endpoint.
- `/api/mcp/authorize`: first-party browser consent/resume, GET and POST.
- `/api/mcp/token`: provider-owned code/refresh/revocation behavior. Form bodies are bounded before parsing.
- `/api/mcp/settings`: browser-readable connection status and explicit account-bound disconnect form.
- `/api/mcp/connection`: session-only JSON status GET and account-bound DELETE. DELETE requires the current session subject in `X-RSS-Account-Id` and a matching Origin.

MCP tools have `readOnlyHint=true`, `destructiveHint=false`, `idempotentHint=true`, `openWorldHint=false`, and explicit OAuth security schemes. All argument objects are strict; callers cannot select a user, scope, arbitrary URL or storage key.

### Tools

1. `list_subscriptions({limit?, cursor?})`: default 20, max 100. Pages before metadata fanout. Returns stable `feedId`, bounded title, subscribedAt, metadata availability and safe public site origin/timestamp. A missing metadata record is displayed as missing but never grants article access.
2. `list_articles({feedId, limit?, cursor?, createdSince?})`: default 20, max 100, explicit subscribed feed. Covers only the current latest retained window, at most 500 articles; `exhaustiveArchive=false`. Inclusive `createdSince` uses ingestion `createdAt`, not a potentially backdated publisher timestamp. This is not an article-edit/change stream. Returns stable article IDs, content revisions, safe `articleRef`, bounded plain summaries and provenance.
3. `get_article({feedId, articleRef, cursor?})`: selected reference from list results; plain text in UTF-8 chunks at most 16 KiB, with revision-bound continuation. It reads committed stored content only. Historical archive and saved clips are outside this MVP.

Cursors/references are bounded pagination data, not credentials. They bind operation, hashed subject, feed, filter, snapshot/content revision and offset. No cursor can choose a storage path. Changed snapshots require restart; clients deduplicate by stable IDs/revisions. A subscription is evidence of attention, not proof that a user likes or endorses content.

Every feed/article title, category, summary/body, custom title and link is untrusted data. Static server instructions and structured result warnings preserve that boundary. Text requesting actions, credentials, or instruction changes remains source text; it cannot redefine tools or authorize actions. Visible credential-bearing URLs are conservatively reduced to public origins; unknown secret-bearing URL paths are not claimed to be perfectly redactable.

## Storage, revocation and lifetimes

The dedicated OAuth KV stores secret codes/tokens by hash, encrypted grant props, and minimal storage-visible userId/metadata. Props contain only verified RSS user identity and an approved connection revision. Consent/login transactions expire after 10 minutes; access tokens after 15 minutes. Refresh grants initially and after each successful refresh expire after 30 days without refresh. This avoids monthly manual token replacement for an active connection; it is ongoing read access until RSS-side disconnect or idle expiry.

Existing R2 contains one `users/{userId}/mcp-connection.json` active/revision record. Conditional writes prevent an old consent page or in-flight refresh from undoing a newer disconnect. Every protected read and code/refresh exchange checks this record through the R2 binding and fails closed on outage/corruption. Read tools themselves perform no R2 writes.

The RSS-side disconnect first commits a new inactive R2 revision, then attempts bounded KV grant cleanup. Subsequent requests using old revisions are rejected even if KV lags. Cleanup does not blindly revoke a concurrently newly approved connection. Already-in-flight/completed reads cannot be recalled. ChatGPT-side disconnect or the stock provider revocation endpoint alone does not necessarily update R2, and is not promised to have the same immediate RSS-side effect. Keep the inactive revision record; deleting it would weaken stale-grant handling.

Expiring provider records use KV TTL. This feature does not add permanent per-request/session objects or a new cron job. Store no article text, notes or upstream credential in OAuth state. Do not log tokens, Cookies, OAuth form bodies, transaction handles, or raw credential/storage errors.

## Limits and cost

Hard per-data-call budgets cover 1,000 subscriptions, 500 latest articles, individual object bytes, 12 MiB total decoded reads, 102 object reads, bounded field/text conversion, 512 KiB result data, and 16 KiB content chunks. Invalid/corrupt/oversized data returns a clear error rather than a misleading complete empty result. A native Worker KV throttle reuses the existing pure sliding-window logic, allows 60 requests/minute per user and fails closed on KV errors. It is not an atomic cross-POP quota or billing hard cap.

There is no AI spending or new paid contract in this implementation. Running it adds ordinary Workers/KV/R2 operations, including one strongly consistent revision lookup per request/exchange. Account-wide allowances and usage determine actual charges; zero additional cost is not guaranteed.

## Verification and activation checklist

- Run complete lint/format, typecheck, focused and aggregate unit tests, and production/OpenNext builds against the exact patch.
- Exercise actual local workerd with synthetic KV/R2/client/grant data; Node's WorkerEntrypoint shim is not Worker runtime proof. Test exact audience/scope/expiry, S256/CIMD metadata, code/refresh, modern/legacy tools, account isolation, revoked stale KV tokens, races, and strict budgets.
- Verify provider helpers and every Set-Cookie/security header survive actual OpenNext consent/login flows, including signed-out interruption, account change, concurrent tabs, deny, expired/replayed state, and DBSC challenges.
- Obtain independent exact-patch security review and exact-commit CI. Missing configuration must still leave normal RSS working and MCP disabled.
- Before production activation, get approval for the specific namespace/binding/variable changes and connection steps. After approval, verify deployed configuration, perform user-controlled OAuth consent, and prove an authenticated own-account subscription/article call and an unauthorized call. Until then, do not describe the private plugin as connected or the feature as delivering real user interests.

References: [OpenAI OAuth](https://developers.openai.com/plugins/build/auth), [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), [Cloudflare OAuth provider](https://github.com/cloudflare/workers-oauth-provider), [KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/), [R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/).
