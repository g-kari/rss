import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { readCache, writeCache } from "@/lib/recommendation";

export async function POST() {
  return withSession(async ({ session, env }) => {
    const cache = await readCache(env.RSS_DATA, session.userId);
    // generatedAt をクリアして次回 GET で再生成をトリガー
    if (cache) {
      await writeCache(env.RSS_DATA, session.userId, { ...cache, generatedAt: "" });
    }
    return NextResponse.json({ ok: true });
  });
}
