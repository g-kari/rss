import { NextRequest, NextResponse } from "next/server";
import { withSession, parseJsonBody } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import { r2Get, r2Put, readStateKey } from "@/lib/r2";
import type { ReadState } from "@/types";
import { parseKeywordFilter } from "@/lib/keyword-filter";
import { extractIds, isValidIso8601, parseSnoozedUntil, parseNotes } from "@/lib/validation";
import { mergeReadStateUpdate, type ReadStateUpdate } from "@/lib/read-state-merge";

// POST は差分（追加 + removedIds）のみ送られる前提で上限を設定する。
// readIds は記事を読むたびに永続累積するため、多端末ユーザーでも余裕を持たせる。
// それでも 413 が発生した場合はクライアントが再送する（pending に復帰する）。
const MAX_READ_IDS = 100_000;
const MAX_BOOKMARK_IDS = 10_000;
const MAX_READING_LIST_IDS = 10_000;
const MAX_LIKE_IDS = 10_000;
const MAX_SNOOZED = 500;
const MAX_NOTES = 1_000;

export async function GET(request: Request) {
  return withSession(request, async ({ session, env }) => {
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
  return withSession(req, async ({ session, env }) => {
    const parsed = await parseJsonBody<ReadStateUpdate>(req);
    if (!parsed.ok) return parsed.error;
    const body = parsed.data;

    const readIds = extractIds(body.readIds, MAX_READ_IDS);
    const bookmarkIds = extractIds(body.bookmarkIds, MAX_BOOKMARK_IDS);
    const readingListIds = extractIds(body.readingListIds, MAX_READING_LIST_IDS);
    const likeIds = extractIds(body.likeIds, MAX_LIKE_IDS);

    if (!readIds || !bookmarkIds || !readingListIds || !likeIds) {
      return apiError("Payload too large", 413, { code: "PAYLOAD_TOO_LARGE" });
    }

    const removedRaw = body.removedIds ?? {};
    const removedReadIds = extractIds(removedRaw.readIds, MAX_READ_IDS);
    const removedBookmarkIds = extractIds(removedRaw.bookmarkIds, MAX_BOOKMARK_IDS);
    const removedReadingListIds = extractIds(removedRaw.readingListIds, MAX_READING_LIST_IDS);
    const removedLikeIds = extractIds(removedRaw.likeIds, MAX_LIKE_IDS);

    if (!removedReadIds || !removedBookmarkIds || !removedReadingListIds || !removedLikeIds) {
      return apiError("Payload too large", 413, { code: "PAYLOAD_TOO_LARGE" });
    }

    const globalFilter = parseKeywordFilter(body.globalFilter);

    // readBeforeTimestamp: ISO 8601 文字列のみ許可（それ以外は無視）
    const rbt = isValidIso8601(body.readBeforeTimestamp) ? body.readBeforeTimestamp : null;

    const snoozedUntil = parseSnoozedUntil(body.snoozedUntil, MAX_SNOOZED);
    const notes = parseNotes(body.notes, MAX_NOTES);

    // 既存 ReadState を読み込んで差分マージする（他端末の変更を失わない）
    const stored = await r2Get<Partial<ReadState>>(env.RSS_DATA, readStateKey(session.userId), {});
    const existing: ReadState = {
      readIds: stored.readIds ?? [],
      bookmarkIds: stored.bookmarkIds ?? [],
      readingListIds: stored.readingListIds ?? [],
      likeIds: stored.likeIds ?? [],
      globalFilter: stored.globalFilter ?? null,
      readBeforeTimestamp: stored.readBeforeTimestamp ?? null,
      snoozedUntil: stored.snoozedUntil ?? null,
      notes: stored.notes ?? null,
    };

    const update: ReadStateUpdate = {
      readIds,
      bookmarkIds,
      readingListIds,
      likeIds,
      removedIds: {
        readIds: removedReadIds,
        bookmarkIds: removedBookmarkIds,
        readingListIds: removedReadingListIds,
        likeIds: removedLikeIds,
      },
      readBeforeTimestamp: rbt,
      snoozedUntil,
      notes,
    };
    if ("globalFilter" in body) update.globalFilter = globalFilter;

    const merged = mergeReadStateUpdate(existing, update);

    await r2Put(env.RSS_DATA, readStateKey(session.userId), merged);
    // クライアントが POST 直後にサーバーの真実を反映できるよう、マージ結果を返す
    return NextResponse.json(merged);
  });
}
