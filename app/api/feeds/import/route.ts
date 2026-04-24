import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import { XMLParser } from "fast-xml-parser";
import { isValidFeedUrl } from "@/lib/url";
import { toArray } from "@/lib/xml-parser";
import {
  computeFeedHash,
  getOrCreateFeedMeta,
  assembleClientFeed,
  readUserSubscriptions,
  writeUserSubscriptions,
  pMap,
  MAX_FEEDS_PER_USER,
} from "@/lib/shared-feed";
import type { SharedFeedMeta } from "@/types";
import { fetchArticles } from "@/cron/fetch";
import { stripControlChars } from "@/lib/validation";
const MAX_OPML_ENTRIES = 5000;
// 実際の OPML ファイルは 2〜3 レベルが一般的。50 は不必要に大きく
// 悪意ある入力で過剰な再帰処理を引き起こす可能性があるため 10 に制限する。
const MAX_OPML_DEPTH = 10;
const MAX_TITLE_LENGTH = 500;
const MAX_SITE_URL_LENGTH = 2048;

function sanitizeTitle(title: string): string {
  return stripControlChars(title).slice(0, MAX_TITLE_LENGTH);
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
  return withSession(request, async ({ session, env, ctx }) => {
    const text = await request.text();
    if (!text || text.length > 1_000_000) {
      return apiError("Invalid or too large OPML file", 400, { code: "INVALID_OPML" });
    }

    let feedEntries: Array<{ url: string; title: string; siteUrl: string }>;
    try {
      const parsed = parser.parse(text) as RawParsedOpml;
      const body = parsed?.opml?.body;
      if (!body) throw new Error("No OPML body found");
      feedEntries = toArray<OpmlOutline>(body.outline).flatMap(extractFeeds);
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

    // Phase 1: フィルタ済みの候補エントリを収集（URL バリデーション + 重複除外）
    type Candidate = { entry: { url: string; title: string; siteUrl: string }; feedHash: string };
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

    // Phase 2: 共有 meta を並行度制限付きで取得・作成
    // 失敗したフィードは null にして他のインポートを継続する
    const metaResults = await pMap(candidates, async ({ entry, feedHash }) => {
      try {
        return await getOrCreateFeedMeta(
          env.RSS_DATA,
          feedHash,
          entry.url,
          entry.title,
          entry.siteUrl,
        );
      } catch {
        return null;
      }
    });
    const succeededMetas = metaResults.filter((m): m is SharedFeedMeta => m !== null);
    const succeededCandidates = candidates.filter((_, i) => metaResults[i] !== null);

    // Phase 3: 購読レコードを追加
    const subscribedAt = new Date().toISOString();
    const newSubs = succeededCandidates.map(({ entry, feedHash }) => ({
      feedHash,
      url: entry.url,
      customTitle: entry.title !== entry.url ? entry.title : undefined,
      subscribedAt,
    }));
    for (const sub of newSubs) subs.push(sub);
    const addedCount = newSubs.length;

    if (addedCount > 0) {
      await writeUserSubscriptions(env.RSS_DATA, session.userId, subs);
      ctx.waitUntil(fetchArticles(env, session.userId).catch(console.error));
    }

    const feeds = succeededMetas.map((meta, i) => assembleClientFeed(meta, newSubs[i]));
    return NextResponse.json({
      added: addedCount,
      skipped: feedEntries.length - addedCount,
      feeds,
    });
  });
}
