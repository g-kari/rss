import { NextRequest, NextResponse } from "next/server";
import { withSession, parseJsonBody } from "@/lib/server-auth";
import { readCache, writeCache } from "@/lib/recommendation";

const MAX_DISMISS_ID_LENGTH = 128;
const MAX_DISMISSED_IDS = 1000;

export async function POST(req: NextRequest) {
  return withSession(async ({ session, env }) => {
    const parsed = await parseJsonBody<{ id?: unknown }>(req);
    if (!parsed.ok) return parsed.error;
    if (typeof parsed.data.id !== "string" || parsed.data.id.length === 0) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    if (parsed.data.id.length > MAX_DISMISS_ID_LENGTH) {
      return NextResponse.json({ error: "id too long" }, { status: 400 });
    }
    const dismissId = parsed.data.id;

    const cache = await readCache(env.RSS_DATA, session.userId);
    if (!cache) {
      return NextResponse.json({ ok: true });
    }

    const dismissedIds = new Set(cache.dismissedIds);
    // 上限超過時は古い ID を削除して最新 ID のみ保持（FIFO）
    if (dismissedIds.size >= MAX_DISMISSED_IDS && !dismissedIds.has(dismissId)) {
      const [oldest] = dismissedIds;
      dismissedIds.delete(oldest);
    }
    dismissedIds.add(dismissId);

    const updated = {
      ...cache,
      recommendations: cache.recommendations.filter((r) => r.id !== dismissId),
      dismissedIds: [...dismissedIds],
    };

    await writeCache(env.RSS_DATA, session.userId, updated);
    return NextResponse.json({ ok: true });
  });
}
