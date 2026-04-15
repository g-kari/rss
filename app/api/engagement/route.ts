import { NextRequest, NextResponse } from "next/server";
import { withSession, parseJsonBody, requireString } from "@/lib/server-auth";
import { r2Get, r2Put, engagementKey } from "@/lib/r2";
import type { EngagementAction, EngagementEntry, EngagementLog } from "@/types";
import { MAX_ID_LENGTH, isValidFeedHash } from "@/lib/validation";

const MAX_ENTRIES = 5_000;
const VALID_ACTIONS: EngagementAction[] = [
  "fetch_full",
  "open_original",
  "reading_list",
  "bookmark",
  "like",
  "ai_feedback",
];
const VALID_AI_FEEDBACK_VALUES = ["good", "neutral", "bad"] as const;
const VALID_AI_FEEDBACK_TARGETS = ["summary", "translate"] as const;

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
      value?: unknown;
    }>(req);
    if (!parsed.ok) return parsed.error;
    const articleId = requireString(parsed.data.articleId, MAX_ID_LENGTH);
    const feedHash = requireString(parsed.data.feedHash, MAX_ID_LENGTH);
    const action = requireString(parsed.data.action, MAX_ID_LENGTH);
    if (
      !articleId ||
      !feedHash ||
      !isValidFeedHash(feedHash) ||
      !action ||
      !VALID_ACTIONS.includes(action as EngagementAction)
    ) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // ai_feedback の場合は value フィールドが必須
    let value: string | undefined;
    if (action === "ai_feedback") {
      const rawValue = requireString(parsed.data.value, 64);
      if (!rawValue) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
      // "good:summary" / "bad:translate" などの形式で検証
      const [rating, target] = rawValue.split(":");
      if (
        !VALID_AI_FEEDBACK_VALUES.includes(rating as (typeof VALID_AI_FEEDBACK_VALUES)[number]) ||
        !VALID_AI_FEEDBACK_TARGETS.includes(target as (typeof VALID_AI_FEEDBACK_TARGETS)[number])
      ) {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
      }
      value = rawValue;
    }

    const log = await r2Get<EngagementLog>(env.RSS_DATA, engagementKey(session.userId), {
      entries: [],
    });

    const entry: EngagementEntry = {
      articleId,
      feedHash,
      action: action as EngagementAction,
      timestamp: new Date().toISOString(),
      ...(value !== undefined && { value }),
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
