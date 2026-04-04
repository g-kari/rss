import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { readCache, writeCache } from "@/lib/recommendation";
import { r2Get, r2Put, recommendationsCooldownKey } from "@/lib/r2";

const RECOMMENDATIONS_COOLDOWN_MS = 5 * 60 * 1000; // 5分

export async function POST() {
  return withSession(async ({ session, env }) => {
    const key = recommendationsCooldownKey(session.userId);
    const { ts } = await r2Get<{ ts: number }>(env.RSS_DATA, key, { ts: 0 });
    const elapsed = Date.now() - ts;
    if (elapsed < RECOMMENDATIONS_COOLDOWN_MS) {
      const retryAfter = Math.ceil((RECOMMENDATIONS_COOLDOWN_MS - elapsed) / 1000);
      return NextResponse.json(
        { error: "Too many requests", retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
    await r2Put(env.RSS_DATA, key, { ts: Date.now() });

    const cache = await readCache(env.RSS_DATA, session.userId);
    // generatedAt をクリアして次回 GET で再生成をトリガー
    if (cache) {
      await writeCache(env.RSS_DATA, session.userId, { ...cache, generatedAt: "" });
    }
    return NextResponse.json({ ok: true });
  });
}
