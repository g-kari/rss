import type { OAuthResourceAuth } from "@cloudflare/workers-oauth-provider";
import {
  assertMcpConnection,
  MCP_PATH,
  MCP_SCOPE,
  MCP_ADD_SCOPE,
  isMcpScopeSet,
  isMcpSubscriptionAddEnabled,
  McpConnectionError,
  validateMcpAuthProps,
} from "./mcp-auth";
import { createMcpOAuthProvider } from "./mcp-provider";
import { serveMcpData } from "./mcp-server";
import { evaluateSlidingWindow } from "./rate-limit-logic";
import { serialized } from "./serialize-async";
import { createMcpSubscriptionAdder } from "./mcp-subscription-add";
import { addUserToIndex, FEED_USER_MAP_CACHE_KEY } from "./shared-feed";
import { buildCacheKey } from "./cache-helper";

const OAUTH_BODY_LIMIT = 16 * 1024;
const OAUTH_PATHS = new Set([
  "/api/mcp/authorize",
  "/api/mcp/connection",
  "/api/mcp/settings",
  "/api/mcp/token",
]);
const METADATA_PATHS = new Set([
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-protected-resource/mcp",
]);

function problem(code: string, status: number, challenge?: string) {
  const headers: Record<string, string> = {
    "Cache-Control": "private, no-store",
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
  };
  if (challenge) headers["WWW-Authenticate"] = challenge;
  return new Response(JSON.stringify({ error: code }), { status, headers });
}

/** Native Worker throttle reuses the pure window logic without importing next/server. */
async function throttleMcp(kv: KVNamespace, userId: string): Promise<Response | null> {
  const key = `mcp-read:${userId}`;
  return serialized(key, async () => {
    try {
      const raw = await kv.get(key);
      if (raw !== null && raw.length > 16 * 1024) return problem("MCP_RATE_UNAVAILABLE", 503);
      const stored: unknown = raw === null ? [] : JSON.parse(raw);
      if (
        !Array.isArray(stored) ||
        stored.length > 60 ||
        !stored.every(
          (value) => Number.isFinite(value) && Number.isSafeInteger(value) && value >= 0,
        )
      )
        return problem("MCP_RATE_UNAVAILABLE", 503);
      const window = evaluateSlidingWindow(Date.now(), stored, 60_000, 60);
      if (!window.allowed) {
        const response = problem("MCP_RATE_LIMITED", 429);
        response.headers.set("Retry-After", String(window.retryAfterSec ?? 60));
        return response;
      }
      await kv.put(key, JSON.stringify(window.recent), { expirationTtl: 60 });
      return null;
    } catch {
      return problem("MCP_RATE_UNAVAILABLE", 503);
    }
  });
}

