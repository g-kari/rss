import { NextRequest, NextResponse } from "next/server";
import { withSession, parseJsonBody } from "@/lib/server-auth";
import { r2Get, r2Put, readStateKey } from "@/lib/r2";
import type { ReadState } from "@/types";
import { parseKeywordFilter } from "@/lib/keyword-filter";

const MAX_READ_IDS = 20_000;
const MAX_BOOKMARK_IDS = 2_000;
const MAX_READING_LIST_IDS = 2_000;
const MAX_LIKE_IDS = 2_000;
const MAX_SNOOZED = 500;
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

/**
 * snoozedUntil のバリデーション。
 * - 値が Record<string, string> であることを確認する
 * - 各エントリの key/value が文字列であることを確認する
 * - MAX_SNOOZED 件を超える場合は古いエントリを削除する
 * - 期限切れのエントリを除去する
 */
function parseSnoozedUntil(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const now = new Date().toISOString();
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (
      typeof k === "string" &&
      k.length > 0 &&
      k.length <= MAX_ID_LENGTH &&
      typeof v === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v) &&
      v > now // 期限切れを除去
    ) {
      result[k] = v;
    }
  }
  // 件数上限: 超過した場合は全て破棄（DoS 対策）
  if (Object.keys(result).length > MAX_SNOOZED) return null;
  return Object.keys(result).length > 0 ? result : null;
}

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
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }

    const globalFilter = parseKeywordFilter(body.globalFilter);

    // readBeforeTimestamp: ISO 8601 文字列のみ許可（それ以外は無視）
    const rbt =
      typeof body.readBeforeTimestamp === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(body.readBeforeTimestamp)
        ? body.readBeforeTimestamp
        : null;

    const snoozedUntil = parseSnoozedUntil(body.snoozedUntil);

    await r2Put(env.RSS_DATA, readStateKey(session.userId), {
      readIds,
      bookmarkIds,
      readingListIds,
      likeIds,
      globalFilter,
      readBeforeTimestamp: rbt,
      snoozedUntil,
    });
    return NextResponse.json({ ok: true });
  });
}
