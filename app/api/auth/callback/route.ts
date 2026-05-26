import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyJwt, exchangeCode, timingSafeEqual, base64urlToBytes } from "@/lib/auth";
import { r2Put } from "@/lib/r2";
import {
  isBetaAllowed,
  setAccessTokenCookies,
  setSessionCookie,
  createServerSession,
} from "@/lib/server-auth";
import { escapeHtml } from "@/lib/html";
import { buildSecureSessionRegistrationHeader, generateDbscChallenge } from "@/lib/dbsc";
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
  // state 不一致の原因特定用に十分な情報を出す。
  // state 値自体は CSRF トークンなので完全値を出さず、プレフィックス 8 文字と長さのみ記録する。
  // セッション系 Cookie の存在情報がログ閲覧権限者に渡らないよう、Cookie 名一覧の代わりに
  // 認証フローに関係するキーの存在のみを bool で記録する。
  console.log("[auth/callback] received", {
    hasCode: !!code,
    codeLen: code?.length,
    hasState: !!state,
    stateLen: state?.length,
    statePrefix: state?.slice(0, 8),
    hasSavedState: !!savedState,
    savedStatePrefix: savedState?.slice(0, 8),
    stateMatch: !!state && !!savedState && timingSafeEqual(state, savedState),
    hasSessionCookie: !!cookieStore.get("session_id")?.value,
    hasAccessToken: !!cookieStore.get("access_token")?.value,
    userAgent: request.headers.get("user-agent")?.slice(0, 80),
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
  });

  // code の長さ・文字種チェック（認可コードは英数字・ハイフン・アンダースコアのみ、最大512文字）
  if (code && (code.length > 512 || !/^[\w-]+$/.test(code))) {
    return authError("認証エラー: 不正な認可コード", 400);
  }

  // state 不一致の具体的な理由をログに残す（どのケースで失敗したかすぐに判別できるようにする）
  if (!code || !state || !savedState || !timingSafeEqual(state, savedState)) {
    const reason = !code
      ? "code_missing"
      : !state
        ? "state_missing_in_query"
        : !savedState
          ? "auth_state_cookie_missing"
          : "state_mismatch";
    console.error("[auth/callback] state check failed", { reason });
    return authError(`認証エラー: state 不一致 (${reason})`, 400);
  }

  const appBaseUrl = process.env.APP_BASE_URL!;

  // オープンリダイレクト防止: リダイレクト先が有効な HTTPS URL であることを検証
  let parsedAppBase: URL;
  try {
    parsedAppBase = new URL(appBaseUrl);
  } catch {
    console.error("[auth/callback] invalid APP_BASE_URL:", appBaseUrl);
    return authError("サーバー設定エラー", 500);
  }
  if (parsedAppBase.protocol !== "https:") {
    console.error("[auth/callback] APP_BASE_URL must be HTTPS:", appBaseUrl);
    return authError("サーバー設定エラー", 500);
  }

  const callbackUrl = `${appBaseUrl}/api/auth/callback`;
  console.log("[auth/callback] calling exchangeCode", {
    authBaseUrl: process.env.AUTH_BASE_URL,
    callbackUrl,
    hasClientId: !!process.env.CLIENT_ID,
    hasClientSecret: !!process.env.CLIENT_SECRET,
  });
  const tokens = await exchangeCode(code, callbackUrl);
  if (!tokens) {
    console.error("[auth/callback] exchangeCode returned null");
    return authError("認証エラー: トークン交換失敗", 401);
  }
  console.log("[auth/callback] exchangeCode success", {
    hasAccessToken: !!tokens.access_token,
    hasRefreshToken: !!tokens.refresh_token,
    hasUser: !!tokens.user,
  });

  const authBaseUrl = process.env.AUTH_BASE_URL!;

  // 診断用: verifyJwt 失敗時の原因特定のため iss クレームを非検証デコード（iss ミスマッチ即判別）
  let tokenIss: unknown;
  try {
    const [, payloadB64] = tokens.access_token.split(".");
    if (payloadB64) {
      tokenIss = (
        JSON.parse(new TextDecoder().decode(base64urlToBytes(payloadB64))) as { iss?: unknown }
      ).iss;
    }
  } catch {
    /* ignore */
  }

  const payload = await verifyJwt(tokens.access_token, authBaseUrl);
  if (!payload) {
    console.error("[auth/callback] verifyJwt returned null", {
      tokenIss,
      expectedIss: authBaseUrl,
    });
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
  // DBSC 登録トリガー: 対応ブラウザに Secure-Session-Registration を送って TPM 鍵ペア生成を開始させる
  // ブラウザはヘッダーを受け取ると /api/auth/dbsc/register に公開鍵を POST する
  // @see https://wicg.github.io/dbsc/
  // dbscChallenge は同期生成 (crypto) のため Promise.all 前に確定。
  const dbscChallenge = generateDbscChallenge();

  // 3 つの独立 R2 PUT を並列化 (d33ae105 と同型)。書き込み先 key が独立 + sessionId は内部で
  // crypto.randomUUID() 同期生成のため他 PUT に非依存。後段の setSessionCookie / Secure-Session-Registration
  // ヘッダ設定は Promise.all 完了後に実行されるため順序保証あり。
  const [, sessionId] = await Promise.all([
    r2Put(env.RSS_DATA, `users/${sub}/profile.json`, profile),
    // refresh_token をサーバーサイドセッションとして R2 に保存し、ブラウザには session_id のみを渡す
    createServerSession(env.RSS_DATA, sub, tokens.refresh_token),
    r2Put(env.RSS_DATA, `users/${sub}/dbsc-pending-challenge.json`, {
      challenge: dbscChallenge,
      expiresAt: Date.now() + 5 * 60 * 1000,
    }),
  ]);

  // ?login=1 でクライアントにログイン直後であることを伝える（R2 整合性ラグ対策リトライ用）
  const res = NextResponse.redirect(new URL("/?login=1", appBaseUrl));
  res.cookies.delete("auth_state");
  setAccessTokenCookies(res, tokens.access_token);
  setSessionCookie(res, sessionId);
  res.headers.set(
    "Secure-Session-Registration",
    buildSecureSessionRegistrationHeader(dbscChallenge),
  );

  return res;
}
