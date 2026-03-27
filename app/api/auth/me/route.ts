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
      // リフレッシュ成功 → verify 結果に関わらず新しいトークンを Cookie にセット
      // （verify 失敗は JWKS 一時障害の可能性があるため Cookie は残す）
      const r = await verifyAndLoad(refreshed.access_token, authBaseUrl, env);
      if (r.kind === "restricted") return NextResponse.json({ user: null, betaRestricted: true });

      const body = r.kind === "ok" ? { user: r.profile } : { user: null };
      const res = NextResponse.json(body);
      res.cookies.set("access_token", refreshed.access_token, { ...COOKIE_OPTS, maxAge: 900 });
      res.cookies.set("refresh_token", refreshed.refresh_token, {
        ...COOKIE_OPTS,
        maxAge: 30 * 24 * 60 * 60,
      });
      // クライアントサイドからトークン有効期限を読めるよう non-HttpOnly で token_exp をセット
      try {
        const parts = refreshed.access_token.split(".");
        if (parts.length >= 2) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as {
            exp?: number;
          };
          if (typeof payload.exp === "number") {
            res.cookies.set("token_exp", String(payload.exp), {
              maxAge: 900,
              httpOnly: false,
              secure: true,
              sameSite: "lax",
              path: "/",
            });
          }
        }
      } catch {
        // exp 取得失敗は無視
      }
      return res;
    }
    // リフレッシュ失敗（refresh_token 無効）→ Cookie を削除してログアウト
    const res = NextResponse.json({ user: null });
    res.cookies.delete("access_token");
    res.cookies.delete("refresh_token");
    res.cookies.delete("token_exp");
    return res;
  }

  return NextResponse.json({ user: null });
}
