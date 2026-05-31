import { NextRequest, NextResponse } from "next/server";
import { withSession, withJsonBody, applyCooldown } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import { r2Get, r2Put, readStateKey, readStateCooldownKey } from "@/lib/r2";
import type { ReadState } from "@/types";
import { parseKeywordFilter } from "@/lib/keyword-filter";
import {
  extractIds,
  isValidIso8601,
  parseSnoozedUntil,
  parseNotes,
  parseTagIds,
  MAX_READ_IDS,
  MAX_BOOKMARK_IDS,
  MAX_READING_LIST_IDS,
  MAX_LIKE_IDS,
  MAX_SNOOZED,
  MAX_NOTES,
  MAX_TAGGED_ARTICLES,
  MAX_REMOVED_TAG_KEYS,
} from "@/lib/validation";
import {
  mergeReadStateUpdate,
  normalizeReadState,
  type ReadStateUpdate,
} from "@/lib/read-state-merge";

const READ_STATE_COOLDOWN_MS = 3_000;

/**
 * GET /api/read-state — 既読・ブックマーク・スヌーズ・メモなどの状態を取得する
 *
 * @returns 200 `ReadState` オブジェクト（欠落フィールドは空配列/nullで補完）
 */
export async function GET(request: Request) {
  return withSession(request, async ({ session, env }) => {
    // Partial で受け取り、欠落フィールドを [] で補完する（古いデータ形式との互換性）
    const stored = await r2Get<Partial<ReadState>>(env.RSS_DATA, readStateKey(session.userId), {});
    return NextResponse.json(normalizeReadState(stored));
  });
}

/**
 * POST /api/read-state — 既読状態をサーバーにフラッシュ・マージする
 *
 * @body `ReadStateUpdate` — readIds / bookmarkIds / removedIds / snoozedUntil / notes / tagIds 等
 * @returns 200 マージ後の `ReadState` オブジェクト
 * @error 413 `PAYLOAD_TOO_LARGE` — ID 配列がサイズ上限超過
 */
export async function POST(req: NextRequest) {
  return withJsonBody<ReadStateUpdate>(req, async ({ body, session, env }) => {
    const limited = await applyCooldown(
      env.RATE_LIMIT,
      readStateCooldownKey(session.userId),
      READ_STATE_COOLDOWN_MS,
    );
    if (limited) return limited;

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
    const removedTagKeys = extractIds(removedRaw.tagIds, MAX_REMOVED_TAG_KEYS);

    if (
      !removedReadIds ||
      !removedBookmarkIds ||
      !removedReadingListIds ||
      !removedLikeIds ||
      !removedTagKeys
    ) {
      return apiError("Payload too large", 413, { code: "PAYLOAD_TOO_LARGE" });
    }

    const globalFilter = parseKeywordFilter(body.globalFilter);

    // readBeforeTimestamp: ISO 8601 文字列のみ許可（それ以外は無視）
    const rbt = isValidIso8601(body.readBeforeTimestamp) ? body.readBeforeTimestamp : null;

    const snoozedUntil = parseSnoozedUntil(body.snoozedUntil, MAX_SNOOZED);
    const notes = parseNotes(body.notes, MAX_NOTES);
    const tagIds = parseTagIds(body.tagIds, MAX_TAGGED_ARTICLES);

    // 既存 ReadState を読み込んで差分マージする（他端末の変更を失わない）
    const stored = await r2Get<Partial<ReadState>>(env.RSS_DATA, readStateKey(session.userId), {});
    const existing = normalizeReadState(stored);

    // ttlDays: 0（無制限）または 1〜365 の整数、null（デフォルト復帰）のみ許可
    const rawTtl = body.ttlDays;
    const validTtlDays: number | null =
      typeof rawTtl === "number" && Number.isInteger(rawTtl) && rawTtl >= 0 && rawTtl <= 365
        ? rawTtl
        : null;

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
        tagIds: removedTagKeys,
      },
      readBeforeTimestamp: rbt,
      snoozedUntil,
      notes,
      tagIds,
    };
    if ("globalFilter" in body) update.globalFilter = globalFilter;
    if ("ttlDays" in body) update.ttlDays = validTtlDays;

    const merged = mergeReadStateUpdate(existing, update, MAX_READ_IDS);

    await r2Put(env.RSS_DATA, readStateKey(session.userId), merged);
    // クライアントが POST 直後にサーバーの真実を反映できるよう、マージ結果を返す
    return NextResponse.json(merged);
  });
}
