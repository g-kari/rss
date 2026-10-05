import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { appendMcpHeaders, canonicalMcpOrigin, isMcpEnabled } from "@/lib/mcp-auth";
import { startMcpLogin } from "@/lib/mcp-login";

export async function GET(request: Request) {
  let state = crypto.randomUUID();
  let mcpHeaders: Headers | null = null;
  const appBaseUrl = process.env.APP_BASE_URL!;
  const authBaseUrl = process.env.AUTH_BASE_URL!;
  if (new URL(request.url).searchParams.has("mcp_resume")) {
    try {
      const { env } = await getCloudflareContext({ async: true });
      if (!isMcpEnabled(env) || !env.OAUTH_PROVIDER)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      const origin = canonicalMcpOrigin(appBaseUrl);
      if (new URL(request.url).origin !== origin) throw new Error("Invalid origin");
      const resumed = await startMcpLogin(request, env.OAUTH_PROVIDER, origin);
      state = resumed.state;
      mcpHeaders = resumed.headers;
    } catch {
      return NextResponse.json(
        { error: "Connection login expired. Start the connection again." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
  }
  const callbackUrl = `${appBaseUrl}/api/auth/callback`;

  const clientId = process.env.CLIENT_ID!;

  const loginUrl = new URL(`${authBaseUrl}/auth/login`);
  loginUrl.searchParams.set("client_id", clientId);
  loginUrl.searchParams.set("redirect_to", callbackUrl);
  loginUrl.searchParams.set("state", state);

  // state 不一致の調査用: 既存の auth_state cookie の状態と、リクエスト元情報を記録する。
  // state 値自体は CSRF トークンのため、完全値はログに出さずプレフィックスのみ出力。
  // セッション系 Cookie の存在情報がログ閲覧権限者に渡らないよう、Cookie 名一覧の代わりに
  // 認証フローに関係するキーの存在のみを bool で記録する。
  const cookieStore = await cookies();
  const existingAuthState = cookieStore.get("auth_state")?.value;
  console.log("[auth/login] generated state", {
    statePrefix: state.slice(0, 8),
    hadExistingAuthState: !!existingAuthState,
    existingAuthStatePrefix: existingAuthState?.slice(0, 8),
    hasSessionCookie: !!cookieStore.get("session_id")?.value,
    hasAccessToken: !!cookieStore.get("access_token")?.value,
    userAgent: request.headers.get("user-agent")?.slice(0, 80),
    host: request.headers.get("host"),
  });

  const res = NextResponse.redirect(loginUrl.toString());
  if (mcpHeaders) {
    appendMcpHeaders(res.headers, mcpHeaders);
    return res;
  }
  res.cookies.set("auth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
