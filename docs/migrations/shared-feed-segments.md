# Shared feed article storage v2 (#1377)

This change has not created or migrated production resources. A production rollout, data backup,
D1 index population and deployment require separate operator approval.

## Stored format and public compatibility

Normal ingestion remains on the legacy writer until `RSS_ARTICLE_STORAGE_V2=true` is explicitly configured. Missing/false/invalid values do not convert old heads. Already-v2 heads continue using the v2 writer regardless of the flag, so disabling it cannot downgrade a migrated feed. The explicit maintenance conversion API is unaffected by this runtime rollout gate. Complete the backup/pause/drain procedure before enabling conversion; an ETag guard is not a replacement for stopping old writers.

The default writer no longer cascades `p2.json`…`pN.json`. `latest.json` stays an `Article[]`. The first overflow after this code reads only the current tail page (`p{pageCount+1}`) to record its length, then writes:

- `feeds/{feedHash}/articles/overflow-pending.json` — newest incomplete archive page
- `feeds/{feedHash}/articles/segments/spill-{n}.json` — immutable 500-article pages, newest first
- `feeds/{feedHash}/articles/overflow-manifest.json` — the archive commit record

Later inserts do not read middle legacy pages. A full pending page is sealed into a new spill object; older `pN` bytes stay untouched. `meta.pageCount` becomes the logical archive page count. The manifest is the reader source of truth, including for a later explicit v2 migration, so spilled articles are not dropped. Articles past the 250,000 logical-page cap stay on the last page and set `oversizeAlert`. A crash after the latest CAS and before the manifest write can hide the displaced archive page until a later spill adopts an uncommitted pending object; counts can lag across that window, as they could when a cascade failed. Rolling back to a worker that ignores the manifest hides spilled articles until this reader returns. It does not delete `pN` objects. Do not enable `RSS_ARTICLE_STORAGE_V2` as part of this path.

- `feeds/{feedHash}/articles/latest.json` is the atomic commit record. Legacy values are an
  `Article[]`; v2 values contain `version: 2`, a UUID `revision`, newest `articles`, immutable
  `segments`, `nextSegmentId`, bounded `knownIds`, and `articleLocations`.
- `articleLocations` maps retained archived IDs to a stable segment priority. Latest IDs are
  implicit in `articles`. The retained deduplication window remains `KNOWN_IDS_MAX = 10,000`.
  IDs outside that window may be treated as new if an upstream feed reintroduces them, as with
  the prior implementation. This is deliberately not an unbounded all-history ID index.
- Every newly written archive object is an `Article[]` at
  `feeds/{feedHash}/articles/segments/{revision}-{sequence}.json`, at most 500 articles.
  Objects are immutable. A partial segment is replaced by a new object, never overwritten.
- Existing `p2.json` through `p{pageCount+1}.json` are read by the compatibility reader.
  When v2 migration is enabled, the first content-changing update (or refresh that inspects an archived item) scans legacy pages once, records their boundaries, removes
  pre-existing duplicate IDs, and splits an oversized last legacy page if needed. Unchanged legacy
  objects can be referenced directly. Missing referenced objects abort migration instead of
  silently dropping their contents.
- The public API continues to use newest-first logical `page=1..500`, independent of physical
  object keys. Each ordinary logical page contains at most 500 articles. `pageCount` continues to
  mean the number of historical pages (total logical pages minus one). Articles beyond 250,000
  remain accessible in logical page 500, which may exceed 500 items; `oversizeAlert` is set.
- Date and ID tie ordering use `compareByDateDesc`. Late arrivals and publication-date corrections
  are merged in order rather than being exposed in physical ingestion order.
- All code must use the storage readers. Directly parsing `latest.json` as `Article[]` is no longer
  valid. Test seed helpers may still write legacy arrays to exercise the compatibility path.

## Cost and failure model

For a migrated feed, an ordinary insertion of at most 1,000 new items writes at most three new
500-item segments and one head. If only a few articles arrive, it writes one archive head plus the
new latest head, regardless of the number of full archive segments. Known-ID lookups are exact
and bounded: genuinely new IDs do not trigger historical candidate reads. Updating existing
archived articles reads/replaces only the identified objects; a date edit that changes the latest
boundary may also promote overlapping archive runs. The legacy migration is a one-time O(history)
operation. Head metadata size grows with the number of immutable segments, not their article bodies.

Sorted page reads skip disjoint archive runs by their count/date bounds. Overlapping date ranges
need merging; unusually out-of-order feeds can require more reads than chronological feeds.

