import { NextResponse } from "next/server";
import { withSession, applyCooldown } from "@/lib/server-auth";
import { apiError, formatError } from "@/lib/api-error";
import { readUserSubscriptions } from "@/lib/shared-feed";
import { generateRecommendations } from "@/lib/recommendation";
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
      // generateRecommendations は内部で writeCache 済の RecommendationCache を返す。
      // 旧実装は戻り値を捨てて readCache で再 GET していたが、冗長 (R2 GET 30-50ms) +
      // R2 eventual consistency で直前 PUT が読めない race condition のリスクあり。
      const cache = await generateRecommendations({
        userId: session.userId,
        bucket: env.RSS_DATA,
        ai: env.AI,
        subscriptions,
        origin: process.env.APP_BASE_URL!,
      });
      return NextResponse.json(cache);
    } catch (err) {
      console.error("[recommendations/refresh] generateRecommendations failed:", formatError(err));
      return apiError("推薦生成に失敗しました", 500);
    }
  });
}
