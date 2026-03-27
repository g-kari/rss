import { NextRequest, NextResponse } from "next/server";
import { withSession, parseJsonBody } from "@/lib/server-auth";
import { readCache, writeCache } from "@/lib/recommendation";

export async function POST(req: NextRequest) {
  return withSession(async ({ session, env }) => {
    const parsed = await parseJsonBody<{ id?: unknown }>(req);
    if (!parsed.ok) return parsed.error;
    if (typeof parsed.data.id !== "string") {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const dismissId = parsed.data.id;

    const cache = await readCache(env.RSS_DATA, session.userId);
    if (!cache) {
      return NextResponse.json({ ok: true });
    }

    const dismissedIds = new Set(cache.dismissedIds);
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
