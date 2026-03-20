import { NextResponse } from 'next/server';
import { requireSession, applyRefreshedTokens } from '@/lib/server-auth';
import { r2Get, r2Put } from '@/lib/r2';
import { fetchArticles } from '@/cron/fetch';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { XMLParser } from 'fast-xml-parser';
import type { Feed } from '@/types';

export const runtime = 'edge';

interface OpmlOutline {
  '@_xmlUrl'?: string;
  '@_text'?: string;
  '@_title'?: string;
  '@_htmlUrl'?: string;
  outline?: OpmlOutline | OpmlOutline[];
}

function toArray<T>(val: T | T[] | undefined): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function extractFeeds(outline: OpmlOutline): Array<{ url: string; title: string; siteUrl: string }> {
  const results: Array<{ url: string; title: string; siteUrl: string }> = [];
  if (outline['@_xmlUrl']) {
    results.push({
      url: outline['@_xmlUrl'],
      title: outline['@_title'] ?? outline['@_text'] ?? outline['@_xmlUrl'],
      siteUrl: outline['@_htmlUrl'] ?? '',
    });
  }
  for (const child of toArray(outline.outline)) {
    results.push(...extractFeeds(child));
  }
  return results;
}

export async function POST(request: Request) {
  const result = await requireSession();
  if ('error' in result) return result.error;
  const { session } = result;
  const { env } = getCloudflareContext();

  const text = await request.text();
  if (!text || text.length > 1_000_000) {
    return NextResponse.json({ error: 'Invalid or too large OPML file' }, { status: 400 });
  }

  let feedEntries: Array<{ url: string; title: string; siteUrl: string }>;
  try {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', isArray: (name) => name === 'outline' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed: any = parser.parse(text);
    const body = parsed?.opml?.body;
    if (!body) throw new Error('No OPML body found');
    feedEntries = toArray<OpmlOutline>(body.outline).flatMap(extractFeeds);
  } catch {
    return NextResponse.json({ error: 'Failed to parse OPML' }, { status: 400 });
  }

  if (feedEntries.length === 0) {
    return NextResponse.json({ error: 'No feeds found in OPML' }, { status: 400 });
  }

  const list = await r2Get<Feed[]>(env.RSS_DATA, `users/${session.userId}/feeds.json`, []);
  const existingUrls = new Set(list.map((f) => f.url));

  const added: Feed[] = [];
  for (const entry of feedEntries) {
    if (existingUrls.has(entry.url)) continue;
    // SSRF 対策: http/https 以外のスキームを持つ URL をスキップ
    try {
      const parsed = new URL(entry.url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
    } catch {
      continue;
    }
    const newFeed: Feed = {
      id: crypto.randomUUID(),
      url: entry.url,
      title: entry.title,
      siteUrl: entry.siteUrl,
      lastFetchedAt: null,
    };
    list.push(newFeed);
    existingUrls.add(entry.url);
    added.push(newFeed);
  }

  if (added.length > 0) {
    await r2Put(env.RSS_DATA, `users/${session.userId}/feeds.json`, list);
    fetchArticles(env, session.userId).catch(console.error);
  }

  return applyRefreshedTokens(
    NextResponse.json({ added: added.length, skipped: feedEntries.length - added.length }),
    session
  );
}
