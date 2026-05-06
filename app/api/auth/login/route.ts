import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const state = crypto.randomUUID();
  const appBaseUrl = process.env.APP_BASE_URL!;
  const authBaseUrl = process.env.AUTH_BASE_URL!;
  const callbackUrl = `${appBaseUrl}/api/auth/callback`;

  const clientId = process.env.CLIENT_ID!;

  const loginUrl = new URL(`${authBaseUrl}/auth/login`);
  loginUrl.searchParams.set("client_id", clientId);
  loginUrl.searchParams.set("redirect_to", callbackUrl);
  loginUrl.searchParams.set("state", state);

  // state 不一致の調査用: 既存の auth_state cookie の状態と、リクエスト元情報を記録する。
  // state 値自体は CSRF トークンのため、完全値はログに出さずプレフィックスのみ出力。
  const cookieStore = await cookies();
  const existingAuthState = cookieStore.get("auth_state")?.value;
  const cookieNames = cookieStore.getAll().map((c) => c.name);
  console.log("[auth/login] generated state", {
    statePrefix: state.slice(0, 8),
    hadExistingAuthState: !!existingAuthState,
    existingAuthStatePrefix: existingAuthState?.slice(0, 8),
    existingCookies: cookieNames,
    userAgent: request.headers.get("user-agent")?.slice(0, 80),
    host: request.headers.get("host"),
  });

  const res = NextResponse.redirect(loginUrl.toString());
  res.cookies.set("auth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
