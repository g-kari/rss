import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { formatError } from "@/lib/api-error";
import { readUserSubscriptions } from "@/lib/shared-feed";
import { readCache, isCacheValid, generateRecommendations } from "@/lib/recommendation";
import { recommendationsGenCooldownKey } from "@/lib/r2";
import { checkAndUpdateCooldown } from "@/lib/rate-limit";
import type { RecommendationCache } from "@/types";

// 並行リクエストによる多重生成を防ぐクールダウン（生成1回あたり最低30秒）
const RECOMMENDATIONS_GEN_COOLDOWN_MS = 30 * 1000;

const EMPTY_RECOMMENDATIONS: RecommendationCache = {
  recommendations: [],
  generatedAt: null,
  dismissedIds: [],
  topics: [],
};

export async function GET(request: Request) {
  return withSession(request, async ({ session, env }) => {
    // キャッシュが有効ならそのまま返す（レートリミット不要）
    const cache = await readCache(env.RSS_DATA, session.userId);
    if (cache && isCacheValid(cache)) {
      return NextResponse.json(cache);
    }

    // キャッシュが無効な場合、並行リクエストによる多重 AI 呼び出しを防ぐ
    const limited = await checkAndUpdateCooldown(
      env.RATE_LIMIT,
      recommendationsGenCooldownKey(session.userId),
      RECOMMENDATIONS_GEN_COOLDOWN_MS,
    );
    if (limited) {
      // クールダウン中は期限切れキャッシュまたは空を返す
      if (cache) return NextResponse.json(cache);
      return NextResponse.json(EMPTY_RECOMMENDATIONS);
    }

    // 購読情報を取得
    const subscriptions = await readUserSubscriptions(env.RSS_DATA, session.userId);

    // レコメンド生成
    try {
      const result = await generateRecommendations({
        userId: session.userId,
        bucket: env.RSS_DATA,
        ai: env.AI,
        subscriptions,
        origin: process.env.APP_BASE_URL!,
      });
      return NextResponse.json(result);
    } catch (err) {
      console.error("[recommendations] generateRecommendations failed:", formatError(err));
      // 失敗時は期限切れキャッシュを返す（なければ空を返す）
      if (cache) return NextResponse.json(cache);
      return NextResponse.json(EMPTY_RECOMMENDATIONS);
    }
  });
}
