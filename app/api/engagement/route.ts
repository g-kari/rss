import { NextRequest, NextResponse } from "next/server";
import { withSession, parseJsonBody } from "@/lib/server-auth";
import { r2Get, r2Put } from "@/lib/r2";
import type { EngagementAction, EngagementEntry, EngagementLog } from "@/types";

const MAX_ENTRIES = 5_000;
const VALID_ACTIONS: EngagementAction[] = [
  "fetch_full",
  "open_original",
  "reading_list",
  "bookmark",
  "like",
];

function r2Key(userId: string) {
  return `users/${userId}/engagement.json`;
}

export async function GET() {
  return withSession(async ({ session, env }) => {
    const log = await r2Get<EngagementLog>(env.RSS_DATA, r2Key(session.userId), { entries: [] });
    return NextResponse.json(log);
  });
}

export async function POST(req: NextRequest) {
  return withSession(async ({ session, env }) => {
    const parsed = await parseJsonBody<{
      articleId?: unknown;
      feedHash?: unknown;
      action?: unknown;
    }>(req);
    if (!parsed.ok) return parsed.error;
    const { articleId, feedHash, action } = parsed.data;

    if (
      typeof articleId !== "string" ||
      typeof feedHash !== "string" ||
      typeof action !== "string" ||
      !VALID_ACTIONS.includes(action as EngagementAction)
    ) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const log = await r2Get<EngagementLog>(env.RSS_DATA, r2Key(session.userId), { entries: [] });

    const entry: EngagementEntry = {
      articleId,
      feedHash,
      action: action as EngagementAction,
      timestamp: new Date().toISOString(),
    };

    // 追記して上限超過分は古いものから削除
    const entries = [...log.entries, entry];
    if (entries.length > MAX_ENTRIES) {
      entries.splice(0, entries.length - MAX_ENTRIES);
    }

    await r2Put(env.RSS_DATA, r2Key(session.userId), { entries });
    return NextResponse.json({ ok: true });
  });
}
