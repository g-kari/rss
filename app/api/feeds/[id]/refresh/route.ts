import { NextRequest, NextResponse } from 'next/server';
import { requireSession, applyRefreshedTokens } from '@/lib/server-auth';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { fetchSingleFeed } from '@/cron/fetch';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireSession();
  if ('error' in result) return result.error;
  const { session } = result;
  const { id } = await params;
  const { env } = await getCloudflareContext({ async: true });

  const feed = await fetchSingleFeed(env, session.userId, id);
  if (!feed) return NextResponse.json({ error: 'Feed not found' }, { status: 404 });

  return applyRefreshedTokens(NextResponse.json(feed), session);
}
