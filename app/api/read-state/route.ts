import { NextRequest, NextResponse } from "next/server";
import { withSession, parseJsonBody } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import { r2Get, r2Put, readStateKey } from "@/lib/r2";
import type { ReadState } from "@/types";
import { parseKeywordFilter } from "@/lib/keyword-filter";
import { extractIds, isValidIso8601, parseSnoozedUntil, parseNotes } from "@/lib/validation";

const MAX_READ_IDS = 20_000;
const MAX_BOOKMARK_IDS = 2_000;
const MAX_READING_LIST_IDS = 2_000;
const MAX_LIKE_IDS = 2_000;
const MAX_SNOOZED = 500;
const MAX_NOTES = 1_000;

export async function GET() {
  return withSession(async ({ session, env }) => {
    // Partial で受け取り、欠落フィールドを [] で補完する（古いデータ形式との互換性）
    const stored = await r2Get<Partial<ReadState>>(env.RSS_DATA, readStateKey(session.userId), {});
    const state: ReadState = {
      readIds: stored.readIds ?? [],
      bookmarkIds: stored.bookmarkIds ?? [],
      readingListIds: stored.readingListIds ?? [],
      likeIds: stored.likeIds ?? [],
      globalFilter: stored.globalFilter ?? null,
      readBeforeTimestamp: stored.readBeforeTimestamp ?? null,
      snoozedUntil: stored.snoozedUntil ?? null,
      notes: stored.notes ?? null,
    };
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
      return apiError("Payload too large", 413, { code: "PAYLOAD_TOO_LARGE" });
    }

    const globalFilter = parseKeywordFilter(body.globalFilter);

    // readBeforeTimestamp: ISO 8601 文字列のみ許可（それ以外は無視）
    const rbt = isValidIso8601(body.readBeforeTimestamp) ? body.readBeforeTimestamp : null;

    const snoozedUntil = parseSnoozedUntil(body.snoozedUntil, MAX_SNOOZED);
    const notes = parseNotes(body.notes, MAX_NOTES);

    await r2Put(env.RSS_DATA, readStateKey(session.userId), {
      readIds,
      bookmarkIds,
      readingListIds,
      likeIds,
      globalFilter,
      readBeforeTimestamp: rbt,
      snoozedUntil,
      notes,
    });
    return NextResponse.json({ ok: true });
  });
}
