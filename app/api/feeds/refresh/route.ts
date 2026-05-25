import { NextResponse } from "next/server";
import { withSession, applyCooldown } from "@/lib/server-auth";
import { purgeArticlesCache } from "@/lib/cache-helper";
import { fetchArticles } from "@/cron/fetch";
import { refreshCooldownKey } from "@/lib/r2";

const REFRESH_COOLDOWN_MS = 2 * 60 * 1000; // 2分

export async function POST(request: Request) {
  return withSession(request, async ({ session, env, ctx }) => {
    const limited = await applyCooldown(
      env.RATE_LIMIT,
      refreshCooldownKey(session.userId),
      REFRESH_COOLDOWN_MS,
    );
    if (limited) return limited;
    await fetchArticles(env, session.userId);
    // refresh 後の `/api/articles` cache HIT で stale 一覧を返さないよう purge
    await purgeArticlesCache(new URL(request.url).origin, session.userId, ctx);
    return NextResponse.json({ ok: true });
  });
}
