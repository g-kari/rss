import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { fetchArticles } from "@/cron/fetch";
import { r2Get, r2Put, refreshCooldownKey } from "@/lib/r2";

const REFRESH_COOLDOWN_MS = 2 * 60 * 1000; // 2分

export async function POST() {
  return withSession(async ({ session, env }) => {
    const key = refreshCooldownKey(session.userId);
    const { ts } = await r2Get<{ ts: number }>(env.RSS_DATA, key, { ts: 0 });
    const elapsed = Date.now() - ts;
    if (elapsed < REFRESH_COOLDOWN_MS) {
      const retryAfter = Math.ceil((REFRESH_COOLDOWN_MS - elapsed) / 1000);
      return NextResponse.json(
        { error: "Too many requests", retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
    await r2Put(env.RSS_DATA, key, { ts: Date.now() });
    await fetchArticles(env, session.userId);
    return NextResponse.json({ ok: true });
  });
}
