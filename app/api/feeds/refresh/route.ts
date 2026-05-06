import { NextResponse } from "next/server";
import { withSession, applyCooldown } from "@/lib/server-auth";
import { fetchArticles } from "@/cron/fetch";
import { refreshCooldownKey } from "@/lib/r2";

const REFRESH_COOLDOWN_MS = 2 * 60 * 1000; // 2分

export async function POST(request: Request) {
  return withSession(request, async ({ session, env }) => {
    const limited = await applyCooldown(
      env.RATE_LIMIT,
      refreshCooldownKey(session.userId),
      REFRESH_COOLDOWN_MS,
    );
    if (limited) return limited;
    await fetchArticles(env, session.userId);
    return NextResponse.json({ ok: true });
  });
}
