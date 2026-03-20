import { NextResponse } from 'next/server';
import { requireSession, applyRefreshedTokens } from '@/lib/server-auth';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { fetchArticles } from '@/cron/fetch';

export const runtime = 'edge';

export async function POST() {
  const result = await requireSession();
  if ('error' in result) return result.error;
  const { session } = result;
  const { env } = getCloudflareContext();

  await fetchArticles(env, session.userId);
  return applyRefreshedTokens(NextResponse.json({ ok: true }), session);
}
