import { NextRequest, NextResponse } from "next/server";
import { withSession, withJsonBody, requireString } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import { r2Get, r2Put, engagementKey } from "@/lib/r2";
import type { EngagementAction, EngagementEntry, EngagementLog } from "@/types";
import { MAX_ID_LENGTH, MAX_ENGAGEMENT_ENTRIES, isValidFeedHash } from "@/lib/validation";
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

export async function GET(request: Request) {
  return withSession(request, async ({ session, env }) => {
    const log = await r2Get<EngagementLog>(env.RSS_DATA, engagementKey(session.userId), {
      entries: [],
    });
    return NextResponse.json(log);
  });
}

export async function POST(req: NextRequest) {
  return withJsonBody<{
    articleId?: unknown;
    feedHash?: unknown;
    action?: unknown;
    value?: unknown;
  }>(req, async ({ body, session, env }) => {
    const articleId = requireString(body.articleId, MAX_ID_LENGTH);
    const feedHash = requireString(body.feedHash, MAX_ID_LENGTH);
    const action = requireString(body.action, MAX_ID_LENGTH);
    if (
      !articleId ||
      !feedHash ||
      !isValidFeedHash(feedHash) ||
      !action ||
      !VALID_ACTIONS.includes(action as EngagementAction)
    ) {
      return apiError("Invalid payload", 400, { code: "INVALID_PAYLOAD" });
    }

    // ai_feedback の場合は value フィールドが必須
    let value: string | undefined;
    if (action === "ai_feedback") {
      const rawValue = requireString(body.value, 64);
      if (!rawValue) return apiError("Invalid payload", 400, { code: "INVALID_PAYLOAD" });
      // "good:summary" / "bad:translate" などの形式で検証
      const [rating, target] = rawValue.split(":");
      if (
        !VALID_AI_FEEDBACK_VALUES.includes(rating as (typeof VALID_AI_FEEDBACK_VALUES)[number]) ||
        !VALID_AI_FEEDBACK_TARGETS.includes(target as (typeof VALID_AI_FEEDBACK_TARGETS)[number])
      ) {
        return apiError("Invalid payload", 400, { code: "INVALID_PAYLOAD" });
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
    if (entries.length > MAX_ENGAGEMENT_ENTRIES) {
      entries.splice(0, entries.length - MAX_ENGAGEMENT_ENTRIES);
    }

    await r2Put(env.RSS_DATA, engagementKey(session.userId), { entries });
    return NextResponse.json({ ok: true });
  });
}
