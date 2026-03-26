import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { XMLParser } from "fast-xml-parser";
import { isValidFeedUrl } from "@/lib/url";
import { toArray } from "@/lib/xml-parser";
import {
  computeFeedHash,
  readFeedMeta,
  createFeedMeta,
  readUserSubscriptions,
  writeUserSubscriptions,
  MAX_FEEDS_PER_USER,
} from "@/lib/shared-feed";
import { fetchArticles } from "@/cron/fetch";
import type { UserSubscription } from "@/types";
const MAX_OPML_ENTRIES = 5000;
const MAX_OPML_DEPTH = 50;
const MAX_TITLE_LENGTH = 500;
const MAX_SITE_URL_LENGTH = 2048;

function sanitizeTitle(title: string): string {
  return title.replace(/\u0000/g, "").slice(0, MAX_TITLE_LENGTH);
}

function sanitizeSiteUrl(url: string): string {
  if (!url || url.length > MAX_SITE_URL_LENGTH) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return url;
  } catch {
    return "";
  }
}

interface OpmlOutline {
  "@_xmlUrl"?: string;
  "@_text"?: string;
  "@_title"?: string;
  "@_htmlUrl"?: string;
  outline?: OpmlOutline | OpmlOutline[];
}

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

function extractFeeds(
  outline: OpmlOutline,
  depth = 0,
): Array<{ url: string; title: string; siteUrl: string }> {
  if (depth > MAX_OPML_DEPTH) return [];
  const results: Array<{ url: string; title: string; siteUrl: string }> = [];
  if (outline["@_xmlUrl"]) {
    results.push({
      url: outline["@_xmlUrl"],
      title: sanitizeTitle(outline["@_title"] ?? outline["@_text"] ?? outline["@_xmlUrl"]),
      siteUrl: sanitizeSiteUrl(outline["@_htmlUrl"] ?? ""),
    });
  }
  for (const child of toArray(outline.outline)) {
    results.push(...extractFeeds(child, depth + 1));
  }
  return results;
}

export async function POST(request: Request) {
  return withSession(async ({ session, env, ctx }) => {
    const text = await request.text();
    if (!text || text.length > 1_000_000) {
      return NextResponse.json({ error: "Invalid or too large OPML file" }, { status: 400 });
    }

    let feedEntries: Array<{ url: string; title: string; siteUrl: string }>;
    try {
      const parsed = parser.parse(text) as RawParsedOpml;
      const body = parsed?.opml?.body;
      if (!body) throw new Error("No OPML body found");
      feedEntries = toArray<OpmlOutline>(body.outline).flatMap(extractFeeds);
    } catch {
      return NextResponse.json({ error: "Failed to parse OPML" }, { status: 400 });
    }

    if (feedEntries.length === 0) {
      return NextResponse.json({ error: "No feeds found in OPML" }, { status: 400 });
    }
    if (feedEntries.length > MAX_OPML_ENTRIES) {
      return NextResponse.json(
        { error: `OPML contains too many feeds (max ${MAX_OPML_ENTRIES} per import)` },
        { status: 400 },
      );
    }

    const subs = await readUserSubscriptions(env.RSS_DATA, session.userId);
    const remainingSlots = MAX_FEEDS_PER_USER - subs.length;
    if (remainingSlots <= 0) {
      return NextResponse.json(
        { error: `Feed limit reached (max ${MAX_FEEDS_PER_USER})` },
        { status: 422 },
      );
    }

    const existingHashes = new Set(subs.map((s) => s.feedHash));
    let addedCount = 0;

    for (const entry of feedEntries) {
      if (addedCount >= remainingSlots) break;
      if (!isValidFeedUrl(entry.url)) continue;

      const feedHash = await computeFeedHash(entry.url);
      if (existingHashes.has(feedHash)) continue;

      // 共有 meta が無ければ作成
      const existingMeta = await readFeedMeta(env.RSS_DATA, feedHash);
      if (!existingMeta) {
        await createFeedMeta(env.RSS_DATA, feedHash, entry.url, entry.title, entry.siteUrl);
      }

      const newSub: UserSubscription = {
        feedHash,
        url: entry.url,
        customTitle: entry.title !== entry.url ? entry.title : undefined,
        subscribedAt: new Date().toISOString(),
      };
      subs.push(newSub);
      existingHashes.add(feedHash);
      addedCount++;
    }

    if (addedCount > 0) {
      await writeUserSubscriptions(env.RSS_DATA, session.userId, subs);
      ctx.waitUntil(fetchArticles(env, session.userId).catch(console.error));
    }

    return NextResponse.json({ added: addedCount, skipped: feedEntries.length - addedCount });
  });
}
