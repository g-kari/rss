import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { readUserSubscriptions } from "@/lib/shared-feed";
import { readCache, isCacheValid, generateRecommendations } from "@/lib/recommendation";

export async function GET() {
  return withSession(async ({ session, env }) => {
    // キャッシュが有効ならそのまま返す
    const cache = await readCache(env.RSS_DATA, session.userId);
    if (cache && isCacheValid(cache)) {
      return NextResponse.json(cache);
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
      console.error("[recommendations] generateRecommendations failed:", err);
      // 失敗時は期限切れキャッシュを返す（なければ空を返す）
      if (cache) return NextResponse.json(cache);
      return NextResponse.json({
        recommendations: [],
        generatedAt: null,
        dismissedIds: [],
        topics: [],
      });
    }
  });
}
