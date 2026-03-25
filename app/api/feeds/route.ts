import { NextResponse } from 'next/server';
import { withSession, parseJsonBody } from '@/lib/server-auth';
import { isValidFeedUrl } from '@/lib/url';
import { discoverFeedUrl } from '@/lib/feed-discovery';
import {
  computeFeedHash,
  readFeedMeta,
  createFeedMeta,
  readUserSubscriptions,
  writeUserSubscriptions,
  getUserFeeds,
  assembleClientFeed,
} from '@/lib/shared-feed';
import { registerAndFetchFeed } from '@/cron/fetch';
import type { UserSubscription } from '@/types';

const MAX_FEEDS_PER_USER = 1000;

export async function GET() {
  return withSession(async ({ session, env }) => {
    const feeds = await getUserFeeds(env.RSS_DATA, session.userId);
    return NextResponse.json(feeds);
  });
}

export async function POST(request: Request) {
  return withSession(async ({ session, env, ctx }) => {
    const parsed = await parseJsonBody<{ url?: unknown }>(request);
    if (!parsed.ok) return parsed.error;
    const body = parsed.data;
    if (typeof body?.url !== 'string') return NextResponse.json({ error: 'url is required' }, { status: 400 });
    let url = body.url.trim();
    if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });
    if (!isValidFeedUrl(url)) return NextResponse.json({ error: 'Invalid URL: must be http or https' }, { status: 400 });

    const discovered = await discoverFeedUrl(url);
    if (discovered && discovered !== url) url = discovered;
    if (!isValidFeedUrl(url)) return NextResponse.json({ error: 'Discovered feed URL is invalid' }, { status: 400 });

    const feedHash = await computeFeedHash(url);

    const subs = await readUserSubscriptions(env.RSS_DATA, session.userId);
    if (subs.some((s) => s.feedHash === feedHash)) {
      return NextResponse.json({ error: 'Feed already exists' }, { status: 409 });
    }
    if (subs.length >= MAX_FEEDS_PER_USER) {
      return NextResponse.json({ error: `Feed limit reached (max ${MAX_FEEDS_PER_USER})` }, { status: 422 });
    }

    // 共有 meta を作成（他ユーザーがすでに登録している場合は既存を流用）
    let meta = await readFeedMeta(env.RSS_DATA, feedHash);
    if (!meta) {
      meta = await createFeedMeta(env.RSS_DATA, feedHash, url);
    }

    const newSub: UserSubscription = {
      feedHash,
      url,
      subscribedAt: new Date().toISOString(),
    };
    subs.push(newSub);
    await writeUserSubscriptions(env.RSS_DATA, session.userId, subs);

    // バックグラウンドで初回記事取得
    ctx.waitUntil(registerAndFetchFeed(env, url).catch(console.error));

    return NextResponse.json(assembleClientFeed(meta, newSub), { status: 201 });
  });
}
