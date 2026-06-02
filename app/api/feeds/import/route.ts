import { NextResponse } from "next/server";
import { withSession, applyCooldown } from "@/lib/server-auth";
import { apiError, formatError } from "@/lib/api-error";
import { purgeFeedsCache } from "@/lib/cache-helper";
import { opmlImportCooldownKey } from "@/lib/r2";
import { XMLParser } from "fast-xml-parser";
import { isValidFeedUrl } from "@/lib/url";
import { toArray } from "@/lib/xml-parser";
import {
  computeFeedHash,
  getOrCreateFeedMeta,
  assembleClientFeed,
  readUserSubscriptions,
  writeUserSubscriptions,
  R2_CONCURRENCY,
  MAX_FEEDS_PER_USER,
} from "@/lib/shared-feed";
import { pMapSettled } from "@/lib/concurrency";
import type { SharedFeedMeta, FeedGroup } from "@/types";
import { fetchArticles } from "@/cron/fetch";
import { readFeedGroups, writeFeedGroups, MAX_FEED_GROUPS_PER_USER } from "@/lib/feed-groups";
import { extractFeeds, type FeedEntry, type OpmlOutline } from "@/lib/opml";
import { MAX_OPML_ENTRIES } from "@/lib/validation";

interface RawParsedOpml {
  opml?: {
    body?: {
      outline?: OpmlOutline | OpmlOutline[];
    };
  };
}

// OPML はフィードタイトル等に HTML エンティティ（&amp; 等）を使う場合があるため
// processEntities: true を維持しつつ、ネスト展開を 1 段階・総展開数を 1000 に制限して
// Billion Laughs（XML 爆弾）攻撃を防ぐ。
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => name === "outline",
  processEntities: {
    enabled: true,
    maxTotalExpansions: 1000,
    maxEntitySize: 1000,
    maxExpansionDepth: 1,
    maxExpandedLength: 10000,
    maxEntityCount: 50,
  },
});

const OPML_IMPORT_COOLDOWN_MS = 60 * 1000; // 60秒

