import type { OAuthHelpers, ResumedUpstream } from "@cloudflare/workers-oauth-provider";
import {
  appendMcpHeaders,
  isMcpTransactionHandle,
  type McpLoginResume,
  validateMcpAuthorization,
  validateMcpLoginResume,
} from "./mcp-auth";

const LOGIN_STATE_PREFIX = "mcp.";
function stateRequest(request: Request, state: string): Request {
  const url = new URL(request.url);
  url.search = "";
  url.searchParams.set("state", state);
  return new Request(url, { headers: request.headers });
}

/** Consume/rotate a provider-bound resume; an arbitrary URL or query never becomes a return target. */
export async function startMcpLogin(
  request: Request,
  provider: OAuthHelpers,
  origin: string,
): Promise<{ state: string; headers: Headers }> {
  const handle = new URL(request.url).searchParams.get("mcp_resume") ?? "";
  if (!isMcpTransactionHandle(handle)) throw new Error("Invalid MCP login resume");
  const resumed = await provider.finishUpstream<McpLoginResume>(stateRequest(request, handle));
  validateMcpLoginResume(resumed.data);
  validateMcpAuthorization(resumed.request, origin);
  const next = await provider.beginUpstream(resumed.request, {
    data: resumed.data,
    headers: resumed.headers,
  });
  return { state: `${LOGIN_STATE_PREFIX}${next.state}`, headers: next.headers };
}

export function isMcpLoginState(state: string | null): boolean {
  return !!state?.startsWith(LOGIN_STATE_PREFIX);
}

/** Called before the IdP code exchange, retaining the ordinary auth_state validation for normal login. */
export async function finishMcpLogin(
  request: Request,
  provider: OAuthHelpers,
  origin: string,
): Promise<ResumedUpstream<McpLoginResume>> {
  const state = new URL(request.url).searchParams.get("state") ?? "";
  const handle = state.slice(LOGIN_STATE_PREFIX.length);
  if (!isMcpLoginState(state) || !isMcpTransactionHandle(handle))
    throw new Error("Invalid MCP login state");
  const resumed = await provider.finishUpstream<McpLoginResume>(stateRequest(request, handle));
  validateMcpLoginResume(resumed.data);
  validateMcpAuthorization(resumed.request, origin);
  return resumed;
}

export async function mcpAuthorizationReturn(
  resumed: ResumedUpstream<McpLoginResume>,
  provider: OAuthHelpers,
  origin: string,
): Promise<{ url: URL; headers: Headers }> {
  validateMcpLoginResume(resumed.data);
  const next = await provider.beginUpstream(resumed.request, { data: resumed.data });
  const headers = new Headers();
  appendMcpHeaders(headers, resumed.headers);
  appendMcpHeaders(headers, next.headers);
  const url = new URL("/api/mcp/authorize", origin);
  url.searchParams.set("state", next.state);
  return { url, headers };
}
