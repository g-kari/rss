import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { withSession } from "@/lib/server-auth";
import {
  appendMcpHeaders,
  approveMcpConnection,
  canonicalMcpOrigin,
  deleteMcpConsentAccount,
  isMcpEnabled,
  isMcpBetaAllowed,
  isMcpTransactionHandle,
  MCP_SCOPE,
  mcpLoginResumeData,
  readMcpConnection,
  readMcpConsentAccount,
  storeMcpConsentAccount,
  validateMcpAuthorization,
  validateMcpLoginResume,
  McpConnectionError,
} from "@/lib/mcp-auth";
import {
  readMcpConsentForm,
  renderMcpConsent,
  renderMcpNavigation,
  secureMcpBrowserHeaders,
} from "@/lib/mcp-auth-ui";

function secured(response: NextResponse): NextResponse {
  secureMcpBrowserHeaders(response.headers);
  return response;
}
function navigation(
  redirectTo: string,
  verifiedRedirectUri: string,
  label: "アプリへ戻る" | "ログインへ進む",
): NextResponse {
  return new NextResponse(renderMcpNavigation(redirectTo, verifiedRedirectUri, label), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
function failure(status = 400): NextResponse {
  return secured(
    NextResponse.json(
      { error: "Authorization could not be completed. Start the connection again." },
      { status },
    ),
  );
}
async function authorizeRequest(
  request: Request,
  provider: OAuthHelpers,
  origin: string,
): Promise<{ auth: AuthRequest; headers: Headers }> {
  const url = new URL(request.url);
  if (url.searchParams.has("state") && !url.searchParams.has("client_id")) {
    const handle = url.searchParams.get("state") ?? "";
    if (
      !isMcpTransactionHandle(handle) ||
      [...url.searchParams.keys()].some((key) => key !== "state")
    )
      throw new McpConnectionError("MCP_AUTH_INVALID");
    const resumed = await provider.finishUpstream(request);
    validateMcpLoginResume(resumed.data);
    validateMcpAuthorization(resumed.request, origin);
    return { auth: resumed.request, headers: resumed.headers };
  }
  const auth = await provider.parseAuthRequest(request);
  validateMcpAuthorization(auth, origin);
  return { auth, headers: new Headers() };
}
async function consentPage(
  request: Request,
  env: CloudflareEnv,
  origin: string,
  userId: string | null,
): Promise<NextResponse> {
  const provider = env.OAUTH_PROVIDER!;
  const { auth, headers } = await authorizeRequest(request, provider, origin);
  const description = await provider.describeConsent(auth);
  const snapshot = userId ? await readMcpConnection(env.RSS_DATA, userId) : null;
  const consent = await provider.beginConsent(auth);
  await storeMcpConsentAccount(
    env.OAUTH_KV!,
    consent.handle,
    userId,
    snapshot?.state?.revision ?? null,
  );
  appendMcpHeaders(headers, consent.headers);
  const response = new NextResponse(renderMcpConsent(description, consent.handle, userId), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
  appendMcpHeaders(response.headers, headers);
  return secured(response);
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    if (!isMcpEnabled(env) || !env.OAUTH_PROVIDER) return failure(404);
    const origin = canonicalMcpOrigin(env.APP_BASE_URL ?? process.env.APP_BASE_URL ?? "");
    if (new URL(request.url).origin !== origin || request.url.length > 8_192) return failure();
    const browserCookies: string[] = [];
    const response = await withSession(request, async ({ session }) => {
      if (!isMcpBetaAllowed(session.userId, env)) return failure(403);
      try {
        const page = await consentPage(request, env, origin, session.userId);
        browserCookies.push(...page.headers.getSetCookie());
        return page;
      } catch {
        return failure();
      }
    });
    // NextResponse.cookies.set() rebuilds Set-Cookie and can drop provider headers appended earlier.
    for (const cookie of browserCookies)
      if (!response.headers.getSetCookie().includes(cookie))
        response.headers.append("Set-Cookie", cookie);
    // DBSC proof is still required. Never downgrade its challenge to a raw session lookup.
    if (response.status === 401 && !response.headers.has("Sec-Session-Challenge"))
      return await consentPage(request, env, origin, null);
    return secured(response);
  } catch {
    return failure();
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    if (!isMcpEnabled(env) || !env.OAUTH_PROVIDER) return failure(404);
    const origin = canonicalMcpOrigin(env.APP_BASE_URL ?? process.env.APP_BASE_URL ?? "");
    if (new URL(request.url).origin !== origin || request.headers.get("origin") !== origin)
      return failure(403);
    const form = await readMcpConsentForm(request);
    if (
      !form ||
      !isMcpTransactionHandle(form.handle) ||
      !["approve", "login", "deny"].includes(form.decision)
    )
      return failure();
    const account = await readMcpConsentAccount(env.OAUTH_KV!, form.handle);
    const provider = env.OAUTH_PROVIDER;
    const decide = async (userId: string | null): Promise<NextResponse> => {
      if (
        account.userId !== userId ||
        (userId === null && form.decision === "approve") ||
        (userId !== null && form.decision === "login")
      )
        return failure(409);
      if (form.decision === "deny") {
        const denied = await provider.denyConsent(request, form.handle);
        await deleteMcpConsentAccount(env.OAUTH_KV!, form.handle);
        const response = navigation(denied.redirectTo, denied.request.redirectUri, "アプリへ戻る");
        appendMcpHeaders(response.headers, denied.headers);
        return secured(response);
      }
      const approved = await provider.approveConsent(request, form.handle, { scope: [MCP_SCOPE] });
      validateMcpAuthorization(approved.request, origin);
      await deleteMcpConsentAccount(env.OAUTH_KV!, form.handle);
      if (!userId) {
        const upstream = await provider.beginUpstream(approved.request, {
          data: mcpLoginResumeData(),
          headers: approved.headers,
        });
        const loginUrl = new URL("/api/auth/login", origin);
        loginUrl.searchParams.set("mcp_resume", upstream.state);
        const response = navigation(loginUrl.href, loginUrl.href, "ログインへ進む");
        appendMcpHeaders(response.headers, upstream.headers);
        return secured(response);
      }
      const props = await approveMcpConnection(env.RSS_DATA, userId, account.revision);
      const completed = await provider.completeAuthorization({
        request: approved.request,
        userId,
        scope: [MCP_SCOPE],
        props,
        metadata: { scope: MCP_SCOPE },
        revokeExistingGrants: false,
      });
      const response = navigation(
        completed.redirectTo,
        approved.request.redirectUri,
        "アプリへ戻る",
      );
      appendMcpHeaders(response.headers, approved.headers);
      return secured(response);
    };
    if (account.userId === null) return await decide(null);
    const browserCookies: string[] = [];
    const response = await withSession(request, async ({ session }) => {
      if (!isMcpBetaAllowed(session.userId, env)) return failure(403);
      try {
        const decision = await decide(session.userId);
        browserCookies.push(...decision.headers.getSetCookie());
        return decision;
      } catch (error) {
        return failure(
          error instanceof McpConnectionError && error.code === "MCP_CONNECTION_CONFLICT"
            ? 409
            : 400,
        );
      }
    });
    for (const cookie of browserCookies)
      if (!response.headers.getSetCookie().includes(cookie))
        response.headers.append("Set-Cookie", cookie);
    return secured(response);
  } catch (error) {
    return failure(
      error instanceof McpConnectionError && error.code === "MCP_CONNECTION_CONFLICT" ? 409 : 400,
    );
  }
}
