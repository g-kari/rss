import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { readCache, isCacheValid } from "@/lib/recommendation";

export async function GET(request: Request) {
  return withSession(request, async ({ session, env }) => {
    const cache = await readCache(env.RSS_DATA, session.userId);
    if (cache && isCacheValid(cache)) {
      return NextResponse.json(cache);
    }
    // キャッシュ未生成 or 期限切れ → 204 を返してクライアントが POST /refresh を呼ぶ
    // GET はデータ取得のみで副作用なし（HTTP セマンティクス準拠・CSRF 安全）
    return new NextResponse(null, { status: 204 });
  });
}
