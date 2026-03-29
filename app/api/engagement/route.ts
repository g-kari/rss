import { NextRequest, NextResponse } from "next/server";
import { withSession, parseJsonBody, requireString } from "@/lib/server-auth";
import { r2Get, r2Put, engagementKey } from "@/lib/r2";
import type { EngagementAction, EngagementEntry, EngagementLog } from "@/types";

const MAX_ENTRIES = 5_000;
const MAX_ID_LENGTH = 128;
const VALID_ACTIONS: EngagementAction[] = [
  "fetch_full",
  "open_original",
  "reading_list",
  "bookmark",
  "like",
];

export async function GET() {
  return withSession(async ({ session, env }) => {
    const log = await r2Get<EngagementLog>(env.RSS_DATA, engagementKey(session.userId), {
      entries: [],
    });
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
    const articleId = requireString(parsed.data.articleId, MAX_ID_LENGTH);
    const feedHash = requireString(parsed.data.feedHash, MAX_ID_LENGTH);
    const action = requireString(parsed.data.action, MAX_ID_LENGTH);
    if (!articleId || !feedHash || !action || !VALID_ACTIONS.includes(action as EngagementAction)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const log = await r2Get<EngagementLog>(env.RSS_DATA, engagementKey(session.userId), {
      entries: [],
    });

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

    await r2Put(env.RSS_DATA, engagementKey(session.userId), { entries });
    return NextResponse.json({ ok: true });
  });
}