All segment writes finish before the head's ETag-conditional PUT. A failed segment/head write
leaves the old head authoritative. A lost compare-and-swap retries against the winner (three
attempts); after that the fetch fails explicitly. Only a successful head commit changes the
article revision and invokes derived-index synchronization. Metadata in `meta.json` is a mirror;
the head remains authoritative. A HEAD-only repair on 304/empty refresh and feed-list reads also restores stale pagination counts.

New head writes include `customMetadata.articleRevision`, `articleCount`, and `pageCount`, allowing the search index to check
readiness with HEAD requests rather than downloading every feed's article bodies. A stale D1
revision is not a valid source for search. Index rebuilds iterate only objects referenced by a
captured head, and incremental synchronization consumes the committed changed/removed object list.

A crash/CAS conflict can leave unreferenced segments. Do not discover live content by listing all
segment keys. Do not delete replaced or orphan objects during a request: concurrent readers and
index rebuilds can still hold an older snapshot. Future garbage collection must use explicit
retention, reachability from retained snapshots/backups, and separately approved deletion.

## Explicit conversion API

`migrateFeedArticleStorage(bucket, meta)` converts one feed using only its existing R2 objects.
It returns `{ migrated: boolean, commit?: FeedArticleCommit }` and never fetches the feed URL,
adds a synthetic article, updates content, accesses D1, or deletes an old object. An existing
empty `latest.json` array is a valid source; a missing latest object is rejected even if the
metadata says the feed is empty. Missing/corrupt referenced legacy pages are also rejected.

The explicit path uses the same segment preparation and segment-first, ETag-conditional head
publication as ordinary updates. It can migrate unchanged latest-only feeds while writers remain
paused. Existing IDs are deduplicated with the storage layer's existing precedence, date/ID order
is preserved, unsorted legacy archive runs are rewritten in order, and oversized legacy pages
are split without dropping articles. A conflict retries against the current head; if another
migration wins, the retry becomes a no-op. Repeated conflicts or failed writes preserve the
previous authoritative head, and unsuccessful attempts do not mutate the caller's metadata.

On success, the supplied `meta` object is repaired from the committed snapshot, including its
revision, count, logical page count, known-ID window, and oversize flag. Upstream ETag, last-modified,
fetch timestamps, title, and other feed settings are unchanged. The function intentionally does
not write `meta.json`: the rollout runner must persist that repaired metadata after the head commit.
If that metadata write is interrupted, invoking migration again returns `{ migrated: false }`,
repairs the supplied metadata from the existing v2 head, and writes no article object.

After conversion, persist metadata, verify the committed snapshot and all referenced objects,
then perform the final D1 backfill against that revision. An already-v2 migration call validates
and reads the head but does not scan every archive; full reference verification remains part of
backfill/rollout verification. Neither a successful R2 conversion nor the returned change record
means the search index is ready. Keep writers paused through final verification and backfill.

## Controlled production rollout

1. Take an inventory of feeds and current object sizes, including oversized legacy final pages.
   Exercise migration, rebuild, CAS conflicts and rollback in a separate test bucket first.
2. Pause every writer: scheduled fetches, manual refreshes, feed creation/import, and other paths
   invoking article merge. Ensure no old Worker instance is still writing.
3. Back up each feed's exact `latest.json` and `meta.json`, retaining object identities and an
   inventory of the historical `pN.json` objects. Preserve existing historical objects. Back up
   the complete feed prefix if the storage provider/process cannot guarantee their retention.
4. Deploy the v2 reader/writer only after the backup is verified, with every writer still paused.
   Roll out a small feed set first. Invoke `migrateFeedArticleStorage` for each selected feed and
   persist its repaired metadata; do not simulate an upstream update to trigger conversion.
   Ordinary merge calls can also migrate lazily, so the writer pause must remain active.
5. Verify the logical article set/order, 499/500/501 boundaries, historic final page, head metadata
   revision, and successful search-index rebuild for the same captured revision. Do not mark D1
   ready when a referenced R2 object is missing or a head changes during rebuild.
6. Resume writers gradually and monitor R2 operation counts, storage failures, CAS conflicts,
   `oversizeAlert`, and search-index readiness. A migration failure must retain old conditional
   fetch validators so the next refresh retries the content rather than accepting a 304 forever.

## Rollback

A plain code revert is unsafe once any `latest.json` is a v2 envelope: the old Worker expects an
array. Keep all writers paused during rollback. Either run a version with the v2 compatibility
reader, or restore the verified pre-rollout `latest.json` and `meta.json` backups together before
re-enabling the legacy Worker. Restoring those backups also removes visibility of post-backup
articles; export/reconcile them deliberately before choosing that rollback. Do not delete v2
segments or D1 data merely to make rollback appear complete. Rebuild the derived index against the
restored head revision before serving indexed search.
