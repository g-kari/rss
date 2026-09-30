# Daily article recommendation notifications

Daily recommendations are an opt-in addition to the existing Web Push feature. They do not subscribe a browser, request notification permission, or change existing new-article/error notification settings automatically.

## User controls

Settings → AI・通知 contains an off-by-default recommendation toggle and a time selector in 30-minute steps. The shared IANA timezone and silent hours also apply. The existing 30-minute Cloudflare Cron Trigger runs on UTC; the sender computes the user's local date/time. A delayed run or spring DST gap can catch up later that local day. Quiet hours postpone delivery within that day; a slot that cannot run before midnight is skipped rather than sent as a backlog. Repeated fall DST hours have one local-date delivery key.

There is one digest per local date, with at most three unread articles from the last seven days. Empty digests are not sent. NSFW, non-article-view, muted-feed/group, disabled-notification-feed, snoozed, read, TTL/bulk-read and keyword-excluded articles are filtered. Saved/liked/reading-list state already stored in R2 provides ranking evidence; the browser's reading history is not uploaded. The in-app and server ranking may differ because their loaded candidate pools and available evidence differ.

Enabling recommendations explicitly also enables syncing only “興味なし” article IDs and timestamps. The account-scoped feedback has a 30-day/200-item bound and supports undo/reset. While disabled, new feedback remains local and queued; it is sent only on a later explicit opt-in. Browser/OS notification settings remain the user's responsibility. Article titles can appear on the lock screen.

## Data and delivery semantics

- Existing `users/{userId}/push.json`: recommendationEnabled, recommendationTime and recommendationDismissals, alongside subscription/silent-hour configuration
- New bounded `users/{userId}/recommendation-push.json`: current local day, planned article IDs, endpoint-hash outcomes and the most recent 200 planned IDs/links (30-day retention)
- No new database, Cloudflare binding, migration, AI request, analytics event or third-party recommendation provider
- Recommendation preference/feedback writes carry an expected-account header verified against the authenticated account’s server-owned profile; delayed auth recovery cannot apply one account’s queued feedback to another
- Conditional R2 ETag writes serialize slot/endpoint claims; PushConfig writers also use CAS so expiry cleanup cannot erase new preferences or subscriptions
- The outbox reserves articles before transmission. This prevents repeats after a crash or an uncertain provider response, at the cost of possibly missing a digest
- Each endpoint is marked attempted before transmitting. Accepted sends and ambiguous network/timeouts are not automatically retried. Only explicit HTTP 429/5xx rejections retry on a later cron, respecting Retry-After and at least a 30-minute wait, within the same local day
- A retry only considers the original planned IDs. Read, dismissal, feed/group, consent and subscription settings are revalidated before each device. Successful devices do not receive retries intended for another device. HTTP 404/410 removes expired subscriptions
- Provider acceptance is not proof of device display. Web Push is best-effort; OS focus/permission/offline behavior can delay or prevent display. Already-delivered notifications cannot be recalled when an article is read later
- User-state changes not yet synced from an offline browser cannot be known to the server

The sender consumes each eligible feed's current latest page sequentially. It never reads archive pages or fetches full text/OGP. Ranking retains at most 3,000 article metadata records and an estimated 8 MiB string budget, favoring existing interest evidence and newer articles; this bounds memory but can omit candidates from very large subscriptions. Each opted-in due user incurs preference/state/group/subscription reads plus one latest-page read per eligible feed. Non-due users only need preference reads. No numerical cost estimate is promised without actual usage metrics.

Notification tags are separate from new-article notifications. Clicking a digest opens the article list and navigates an existing app window if available. The worker only accepts same-origin HTTP(S) destinations. Existing privacy/keyword filters remain in force when navigating.

## Device requirements

The existing implementation uses standard Web Push with VAPID and a service worker. iOS/iPadOS Web Push requires a Home Screen web app (supported from 16.4) and an explicit user gesture to grant notification permission. Supported Android browsers likewise require site notification permission; no custom native app is needed. Runtime feature detection controls availability. See [WebKit's Web Push guide](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) and [Web Push overview](https://web.dev/articles/push-notifications-overview).

Cron and storage references: [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) and [R2 conditional writes](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).

## Verification

Unit/route mocks exercise defaults/validation, opt-in-only feedback, account switches and late responses, undo/reset, DST/quiet hours, read/privacy exclusions, CAS contention, duplicate invocations, partial device failures, Retry-After, expired endpoints, opt-out, and persistence failure. Service-worker VM tests cover payloads/tags and click routing without sending real notifications. Browser regression fixtures use production React/CSS and mocked local API responses, with no notification subscription or transmission.

Real OS delivery, production VAPID configuration and deployed Cron execution need an explicitly authorized device smoke test after publication. Implementation tests do not establish those production outcomes.
