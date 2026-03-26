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

/** 配列バリデーション＋フィルタを一括処理する。上限超過時は null を返す。 */
function extractIds(raw: unknown, max: number): string[] | null {
  const arr = Array.isArray(raw) ? raw : [];
  if (arr.length > max) return null;
  return arr.filter(
    (v): v is string => typeof v === "string" && v.length > 0 && v.length <= MAX_ID_LENGTH,
  );
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

    const readIds = extractIds(body.readIds, MAX_READ_IDS);
    const bookmarkIds = extractIds(body.bookmarkIds, MAX_BOOKMARK_IDS);
    const readingListIds = extractIds(body.readingListIds, MAX_READING_LIST_IDS);

    if (!readIds || !bookmarkIds || !readingListIds) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }

    await r2Put(env.RSS_DATA, r2Key(session.userId), { readIds, bookmarkIds, readingListIds });
    return NextResponse.json({ ok: true });
  });
}
