import { NextResponse } from 'next/server';
import { withSession } from '@/lib/server-auth';
import { fetchArticles } from '@/cron/fetch';


export async function POST() {
  return withSession(async ({ session, env }) => {
    await fetchArticles(env, session.userId);
    return NextResponse.json({ ok: true });
  });
}
