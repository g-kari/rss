import { NextResponse } from 'next/server';
import { requireSession, applyRefreshedTokens } from '@/lib/server-auth';
import { r2Get } from '@/lib/r2';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Article } from '@/types';


export async function GET() {
  const result = await requireSession();
  if ('error' in result) return result.error;
  const { session } = result;
  const { env } = await getCloudflareContext({ async: true });

  const articles = await r2Get<Article[]>(env.RSS_DATA, `users/${session.userId}/articles.json`, []);
  return applyRefreshedTokens(NextResponse.json(articles), session);
}
