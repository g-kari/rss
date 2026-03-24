import { NextRequest, NextResponse } from 'next/server';
import { requireSession, applyRefreshedTokens } from '@/lib/server-auth';
import { r2Get, r2Put } from '@/lib/r2';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Feed, Article } from '@/types';


export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireSession();
  if ('error' in result) return result.error;
  const { session } = result;
  const { id } = await params;
  const { env } = await getCloudflareContext({ async: true });

  const list = await r2Get<Feed[]>(env.RSS_DATA, `users/${session.userId}/feeds.json`, []);
  if (!list.some((f) => f.id === id)) {
    return NextResponse.json({ error: 'Feed not found' }, { status: 404 });
  }
  await r2Put(env.RSS_DATA, `users/${session.userId}/feeds.json`, list.filter((f) => f.id !== id));

  const articles = await r2Get<Article[]>(env.RSS_DATA, `users/${session.userId}/articles.json`, []);
  await r2Put(env.RSS_DATA, `users/${session.userId}/articles.json`, articles.filter((a) => a.feedId !== id));

  return applyRefreshedTokens(NextResponse.json({ ok: true }), session);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireSession();
  if ('error' in result) return result.error;
  const { session } = result;
  const { id } = await params;
  const { env } = await getCloudflareContext({ async: true });

  const body = (await request.json()) as { title?: string };
  const title = body?.title?.trim();
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });
  if (title.length > 200) return NextResponse.json({ error: 'title too long' }, { status: 400 });

  const list = await r2Get<Feed[]>(env.RSS_DATA, `users/${session.userId}/feeds.json`, []);
  const feed = list.find((f) => f.id === id);
  if (!feed) return NextResponse.json({ error: 'Feed not found' }, { status: 404 });

  feed.title = title;
  await r2Put(env.RSS_DATA, `users/${session.userId}/feeds.json`, list);

  return applyRefreshedTokens(NextResponse.json(feed), session);
}
