import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revokeToken } from "@/lib/auth";
import {
  SESSION_COOKIE,
  getServerSession,
  deleteServerSession,
  assertSameOrigin,
} from "@/lib/server-auth";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function POST(req: Request) {
  const csrf = assertSameOrigin(req, process.env.APP_BASE_URL);
  if (csrf) return csrf;
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;

  if (sessionId) {
    const { env } = await getCloudflareContext({ async: true });
    const sessionData = await getServerSession(env.RSS_DATA, sessionId);
    if (sessionData) {
      await revokeToken(sessionData.refreshToken).catch(() => {});
    }
    await deleteServerSession(env.RSS_DATA, sessionId);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete("access_token");
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete("token_exp");
  return res;
}
