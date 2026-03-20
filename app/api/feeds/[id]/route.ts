import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server-auth';
import { r2Get, r2Put } from '@/lib/r2';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Feed, Article } from '@/types';

export const runtime = 'edge';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireSession();
  if ('error' in result) return result.error;
  const { session } = result;
  const { id } = await params;
  const { env } = getCloudflareContext();

  const list = await r2Get<Feed[]>(env.RSS_DATA, `users/${session.userId}/feeds.json`, []);
  await r2Put(env.RSS_DATA, `users/${session.userId}/feeds.json`, list.filter((f) => f.id !== id));

  const articles = await r2Get<Article[]>(env.RSS_DATA, `users/${session.userId}/articles.json`, []);
  await r2Put(env.RSS_DATA, `users/${session.userId}/articles.json`, articles.filter((a) => a.feedId !== id));

  return NextResponse.json({ ok: true });
}
