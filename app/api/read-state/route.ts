import { NextRequest, NextResponse } from "next/server";
import { withSession, parseJsonBody } from "@/lib/server-auth";
import { r2Get, r2Put, readStateKey } from "@/lib/r2";

interface ReadState {
  readIds: string[];
  bookmarkIds: string[];
  readingListIds: string[];
  likeIds: string[];
}

const MAX_READ_IDS = 20_000;
const MAX_BOOKMARK_IDS = 2_000;
const MAX_READING_LIST_IDS = 2_000;
const MAX_LIKE_IDS = 2_000;
const MAX_ID_LENGTH = 128;

/** 配列バリデーション＋フィルタ＋重複排除を一括処理する。上限超過時は null を返す。 */
function extractIds(raw: unknown, max: number): string[] | null {
  const arr = Array.isArray(raw) ? raw : [];
  const deduped = [
    ...new Set(
      arr.filter(
        (v): v is string => typeof v === "string" && v.length > 0 && v.length <= MAX_ID_LENGTH,
      ),
    ),
  ];
  if (deduped.length > max) return null;
  return deduped;
}

export async function GET() {
  return withSession(async ({ session, env }) => {
    const state = await r2Get<ReadState>(env.RSS_DATA, readStateKey(session.userId), {
      readIds: [],
      bookmarkIds: [],
      readingListIds: [],
      likeIds: [],
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
    const likeIds = extractIds(body.likeIds, MAX_LIKE_IDS);

    if (!readIds || !bookmarkIds || !readingListIds || !likeIds) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }

    await r2Put(env.RSS_DATA, readStateKey(session.userId), {
      readIds,
      bookmarkIds,
      readingListIds,
      likeIds,
    });
    return NextResponse.json({ ok: true });
  });
}
