import { NextRequest, NextResponse } from "next/server";
import { withSession, parseJsonBody } from "@/lib/server-auth";
import { r2Get, r2Put } from "@/lib/r2";

interface ReadState {
  readIds: string[];
  bookmarkIds: string[];
  readingListIds: string[];
}

const MAX_READ_IDS = 20_000;
const MAX_BOOKMARK_IDS = 2_000;
const MAX_READING_LIST_IDS = 2_000;
const MAX_ID_LENGTH = 128;

function r2Key(userId: string) {
  return `users/${userId}/read-state.json`;
}

export async function GET() {
  return withSession(async ({ session, env }) => {
    const state = await r2Get<ReadState>(env.RSS_DATA, r2Key(session.userId), {
      readIds: [],
      bookmarkIds: [],
      readingListIds: [],
    });
    return NextResponse.json(state);
  });
}

export async function POST(req: NextRequest) {
  return withSession(async ({ session, env }) => {
    const parsed = await parseJsonBody<Partial<ReadState>>(req);
    if (!parsed.ok) return parsed.error;
    const body = parsed.data;

    const rawRead = Array.isArray(body.readIds) ? body.readIds : [];
    const rawBookmark = Array.isArray(body.bookmarkIds) ? body.bookmarkIds : [];
    const rawReadingList = Array.isArray(body.readingListIds) ? body.readingListIds : [];

    if (
      rawRead.length > MAX_READ_IDS ||
      rawBookmark.length > MAX_BOOKMARK_IDS ||
      rawReadingList.length > MAX_READING_LIST_IDS
    ) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }

    const isValidId = (v: unknown): v is string =>
      typeof v === "string" && v.length > 0 && v.length <= MAX_ID_LENGTH;

    const readIds = rawRead.filter(isValidId);
    const bookmarkIds = rawBookmark.filter(isValidId);
    const readingListIds = rawReadingList.filter(isValidId);

    await r2Put(env.RSS_DATA, r2Key(session.userId), { readIds, bookmarkIds, readingListIds });
    return NextResponse.json({ ok: true });
  });
}
