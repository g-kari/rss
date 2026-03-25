import { NextResponse } from 'next/server';
import { withSession, parseJsonBody } from '@/lib/server-auth';
import { r2Get, r2Put } from '@/lib/r2';
import { fetchArticles } from '@/cron/fetch';
import { isValidFeedUrl } from '@/lib/url';
import { discoverFeedUrl } from '@/lib/feed-discovery';
import type { Feed } from '@/types';

const MAX_FEEDS_PER_USER = 1000;

export async function GET() {
  return withSession(async ({ session, env }) => {
    const feeds = await r2Get<Feed[]>(env.RSS_DATA, `users/${session.userId}/feeds.json`, []);
    return NextResponse.json(feeds);
  });
}

export async function POST(request: Request) {
  return withSession(async ({ session, env, ctx }) => {
    const body = await parseJsonBody<{ url?: unknown }>(request);
    if (body instanceof NextResponse) return body;
    if (typeof body?.url !== 'string') return NextResponse.json({ error: 'url is required' }, { status: 400 });
    let url = body.url.trim();
    if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });
    if (!isValidFeedUrl(url)) return NextResponse.json({ error: 'Invalid URL: must be http or https' }, { status: 400 });

    const discovered = await discoverFeedUrl(url);
    if (discovered && discovered !== url) url = discovered;
    if (!isValidFeedUrl(url)) return NextResponse.json({ error: 'Discovered feed URL is invalid' }, { status: 400 });

    const list = await r2Get<Feed[]>(env.RSS_DATA, `users/${session.userId}/feeds.json`, []);
    if (list.some((f) => f.url === url)) {
      return NextResponse.json({ error: 'Feed already exists' }, { status: 409 });
    }
    if (list.length >= MAX_FEEDS_PER_USER) {
      return NextResponse.json({ error: `Feed limit reached (max ${MAX_FEEDS_PER_USER})` }, { status: 422 });
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

    return NextResponse.json(newFeed, { status: 201 });
  });
}
