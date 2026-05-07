import { NextResponse } from "next/server";
import { withSession, applyCooldown } from "@/lib/server-auth";
import { formatError } from "@/lib/api-error";
import { readUserSubscriptions } from "@/lib/shared-feed";
import { readCache, generateRecommendations } from "@/lib/recommendation";
import { recommendationsCooldownKey } from "@/lib/r2";

const RECOMMENDATIONS_COOLDOWN_MS = 5 * 60 * 1000; // 5分

export async function POST(request: Request) {
  return withSession(request, async ({ session, env }) => {
    const limited = await applyCooldown(
      env.RATE_LIMIT,
      recommendationsCooldownKey(session.userId),
      RECOMMENDATIONS_COOLDOWN_MS,
    );
    if (limited) return limited;

    const subscriptions = await readUserSubscriptions(env.RSS_DATA, session.userId);

    try {
      await generateRecommendations({
        userId: session.userId,
        bucket: env.RSS_DATA,
        ai: env.AI,
        subscriptions,
        origin: process.env.APP_BASE_URL!,
      });
    } catch (err) {
      console.error("[recommendations/refresh] generateRecommendations failed:", formatError(err));
      return NextResponse.json({ error: "推薦生成に失敗しました" }, { status: 500 });
    }

    // 生成後のキャッシュを返す（クライアントの再 GET を省略できる）
    const cache = await readCache(env.RSS_DATA, session.userId);
    return NextResponse.json(cache ?? { ok: true });
  });
}
