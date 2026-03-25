import { NextResponse } from 'next/server';
import { withSession } from '@/lib/server-auth';
import { r2Get, r2Put } from '@/lib/r2';
import { fetchArticles } from '@/cron/fetch';
import { XMLParser } from 'fast-xml-parser';
import { isValidFeedUrl } from '@/lib/url';
import { toArray } from '@/lib/xml-parser';
import type { Feed } from '@/types';

const MAX_FEEDS_PER_USER = 1000;
const MAX_OPML_ENTRIES = 5000; // 過剰な処理を防ぐ上限
const MAX_OPML_DEPTH = 50; // 再帰ネスト深度制限（スタックオーバーフロー対策）
const MAX_TITLE_LENGTH = 500; // フィードタイトルの最大文字数
const MAX_SITE_URL_LENGTH = 2048; // siteUrl の最大文字数

/** OPML から取得した title をサニタイズする（長さ制限・ヌルバイト除去） */
function sanitizeTitle(title: string): string {
  return title.replace(/\0/g, '').slice(0, MAX_TITLE_LENGTH);
}

/**
 * OPML の htmlUrl をサニタイズする。
 * http/https 以外のスキーム（javascript: 等）はブランクに置換する。
 */
function sanitizeSiteUrl(url: string): string {
  if (!url || url.length > MAX_SITE_URL_LENGTH) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return url;
  } catch {
    return '';
  }
}

interface OpmlOutline {
  '@_xmlUrl'?: string;
  '@_text'?: string;
  '@_title'?: string;
  '@_htmlUrl'?: string;
  outline?: OpmlOutline | OpmlOutline[];
}

interface RawParsedOpml {
  opml?: {
    body?: {
      outline?: OpmlOutline | OpmlOutline[];
    };
  };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'outline',
});

function extractFeeds(
  outline: OpmlOutline,
  depth = 0,
): Array<{ url: string; title: string; siteUrl: string }> {
  if (depth > MAX_OPML_DEPTH) return [];
  const results: Array<{ url: string; title: string; siteUrl: string }> = [];
  if (outline['@_xmlUrl']) {
    results.push({
      url: outline['@_xmlUrl'],
      title: sanitizeTitle(outline['@_title'] ?? outline['@_text'] ?? outline['@_xmlUrl']),
      siteUrl: sanitizeSiteUrl(outline['@_htmlUrl'] ?? ''),
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
      return NextResponse.json({ error: 'Invalid or too large OPML file' }, { status: 400 });
    }

    let feedEntries: Array<{ url: string; title: string; siteUrl: string }>;
    try {
      const parsed = parser.parse(text) as RawParsedOpml;
      const body = parsed?.opml?.body;
      if (!body) throw new Error('No OPML body found');
      feedEntries = toArray<OpmlOutline>(body.outline).flatMap(extractFeeds);
    } catch {
      return NextResponse.json({ error: 'Failed to parse OPML' }, { status: 400 });
    }

    if (feedEntries.length === 0) {
      return NextResponse.json({ error: 'No feeds found in OPML' }, { status: 400 });
    }
    if (feedEntries.length > MAX_OPML_ENTRIES) {
      return NextResponse.json(
        { error: `OPML contains too many feeds (max ${MAX_OPML_ENTRIES} per import)` },
        { status: 400 }
      );
    }

    const list = await r2Get<Feed[]>(env.RSS_DATA, `users/${session.userId}/feeds.json`, []);
    const remainingSlots = MAX_FEEDS_PER_USER - list.length;
    if (remainingSlots <= 0) {
      return NextResponse.json({ error: `Feed limit reached (max ${MAX_FEEDS_PER_USER})` }, { status: 422 });
    }

    const existingUrls = new Set(list.map((f) => f.url));

    const added: Feed[] = [];
    for (const entry of feedEntries) {
      if (added.length >= remainingSlots) break; // 上限に達したら打ち切り
      if (existingUrls.has(entry.url)) continue;
      if (!isValidFeedUrl(entry.url)) continue; // SSRF 対策
      const newFeed: Feed = {
        id: crypto.randomUUID(),
        url: entry.url,
        title: entry.title,
        siteUrl: entry.siteUrl,
        lastFetchedAt: null,
        fetchError: null,
      };
      list.push(newFeed);
      existingUrls.add(entry.url);
      added.push(newFeed);
    }

    if (added.length > 0) {
      await r2Put(env.RSS_DATA, `users/${session.userId}/feeds.json`, list);
      ctx.waitUntil(fetchArticles(env, session.userId).catch(console.error));
    }

    return NextResponse.json({ added: added.length, skipped: feedEntries.length - added.length });
  });
}