/** Configuration, never caller-controlled Host/URL, supplies the OAuth issuer/audience. */
export function mcpAppOrigin(env: Pick<CloudflareEnv, "APP_BASE_URL">): string | null {
  const configured = env.APP_BASE_URL;
  if (!configured) return null;
  try {
    const parsed = new URL(configured);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== "/" ||
      ![parsed.origin, `${parsed.origin}/`].includes(configured)
    )
      return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function guardedPath(url: URL) {
  const path = url.pathname;
  return (
    path === MCP_PATH ||
    OAUTH_PATHS.has(path) ||
    path.startsWith("/api/mcp/token/") ||
    METADATA_PATHS.has(path) ||
    (path === "/api/auth/login" && url.searchParams.has("mcp_resume")) ||
    (path === "/api/auth/callback" && url.searchParams.get("state")?.startsWith("mcp.") === true)
  );
}

/** No wildcard CORS/Origin exception, no Cookie fallback, no query credentials. */
export function mcpRequestGuard(request: Request, appOrigin: string): Response | null {
  const url = new URL(request.url);
  if (url.origin !== appOrigin) return problem("MCP_HOST_FORBIDDEN", 403);
  const host = request.headers.get("Host");
  if (host !== null && host !== url.host) return problem("MCP_HOST_FORBIDDEN", 403);
  const origin = request.headers.get("Origin");
  if (origin !== null && origin !== appOrigin && origin !== "https://chatgpt.com") {
    return problem("MCP_ORIGIN_FORBIDDEN", 403);
  }
  if (url.pathname === MCP_PATH && url.search) return problem("MCP_QUERY_NOT_ALLOWED", 400);
  return null;
}

async function boundedOAuthBody(request: Request): Promise<Request | Response> {
  if (request.method !== "POST") return request;
  const declared = request.headers.get("Content-Length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > OAUTH_BODY_LIMIT)) {
    return problem("MCP_BODY_TOO_LARGE", 413);
  }
  if (!request.body) return request;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > OAUTH_BODY_LIMIT) {
        await reader.cancel();
        return problem("MCP_BODY_TOO_LARGE", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request, { method: "POST", body });
}

/** Wraps only the explicit MCP/OAuth routes; ordinary RSS/cron/maintenance remain untouched. */
export async function routeMcpRequest(
  request: Request,
  env: CloudflareEnv,
  ctx: ExecutionContext,
  defaultHandler: ExportedHandler<CloudflareEnv>,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!guardedPath(url)) return null;
  const appOrigin = mcpAppOrigin(env);
  if (env.RSS_MCP_ENABLED !== "true" || !env.OAUTH_KV || !appOrigin) {
    return problem("MCP_DISABLED", METADATA_PATHS.has(path) ? 404 : 503);
  }
  const denied = mcpRequestGuard(request, appOrigin);
  if (denied) return denied;
  const resource = `${appOrigin}${MCP_PATH}`;
  const challenge = `Bearer resource_metadata="${appOrigin}/.well-known/oauth-protected-resource/mcp", scope="${MCP_SCOPE}"`;
  const apiHandler = {
    async fetch(apiRequest: Request, apiEnv: CloudflareEnv, apiCtx: ExecutionContext) {
      // Only the provider invokes this protected handler. Neither the client body
      // nor the MCP SDK supplies identity; validate the provider context again.
      const authContext = apiCtx as ExecutionContext & {
        props?: unknown;
        auth?: OAuthResourceAuth;
      };
      const props = validateMcpAuthProps(authContext.props);
      const auth = authContext.auth;
      if (
        !props ||
        !auth ||
        auth.audience !== resource ||
        auth.userId !== props.userId ||
        !Array.isArray(auth.scope) ||
        (auth.expiresAt !== undefined &&
          (!Number.isFinite(auth.expiresAt) || auth.expiresAt <= Date.now() / 1000))
      )
        return problem("MCP_AUTH_INVALID", 401, challenge);
      if (!isMcpScopeSet(auth.scope, isMcpSubscriptionAddEnabled(apiEnv))) {
        return problem("MCP_INSUFFICIENT_SCOPE", 403, `${challenge}, error="insufficient_scope"`);
      }
      try {
        await assertMcpConnection(apiEnv.RSS_DATA, props, apiEnv);
      } catch (error) {
        if (error instanceof McpConnectionError && error.code === "MCP_CONNECTION_REVOKED") {
          return problem("MCP_CONNECTION_REVOKED", 401, `${challenge}, error="invalid_token"`);
        }
        return problem("MCP_AUTH_UNAVAILABLE", 503);
      }
      // Existing KV limiter is a best-effort application throttle, not a billing
      // hard cap or cross-POP atomic quota. Per-request data budgets remain strict.
      const limited = await throttleMcp(apiEnv.RATE_LIMIT, props.userId);
      if (limited) {
        limited.headers.set("Cache-Control", "private, no-store");
        return limited;
      }
      const repair = async () => {
        await addUserToIndex(apiEnv.RSS_DATA, props.userId);
        await apiEnv.RATE_LIMIT.delete(FEED_USER_MAP_CACHE_KEY);
        if (typeof caches !== "undefined" && caches.default)
          await caches.default.delete(
            await buildCacheKey(appOrigin, "feeds", `user:${props.userId}`),
          );
      };
      const subscriptionAdder = isMcpSubscriptionAddEnabled(apiEnv)
        ? createMcpSubscriptionAdder(apiEnv, props.userId, {
            assertAuthorized: async () => {
              if (
                apiEnv.RSS_MCP_ENABLED !== "true" ||
                !isMcpSubscriptionAddEnabled(apiEnv) ||
                !isMcpScopeSet(auth.scope, true) ||
                !auth.scope.includes(MCP_ADD_SCOPE) ||
                auth.audience !== resource ||
                auth.userId !== props.userId ||
                !Number.isFinite(auth.expiresAt) ||
                auth.expiresAt! <= Date.now() / 1000
              )
                throw new McpConnectionError("MCP_AUTH_INVALID");
              await assertMcpConnection(apiEnv.RSS_DATA, props, apiEnv);
            },
            afterCommit: repair,
            onExisting: repair,
          })
        : undefined;
      return serveMcpData(apiRequest, apiEnv.RSS_DATA, props.userId, {
        scopes: auth.scope,
        subscriptionAdder,
      });
    },
  } satisfies ExportedHandler<CloudflareEnv>;
  try {
    const bounded = path === MCP_PATH ? request : await boundedOAuthBody(request);
    if (bounded instanceof Response) return bounded;
    const provider = createMcpOAuthProvider(
      apiHandler,
      defaultHandler,
      appOrigin,
      isMcpSubscriptionAddEnabled(env),
    );
    // RFC 9728 derives the metadata path from the /mcp resource. Retain the
    // root discovery alias for hosts probing it, with the same canonical data.
    const providerRequest =
      path === "/.well-known/oauth-protected-resource"
        ? new Request(`${appOrigin}/.well-known/oauth-protected-resource/mcp`, {
            method: bounded.method,
            headers: bounded.headers,
          })
        : bounded;
    // The provider injects its helper into env. Keep that mutation request-local
    // so an earlier request/configuration can never lend a stale helper to Next.
    const requestEnv: CloudflareEnv = { ...env, OAUTH_PROVIDER: undefined };
    const response = await provider.fetch(providerRequest, requestEnv, ctx);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  } catch {
    // Never log/echo a Request, OAuth form, token, Cookie, or raw storage error.
    return problem("MCP_AUTH_UNAVAILABLE", 503);
  }
}
