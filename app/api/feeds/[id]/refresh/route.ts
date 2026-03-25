import { NextRequest, NextResponse } from 'next/server';
import { withSession } from '@/lib/server-auth';
import { fetchSingleFeed } from '@/cron/fetch';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: feedHash } = await params;
  return withSession(async ({ session, env }) => {
    const feed = await fetchSingleFeed(env, session.userId, feedHash);
    if (!feed) return NextResponse.json({ error: 'Feed not found' }, { status: 404 });
    return NextResponse.json(feed);
  });
}
