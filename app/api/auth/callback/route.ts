import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyJwt, exchangeCode } from "@/lib/auth";
import { r2Put } from "@/lib/r2";
import { isBetaAllowed, setTokenCookies } from "@/lib/server-auth";
import { escapeHtml } from "@/lib/html";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { UserProfile } from "@/types";

/**
 * 認証エラーレスポンスを生成し、auth_state クッキーを削除する。
 * 失敗後も同じ state での再試行を防ぐため、全エラーパスで削除する。
 * message は escapeHtml でサニタイズし、XSS を防ぐ。
 * Content-Type に charset=utf-8 を明示して日本語が文字化けしないようにする。
 * トップページへの再ログインリンクを併記してユーザーの復帰を容易にする。
 */
function authError(message: string, status: number): Response {
  const cookieClear = `auth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  const body = `<!doctype html><meta charset="utf-8"><title>認証エラー</title><body style="font-family:system-ui,sans-serif;padding:2rem;max-width:480px;margin:auto"><h1 style="font-size:1.1rem">${escapeHtml(message)}</h1><p style="color:#666;font-size:.9rem">時間をおいて再度お試しください。</p><p><a href="/">トップページに戻る</a></p></body>`;
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Set-Cookie": cookieClear,
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const savedState = cookieStore.get("auth_state")?.value;

  console.log("[auth/callback] received", {
    hasCode: !!code,
    hasState: !!state,
    hasSavedState: !!savedState,
    stateMatch: state === savedState,
  });

  // state は HttpOnly cookie で管理されており攻撃者は値を読めないため、
  // タイミング攻撃は非現実的。通常の文字列比較で十分。
  if (!code || !state || !savedState || state !== savedState) {
    return authError("認証エラー: state 不一致", 400);
  }

  const appBaseUrl = process.env.APP_BASE_URL!;
  const callbackUrl = `${appBaseUrl}/api/auth/callback`;
  console.log("[auth/callback] calling exchangeCode", {
    authBaseUrl: process.env.AUTH_BASE_URL,
    callbackUrl,
    hasClientId: !!process.env.CLIENT_ID,
    hasClientSecret: !!process.env.CLIENT_SECRET,
  });
  const tokens = await exchangeCode(code, callbackUrl);
  if (!tokens) {
    return authError("認証エラー: トークン交換失敗", 401);
  }

  const authBaseUrl = process.env.AUTH_BASE_URL!;
  const payload = await verifyJwt(tokens.access_token, authBaseUrl);
  if (!payload) {
    return authError("認証エラー: トークン検証失敗", 401);
  }
  const sub = payload.sub;

  // ベータアクセス制限チェック
  if (!isBetaAllowed(sub)) {
    return NextResponse.redirect(new URL("/?beta=denied", appBaseUrl));
  }

  // プロフィールを R2 に保存
  const { env } = await getCloudflareContext({ async: true });
  const profile: UserProfile = {
    id: tokens.user.id,
    sub,
    email: tokens.user.email,
    name: tokens.user.name,
    picture: tokens.user.picture,
  };
  await r2Put(env.RSS_DATA, `users/${sub}/profile.json`, profile);

  // ?login=1 でクライアントにログイン直後であることを伝える（R2 整合性ラグ対策リトライ用）
  const res = NextResponse.redirect(new URL("/?login=1", appBaseUrl));
  res.cookies.delete("auth_state");
  setTokenCookies(res, tokens);
  return res;
}
