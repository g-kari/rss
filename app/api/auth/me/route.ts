import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyJwt } from "@/lib/auth";
import { r2Get } from "@/lib/r2";
import {
  isBetaAllowed,
  setAccessTokenCookies,
  setSessionCookie,
  deduplicatedRefresh,
  SESSION_COOKIE,
  getServerSession,
  updateServerSession,
  deleteServerSession,
} from "@/lib/server-auth";
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

export async function GET() {
  const authBaseUrl = process.env.AUTH_BASE_URL!;
  const cookieStore = await cookies();

  let env: CloudflareEnv;
  try {
    ({ env } = await getCloudflareContext({ async: true }));
  } catch {
    return NextResponse.json({ user: null });
  }

  const token = cookieStore.get("access_token")?.value;
  if (token) {
    const r = await verifyAndLoad(token, authBaseUrl, env);
    if (r.kind === "restricted") return NextResponse.json({ user: null, betaRestricted: true });
    if (r.kind === "ok") return NextResponse.json({ user: r.profile });
  }

  // アクセストークン期限切れ → サーバーサイドセッション経由でリフレッシュ試行
  // deduplicatedRefresh を使うことで、同一アイソレート内で /api/auth/me と他の
  // Route Handler が同時に refresh しようとしても 1 回だけ実行される。
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    const sessionData = await getServerSession(env.RSS_DATA, sessionId);
    if (!sessionData) {
      // セッションが期限切れまたは存在しない → ログアウト
      const res = NextResponse.json({ user: null });
      res.cookies.delete("access_token");
      res.cookies.delete(SESSION_COOKIE);
      res.cookies.delete("token_exp");
      return res;
    }

    const refreshed = await deduplicatedRefresh(sessionData.refreshToken);
    if (refreshed.kind === "ok") {
      // リフレッシュ成功 → R2 セッションを新しい refreshToken で更新
      await updateServerSession(
        env.RSS_DATA,
        sessionId,
        sessionData.userId,
        refreshed.tokens.refresh_token,
      );
      // verify 結果に関わらず新しい access_token を Cookie にセット
      // （verify 失敗は JWKS 一時障害の可能性があるため Cookie は残す）
      const r = await verifyAndLoad(refreshed.tokens.access_token, authBaseUrl, env);
      if (r.kind === "restricted") return NextResponse.json({ user: null, betaRestricted: true });

      const body = r.kind === "ok" ? { user: r.profile } : { user: null };
      const res = NextResponse.json(body);
      setAccessTokenCookies(res, refreshed.tokens.access_token);
      setSessionCookie(res, sessionId); // session_id Cookie の有効期限を延長
      return res;
    }
    if (refreshed.kind === "transient") {
      // 上流認可サーバーの 5xx / ネットワーク障害 / タイムアウト → Cookie を消さずに
      // クライアントに一時的失敗を伝える。useAuth は transient=true を受けて
      // 既存の認証状態を維持（誤ログアウトを防止）。
      return NextResponse.json({ user: null, transient: true }, { status: 503 });
    }
    // リフレッシュ失敗（refresh_token 無効 / invalid_grant）→ セッションを削除してログアウト
    await deleteServerSession(env.RSS_DATA, sessionId);
    const res = NextResponse.json({ user: null });
    res.cookies.delete("access_token");
    res.cookies.delete(SESSION_COOKIE);
    res.cookies.delete("token_exp");
    return res;
  }

  return NextResponse.json({ user: null });
}
