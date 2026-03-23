import { NextRequest, NextResponse } from 'next/server';
import { requireSession, applyRefreshedTokens } from '@/lib/server-auth';
import { r2Get, r2Put } from '@/lib/r2';
import { getCloudflareContext } from '@opennextjs/cloudflare';


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
  const { env } = await getCloudflareContext({ async: true });

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
  const { env } = await getCloudflareContext({ async: true });

  const MAX_READ_IDS = 20_000;
  const MAX_BOOKMARK_IDS = 2_000;
  const MAX_ID_LENGTH = 128;

  const body = (await req.json()) as Partial<ReadState>;

  const rawRead = Array.isArray(body.readIds) ? body.readIds : [];
  const rawBookmark = Array.isArray(body.bookmarkIds) ? body.bookmarkIds : [];

  if (rawRead.length > MAX_READ_IDS || rawBookmark.length > MAX_BOOKMARK_IDS) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const isValidId = (v: unknown): v is string =>
    typeof v === 'string' && v.length > 0 && v.length <= MAX_ID_LENGTH;

  const readIds = rawRead.filter(isValidId);
  const bookmarkIds = rawBookmark.filter(isValidId);

  await r2Put(env.RSS_DATA, r2Key(session.userId), { readIds, bookmarkIds });
  return applyRefreshedTokens(NextResponse.json({ ok: true }), session);
}
