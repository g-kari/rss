import { NextRequest, NextResponse } from 'next/server';
import { requireSession, applyRefreshedTokens } from '@/lib/server-auth';
import { r2Get, r2Put } from '@/lib/r2';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const runtime = 'edge';

interface ReadState {
  readIds: string[];
  bookmarkIds: string[];
}

function r2Key(userId: string) {
  return `users/${userId}/read-state.json`;
}

export async function GET() {
  const result = await requireSession();
  if ('error' in result) return result.error;
  const { session } = result;
  const { env } = getCloudflareContext();

  const state = await r2Get<ReadState>(env.RSS_DATA, r2Key(session.userId), {
    readIds: [],
    bookmarkIds: [],
  });
  return applyRefreshedTokens(NextResponse.json(state), session);
}

export async function POST(req: NextRequest) {
  const result = await requireSession();
  if ('error' in result) return result.error;
  const { session } = result;
  const { env } = getCloudflareContext();

  const body = (await req.json()) as Partial<ReadState>;
  const readIds = Array.isArray(body.readIds) ? (body.readIds as string[]) : [];
  const bookmarkIds = Array.isArray(body.bookmarkIds)
    ? (body.bookmarkIds as string[])
    : [];

  await r2Put(env.RSS_DATA, r2Key(session.userId), { readIds, bookmarkIds });
  return applyRefreshedTokens(NextResponse.json({ ok: true }), session);
}
