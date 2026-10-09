// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { mcpAppOrigin, mcpRequestGuard, routeMcpRequest } from "./mcp-boundary";

const ORIGIN = "https://rss.example";
const ctx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
  props: {},
} as unknown as ExecutionContext;
let env: CloudflareEnv;
let defaultHandler: { fetch: Mock<NonNullable<ExportedHandler<CloudflareEnv>["fetch"]>> };
let r2Get: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubGlobal("Cloudflare", { compatibilityFlags: { global_fetch_strictly_public: true } });
  r2Get = vi.fn(async () => null);
  env = {
    APP_BASE_URL: ORIGIN,
    RSS_MCP_ENABLED: "true",
    OAUTH_KV: { get: vi.fn(async () => null), put: vi.fn(), list: vi.fn() },
    RSS_DATA: { get: r2Get },
    RATE_LIMIT: { get: vi.fn(async () => null), put: vi.fn() },
  } as unknown as CloudflareEnv;
  defaultHandler = { fetch: vi.fn(async () => new Response("normal RSS")) };
});
afterEach(() => vi.unstubAllGlobals());
function request(path: string, init?: RequestInit) {
  return new Request(`${ORIGIN}${path}`, init);
}
describe("gated OAuth Worker boundary", () => {
  it("advertises subscription-add scope only with its distinct exact opt-in gate", async () => {
    const enabled = { ...env, RSS_MCP_SUBSCRIBE_ENABLED: "true" };
    const response = await routeMcpRequest(
      request("/.well-known/oauth-authorization-server"),
      enabled,
      ctx,
      defaultHandler,
    );
    expect(await response!.json()).toMatchObject({
      scopes_supported: ["rss:read", "rss:subscriptions:add"],
    });
    const disabled = { ...env, RSS_MCP_SUBSCRIBE_ENABLED: "TRUE" };
    const off = await routeMcpRequest(
      request("/.well-known/oauth-authorization-server"),
      disabled,
      ctx,
      defaultHandler,
    );
    expect(await off!.json()).toMatchObject({ scopes_supported: ["rss:read"] });
  });
  it("defaults off without any storage/OpenNext access; ordinary RSS requests remain delegated", async () => {
    for (const disabled of [
      { ...env, RSS_MCP_ENABLED: undefined },
      { ...env, RSS_MCP_ENABLED: "TRUE" },
      { ...env, OAUTH_KV: undefined },
      { ...env, APP_BASE_URL: "https://rss.example/evil" },
    ]) {
      expect((await routeMcpRequest(request("/mcp"), disabled, ctx, defaultHandler))?.status).toBe(
        503,
      );
      expect(
        (
          await routeMcpRequest(
            request("/.well-known/oauth-protected-resource"),
            disabled,
            ctx,
            defaultHandler,
          )
        )?.status,
      ).toBe(404);
      expect(
        (
          await routeMcpRequest(
            request("/api/auth/login?mcp_resume=synthetic"),
            disabled,
            ctx,
            defaultHandler,
          )
        )?.status,
      ).toBe(503);
    }
    expect(await routeMcpRequest(request("/api/auth/login"), env, ctx, defaultHandler)).toBeNull();
    expect(
      await routeMcpRequest(request("/api/auth/callback?state=ordinary"), env, ctx, defaultHandler),
    ).toBeNull();
    expect(await routeMcpRequest(request("/api/feeds"), env, ctx, defaultHandler)).toBeNull();
    expect(await routeMcpRequest(request("/mcp-other"), env, ctx, defaultHandler)).toBeNull();
    expect(r2Get).not.toHaveBeenCalled();
    expect(defaultHandler.fetch).not.toHaveBeenCalled();
  });
  it("requires exact canonical host and checks present Origins without requiring server clients to send one", () => {
    expect(mcpAppOrigin({ APP_BASE_URL: `${ORIGIN}/` })).toBe(ORIGIN);
    for (const base of [
      "http://rss.example",
      "https://user:secret@rss.example",
      `${ORIGIN}/path`,
      `${ORIGIN}?token=x`,
      `${ORIGIN}#x`,
      "HTTPS://RSS.EXAMPLE",
    ])
      expect(mcpAppOrigin({ APP_BASE_URL: base })).toBeNull();
    expect(mcpRequestGuard(request("/mcp"), ORIGIN)).toBeNull();
    expect(
      mcpRequestGuard(request("/mcp", { headers: { Origin: "https://chatgpt.com" } }), ORIGIN),
    ).toBeNull();
    for (const origin of ["null", "https://evil.example", `${ORIGIN}/path`, ""])
      expect(
        mcpRequestGuard(request("/mcp", { headers: { Origin: origin } }), ORIGIN)?.status,
      ).toBe(403);
    expect(
      mcpRequestGuard(request("/mcp", { headers: { Host: "evil.example" } }), ORIGIN)?.status,
    ).toBe(403);
    expect(mcpRequestGuard(request("/mcp?access_token=synthetic"), ORIGIN)?.status).toBe(400);
  });
  it("advertises exact read scope, issuer and PKCE/CIMD discovery only when enabled", async () => {
    const resource = await routeMcpRequest(
      request("/.well-known/oauth-protected-resource"),
      env,
      ctx,
      defaultHandler,
    );
    expect(resource?.status).toBe(200);
    expect(await resource!.json()).toMatchObject({
      resource: `${ORIGIN}/mcp`,
      authorization_servers: [ORIGIN],
      scopes_supported: ["rss:read"],
      bearer_methods_supported: ["header"],
    });
    const metadata = await routeMcpRequest(
      request("/.well-known/oauth-authorization-server"),
      env,
      ctx,
      defaultHandler,
    );
    const data = (await metadata!.json()) as Record<string, unknown>;
    expect(data).toMatchObject({
      issuer: ORIGIN,
      authorization_endpoint: `${ORIGIN}/api/mcp/authorize`,
      token_endpoint: `${ORIGIN}/api/mcp/token`,
      code_challenge_methods_supported: ["S256"],
      client_id_metadata_document_supported: true,
    });
    expect(data.registration_endpoint).toBeUndefined();
    expect(resource!.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("never authenticates MCP through Cookie, clip token or forged login bearer", async () => {
    const credentialCases: Record<string, string>[] = [
      { Cookie: "access_token=synthetic-login; session_id=synthetic-session" },
      { Authorization: "Bearer clip_v1.synthetic" },
      { Authorization: "Bearer synthetic-login-token" },
    ];
    for (const headers of credentialCases) {
      const response = await routeMcpRequest(
        request("/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
        }),
        env,
        ctx,
        defaultHandler,
      );
      expect(response?.status).toBe(401);
      expect(response?.headers.get("WWW-Authenticate")).toContain("resource_metadata");
    }
    expect(r2Get).not.toHaveBeenCalled();
    expect(defaultHandler.fetch).not.toHaveBeenCalled();
  });
  it("passes request-local helpers through tagged login/callback and consent while preserving ordinary delegation", async () => {
    for (const path of [
      "/api/mcp/authorize",
      "/api/mcp/settings",
      "/api/auth/login?mcp_resume=synthetic",
      "/api/auth/callback?state=mcp.synthetic",
    ]) {
      const response = await routeMcpRequest(request(path), env, ctx, defaultHandler);
      expect(response?.status).toBe(200);
      const passedEnv = defaultHandler.fetch.mock.calls.at(-1)?.[1] as CloudflareEnv;
      expect(typeof passedEnv.OAUTH_PROVIDER?.parseAuthRequest).toBe("function");
      expect(passedEnv).not.toBe(env);
      expect(env.OAUTH_PROVIDER).toBeUndefined();
    }
  });
  it("caps OAuth form bytes before helpers or OpenNext, even when Content-Length lies", async () => {
    const response = await routeMcpRequest(
      request("/api/mcp/authorize", {
        method: "POST",
        headers: {
          Origin: ORIGIN,
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": "1",
        },
        body: "x".repeat(17 * 1024),
      }),
      env,
      ctx,
      defaultHandler,
    );
    expect(response?.status).toBe(413);
    expect(defaultHandler.fetch).not.toHaveBeenCalled();
    expect(r2Get).not.toHaveBeenCalled();
  });
});