export async function POST(request: Request) {
  return withSession(request, async ({ session, env, ctx, origin }) => {
    const limited = await applyCooldown(
      env.RATE_LIMIT,
      opmlImportCooldownKey(session.userId),
      OPML_IMPORT_COOLDOWN_MS,
    );
    if (limited) return limited;

    const contentType = request.headers.get("content-type") ?? "";
    const isValidContentType =
      contentType.startsWith("text/xml") ||
      contentType.startsWith("application/xml") ||
      contentType.startsWith("text/plain");
    if (!isValidContentType) {
      return NextResponse.json(
        { error: "Unsupported Media Type", code: "INVALID_CONTENT_TYPE" },
        { status: 415 },
      );
    }

    const text = await request.text();
    if (!text || text.length > 1_000_000) {
      return apiError("Invalid or too large OPML file", 400, { code: "INVALID_OPML" });
    }

    let feedEntries: FeedEntry[];
    try {
      const parsed = parser.parse(text) as RawParsedOpml;
      const body = parsed?.opml?.body;
      if (!body) throw new Error("No OPML body found");
      feedEntries = toArray<OpmlOutline>(body.outline).flatMap((o) => extractFeeds(o));
    } catch {
      return apiError("Failed to parse OPML", 400, { code: "INVALID_OPML" });
    }

    if (feedEntries.length === 0) {
      return apiError("No feeds found in OPML", 400, { code: "EMPTY_OPML" });
    }
    if (feedEntries.length > MAX_OPML_ENTRIES) {
      return apiError(`OPML contains too many feeds (max ${MAX_OPML_ENTRIES} per import)`, 400, {
        code: "OPML_TOO_MANY_FEEDS",
      });
    }

    const subs = await readUserSubscriptions(env.RSS_DATA, session.userId);
    const remainingSlots = MAX_FEEDS_PER_USER - subs.length;
    if (remainingSlots <= 0) {
      return apiError(`Feed limit reached (max ${MAX_FEEDS_PER_USER})`, 422, {
        code: "FEED_LIMIT_REACHED",
      });
    }

    const existingHashes = new Set(subs.map((s) => s.feedHash));

    type Candidate = { entry: FeedEntry; feedHash: string };
    const candidates: Candidate[] = [];
    const batchHashes = new Set<string>();
    for (const entry of feedEntries) {
      if (candidates.length >= remainingSlots) break;
      if (!isValidFeedUrl(entry.url)) continue;
      const feedHash = await computeFeedHash(entry.url);
      if (existingHashes.has(feedHash) || batchHashes.has(feedHash)) continue;
      batchHashes.add(feedHash);
      candidates.push({ entry, feedHash });
    }

    const settled = await pMapSettled(
      candidates,
      async ({ entry, feedHash }) => {
        const meta = await getOrCreateFeedMeta(
          env.RSS_DATA,
          feedHash,
          entry.url,
          entry.title,
          entry.siteUrl,
        );
        return { candidate: { entry, feedHash }, meta };
      },
      R2_CONCURRENCY,
    );
    const succeeded = settled
      .filter(
        (
          r,
        ): r is PromiseFulfilledResult<{
          candidate: { entry: FeedEntry; feedHash: string };
          meta: SharedFeedMeta;
        }> => r.status === "fulfilled" && r.value.meta !== null,
      )
      .map((r) => r.value);
    const succeededMetas = succeeded.map((s) => s.meta);
    const succeededCandidates = succeeded.map((s) => s.candidate);

    const folderNames = [
      ...new Set(succeededCandidates.map((c) => c.entry.folder).filter((f): f is string => !!f)),
    ];
    const folderToGroupId = new Map<string, string>();

    if (folderNames.length > 0) {
      const existingGroups = await readFeedGroups(env.RSS_DATA, session.userId);
      const existingNameSet = new Set(existingGroups.map((g) => g.name));
      let maxOrder = existingGroups.reduce((max, g) => Math.max(max, g.order), 0);
      const newGroups: FeedGroup[] = [];

      for (const name of folderNames) {
        const existing = existingGroups.find((g) => g.name === name);
        if (existing) {
          folderToGroupId.set(name, existing.id);
        } else if (
          !existingNameSet.has(name) &&
          existingGroups.length + newGroups.length < MAX_FEED_GROUPS_PER_USER
        ) {
          const group: FeedGroup = {
            id: crypto.randomUUID(),
            name,
            order: ++maxOrder,
            createdAt: new Date().toISOString(),
          };
          newGroups.push(group);
          existingNameSet.add(name);
          folderToGroupId.set(name, group.id);
        }
      }

      if (newGroups.length > 0) {
        await writeFeedGroups(env.RSS_DATA, session.userId, [...existingGroups, ...newGroups]);
      }
    }

    const subscribedAt = new Date().toISOString();
    const newSubs = succeededCandidates.map(({ entry, feedHash }) => ({
      feedHash,
      url: entry.url,
      customTitle: entry.title !== entry.url ? entry.title : undefined,
      subscribedAt,
      groupId: entry.folder ? folderToGroupId.get(entry.folder) : undefined,
    }));
    for (const sub of newSubs) subs.push(sub);
    const addedCount = newSubs.length;

    if (addedCount > 0) {
      // R2 PUT と Cache API DELETE は互いに依存しないため並列化（合計レイテンシ短縮）
      await Promise.all([
        writeUserSubscriptions(env.RSS_DATA, session.userId, subs),
        purgeFeedsCache(origin, session.userId, ctx),
      ]);
      ctx.waitUntil(
        fetchArticles(env, session.userId).catch((e: unknown) =>
          console.error("[feeds/import] fetchArticles failed:", formatError(e)),
        ),
      );
    }

    const feeds = succeededMetas.map((meta, i) => assembleClientFeed(meta, newSubs[i]));
    return NextResponse.json({
      added: addedCount,
      skipped: feedEntries.length - addedCount,
      feeds,
    });
  });
}
