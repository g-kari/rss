import { NextResponse } from 'next/server';
import { withSession } from '@/lib/server-auth';
import { r2Get } from '@/lib/r2';
import type { Article } from '@/types';


export async function GET() {
  return withSession(async ({ session, env }) => {
    const articles = await r2Get<Article[]>(env.RSS_DATA, `users/${session.userId}/articles.json`, []);
    return NextResponse.json(articles);
  });
}
