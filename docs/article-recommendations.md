# Local article recommendations

The all-articles list includes a small, collapsible “いま読むおすすめ” section with up to three unread articles. Existing sidebar feed discovery remains separate.

## Scope and ranking

- Ranking itself uses only articles already loaded by the reader, with no AI or analytics. Optional daily notifications are a separate opt-in server feature; feedback checks notification consent before any synchronization
- Keeps existing NSFW, keyword, muted-feed, snooze, view, group, tag, and collection constraints
- Reader exceptions that retain an active article are explicitly excluded from recommendation evidence and candidates when that article fails content/privacy filters
- Bulk read flags and the effective read/TTL cutoff exclude read articles; they never train interests
- Bookmarks and likes weigh 3 per article, reading-list entries weigh 2, and viewed articles weigh 0.5; duplicate article IDs are counted once
- RSS categories and user feed categories provide topic matches. Reasons distinguish saved/liked topics from viewed topics
- Freshness decays over three days; topic/feed affinity is capped. Repeated publishers and topics get selection penalties, and duplicate IDs/links are removed
- No history is required: new unread articles from subscribed feeds form the cold start
- Recommendations are hidden during search, specialized lists, non-article views, and explicit filters. Ordinary unread-only mode remains supported

## Feedback

“興味なし” hides only that article. It does not infer dislike of a theme or change read state. The account-scoped browser record expires after 30 days and holds at most 200 unique IDs. Undo and reset are available. Invalid/future-dated records are ignored. Writes read the latest stored state, and other-tab changes are observed. Feedback stays local by default. Explicitly enabling daily recommendation notifications also opts into syncing article IDs and dismissal timestamps (see [daily recommendation push](recommendation-push.md)); reading history remains local.

## Validation

Automated coverage is in:

- `src/lib/article-recommendations.test.ts`: freshness, topic evidence, read and TTL exclusion, publisher diversity, deterministic ordering, deduplication, cold start, and signal deduplication
- `src/hooks/useRecommendationDismissals.test.ts`: account switches, corrupt storage, TTL, size limits, undo/reset, cross-tab updates, and stable state references
- `src/hooks/useFilteredArticles.recommendations.test.ts`: strict content/privacy scope, active-reader exceptions, exhausted-feed evidence, and effective TTL cutoff
- `src/components/ArticleRecommendations.test.tsx`: selecting articles, immediate dismissal, feedback and focus, undo/reset, collapse/reopen, account switch, and strict candidate scope

### Browser QA still required

Browser execution was unavailable in the implementation environment. The unit fixtures above are synthetic and require no production account or data. Before release, use the normal local development workflow and verify:

1. At 320 px, 390 px, and desktop widths, check long titles/reasons, 44 px minimum action height, no horizontal overflow, and both recommendation/list scrolling
2. Keyboard-open an article, navigate Back, collapse/reopen, and dismiss several cards. Focus must move to Undo after dismissal and to the disclosure after undo/reset
3. Dismiss, reload, switch accounts, and repeat in two tabs; verify only the intended account/article is affected
4. With automatic read disabled, keep an unread article selected while applying NSFW, keyword, mute, or snooze restrictions. It must not appear or influence the recommendation panel
5. Test light/dark themes, all layout modes, search entry/clear, loading/retry, all-read, and all-dismissed states
