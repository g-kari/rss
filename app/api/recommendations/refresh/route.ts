import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { readCache, writeCache } from "@/lib/recommendation";
import { recommendationsCooldownKey } from "@/lib/r2";
import { checkAndUpdateCooldown } from "@/lib/rate-limit";

const RECOMMENDATIONS_COOLDOWN_MS = 5 * 60 * 1000; // 5分

export async function POST() {
  return withSession(async ({ session, env }) => {
    const limited = await checkAndUpdateCooldown(
      env.RSS_DATA,
      recommendationsCooldownKey(session.userId),
      RECOMMENDATIONS_COOLDOWN_MS,
    );
    if (limited) return limited;

    const cache = await readCache(env.RSS_DATA, session.userId);
    // generatedAt をクリアして次回 GET で再生成をトリガー
    if (cache) {
      await writeCache(env.RSS_DATA, session.userId, { ...cache, generatedAt: "" });
    }
    return NextResponse.json({ ok: true });
  });
}
