import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyJwt, refreshTokens } from "@/lib/auth";
import { r2Get } from "@/lib/r2";
import { isBetaAllowed, COOKIE_OPTS } from "@/lib/server-auth";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { UserProfile } from "@/types";

type VerifyResult =
  | { kind: "invalid" }
  | { kind: "restricted" }
  | { kind: "ok"; profile: UserProfile | null };

async function verifyAndLoad(
  token: string,
  authBaseUrl: string,
  env: CloudflareEnv,
): Promise<VerifyResult> {
  const payload = await verifyJwt(token, authBaseUrl);
  if (!payload) return { kind: "invalid" };
  if (!isBetaAllowed(payload.sub)) return { kind: "restricted" };
  const profile = await r2Get<UserProfile | null>(
    env.RSS_DATA,
    `users/${payload.sub}/profile.json`,
    null,
  );
  return { kind: "ok", profile };
}

export async function GET(request: Request) {
  const authBaseUrl = process.env.AUTH_BASE_URL!;
  const cookieStore = await cookies();
  const { env } = await getCloudflareContext({ async: true });

  // URL パラメーターでベータ制限リダイレクトを検出
  if (new URL(request.url).searchParams.get("beta") === "denied") {
    return NextResponse.json({ user: null, betaRestricted: true });
  }

  const token = cookieStore.get("access_token")?.value;
  if (token) {
    const r = await verifyAndLoad(token, authBaseUrl, env);
    if (r.kind === "restricted") return NextResponse.json({ user: null, betaRestricted: true });
    if (r.kind === "ok") return NextResponse.json({ user: r.profile });
  }

  // アクセストークン期限切れ → リフレッシュ試行
  const refreshToken = cookieStore.get("refresh_token")?.value;
  if (refreshToken) {
    const refreshed = await refreshTokens(refreshToken);
    if (refreshed) {
      const r = await verifyAndLoad(refreshed.access_token, authBaseUrl, env);
      if (r.kind === "restricted") return NextResponse.json({ user: null, betaRestricted: true });
      if (r.kind === "ok") {
        const res = NextResponse.json({ user: r.profile });
        res.cookies.set("access_token", refreshed.access_token, { ...COOKIE_OPTS, maxAge: 900 });
        res.cookies.set("refresh_token", refreshed.refresh_token, {
          ...COOKIE_OPTS,
          maxAge: 30 * 24 * 60 * 60,
        });
        return res;
      }
    }
    const res = NextResponse.json({ user: null });
    res.cookies.delete("access_token");
    res.cookies.delete("refresh_token");
    return res;
  }

  return NextResponse.json({ user: null });
}
