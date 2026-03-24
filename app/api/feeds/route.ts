import { NextResponse } from 'next/server';
import { requireSession, applyRefreshedTokens } from '@/lib/server-auth';
import { r2Get, r2Put } from '@/lib/r2';
import { fetchArticles } from '@/cron/fetch';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { isValidFeedUrl } from '@/lib/url';
import { discoverFeedUrl } from '@/lib/feed-discovery';
import type { Feed } from '@/types';


export async function GET() {
  const result = await requireSession();
  if ('error' in result) return result.error;
  const { session } = result;
  const { env } = await getCloudflareContext({ async: true });

  const feeds = await r2Get<Feed[]>(env.RSS_DATA, `users/${session.userId}/feeds.json`, []);
  return applyRefreshedTokens(NextResponse.json(feeds), session);
}

export async function POST(request: Request) {
  const result = await requireSession();
  if ('error' in result) return result.error;
  const { session } = result;
  const { env, ctx } = await getCloudflareContext({ async: true });

  const body = await request.json() as { url?: string };
  let url = body?.url?.trim();
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });
  if (!isValidFeedUrl(url)) return NextResponse.json({ error: 'Invalid URL: must be http or https' }, { status: 400 });

  const discovered = await discoverFeedUrl(url);
  if (discovered && discovered !== url) url = discovered;
  if (!isValidFeedUrl(url)) return NextResponse.json({ error: 'Discovered feed URL is invalid' }, { status: 400 });

  const list = await r2Get<Feed[]>(env.RSS_DATA, `users/${session.userId}/feeds.json`, []);
  if (list.some((f) => f.url === url)) {
    return NextResponse.json({ error: 'Feed already exists' }, { status: 409 });
  }

  const newFeed: Feed = {
    id: crypto.randomUUID(),
    url,
    title: url,
    siteUrl: '',
    lastFetchedAt: null,
    fetchError: null,
  };
  list.push(newFeed);
  await r2Put(env.RSS_DATA, `users/${session.userId}/feeds.json`, list);

  // バックグラウンドで記事取得（waitUntil でレスポンス送信後も Workers が処理を継続する）
  ctx.waitUntil(fetchArticles(env, session.userId).catch(console.error));

  return applyRefreshedTokens(NextResponse.json(newFeed, { status: 201 }), session);
}
