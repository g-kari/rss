// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { getOAuthApi, type OAuthHelpers } from "@cloudflare/workers-oauth-provider";

const mock = vi.hoisted(() => ({
  env: {} as CloudflareEnv,
  userId: "account-a",
  mode: "session",
  cookies: new Map<string, string>(),
  exchangeCode: vi.fn(),
  verifyJwt: vi.fn(),
}));
vi.mock("./server-auth", () => ({
  withSession: async (_request: Request, callback: (context: unknown) => Promise<NextResponse>) => {
    if (mock.mode === "anonymous")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (mock.mode === "dbsc")
      return NextResponse.json(
        { error: "Challenge" },
        { status: 401, headers: { "Sec-Session-Challenge": 'challenge="synthetic-challenge"' } },
      );
    let response: NextResponse;
    try {
      response = await callback({
        session: { userId: mock.userId },
        env: mock.env,
        ctx: {},
        origin: "https://rss.example",
      });
    } catch {
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
    response.cookies.set("synthetic-refreshed-session", "synthetic", { secure: true });
    return response;
  },
  isBetaAllowed: () => true,
  createServerSession: vi.fn(async () => "00000000-0000-4000-8000-000000000003"),
  setAccessTokenCookies: (response: NextResponse, token: string) =>
    response.cookies.set("access_token", token, { secure: true, httpOnly: true }),
  setSessionCookie: (response: NextResponse, session: string) =>
    response.cookies.set("session_id", session, { secure: true, httpOnly: true }),
}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: mock.env, ctx: {} }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) => (mock.cookies.has(key) ? { value: mock.cookies.get(key) } : undefined),
  }),
}));
vi.mock("./auth", () => ({
  exchangeCode: mock.exchangeCode,
  verifyJwt: mock.verifyJwt,
  timingSafeEqual: (a: string, b: string) => a === b,
  base64urlToBytes: () => new Uint8Array(),
}));
vi.mock("./dbsc", () => ({
  generateDbscChallenge: () => "synthetic-dbsc-challenge",
  buildSecureSessionRegistrationHeader: () => "synthetic-dbsc-registration",
}));

import { GET as authorizeGet, POST as authorizePost } from "../../app/api/mcp/authorize/route";
import {
  GET as connectionGet,
  DELETE as connectionDelete,
} from "../../app/api/mcp/connection/route";
import { GET as settingsGet, POST as settingsPost } from "../../app/api/mcp/settings/route";
import { GET as loginGet } from "../../app/api/auth/login/route";
import { GET as callbackGet } from "../../app/api/auth/callback/route";
import { approveMcpConnection, assertMcpConnection, cleanupMcpGrants, MCP_SCOPE } from "./mcp-auth";

import { mcpOAuthOptions } from "./mcp-provider";

const ORIGIN = "https://rss.example";
let provider: OAuthHelpers;
let get: ReturnType<typeof vi.fn>;
let put: ReturnType<typeof vi.fn>;
let entries: Map<string, { value: string; etag: string }>;
let authorizationUrl: URL;
let grantEntries: Map<string, string>;
function request(url: string | URL, method = "GET", body?: string, cookie?: string): Request {
  return new Request(url, {
    method,
    headers: {
      ...(method === "POST"
        ? { "Content-Type": "application/x-www-form-urlencoded", origin: ORIGIN }
        : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body } : {}),
  });
}
function responseCookies(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";", 1)[0])
    .join("; ");
}
function formHandle(html: string): string {
  return html.match(/name="handle" value="([A-Za-z0-9_-]+)"/)![1];
}

beforeEach(async () => {
  mock.userId = "account-a";
  mock.mode = "session";
  mock.cookies.clear();
  mock.exchangeCode.mockReset();
  mock.verifyJwt.mockReset();
  process.env.APP_BASE_URL = ORIGIN;
  process.env.AUTH_BASE_URL = "https://id.example";
  process.env.CLIENT_ID = "synthetic-first-party-client";
  let version = 0;
  entries = new Map();
  grantEntries = new Map();
  get = vi.fn(async (key: string) => {
    const entry = entries.get(key);
    return entry
      ? { size: entry.value.length, etag: entry.etag, json: async () => JSON.parse(entry.value) }
      : null;
  });
  put = vi.fn(async (key: string, value: string, options?: R2PutOptions) => {
    const current = entries.get(key);
    const condition = options?.onlyIf as R2Conditional | undefined;
    if (
      (condition?.etagMatches && condition.etagMatches !== current?.etag) ||
      (condition?.etagDoesNotMatch === "*" && current)
    )
      return null;
    const etag = `${++version}`;
    entries.set(key, { value, etag });
    return { etag };
  });
  const kv = {
    get: async (key: string, type?: string | { type: string }) => {
      const value = grantEntries.get(key);
      return value
        ? type === "json" || (typeof type === "object" && type.type === "json")
          ? JSON.parse(value)
          : value
        : null;
    },
    put: async (key: string, value: string) => {
      grantEntries.set(key, value);
    },
    delete: async (key: string) => {
      grantEntries.delete(key);
    },
    list: async ({ prefix = "" }: { prefix?: string } = {}) => ({
      keys: [...grantEntries.keys()]
        .filter((name) => name.startsWith(prefix))
        .map((name) => ({ name })),
      list_complete: true,
      cursor: "",
    }),
  } as unknown as KVNamespace;
  mock.env = {
    RSS_DATA: { get, put } as unknown as R2Bucket,
    OAUTH_KV: kv,
    RSS_MCP_ENABLED: "true",
    APP_BASE_URL: ORIGIN,
  } as CloudflareEnv;
  const handler = { fetch: async () => new Response("synthetic") };
  provider = getOAuthApi(mcpOAuthOptions(handler, handler, ORIGIN), mock.env);
  mock.env.OAUTH_PROVIDER = provider;
  const client = await provider.createClient({
    clientName: '<script>alert("client")</script>',
    redirectUris: ["https://client.example/callback"],
    tokenEndpointAuthMethod: "none",
    grantTypes: ["authorization_code", "refresh_token"],
    responseTypes: ["code"],
  });
  authorizationUrl = new URL("/api/mcp/authorize", ORIGIN);
  for (const [key, value] of Object.entries({
    client_id: client.clientId,
    redirect_uri: client.redirectUris[0],
    response_type: "code",
    scope: MCP_SCOPE,
    resource: `${ORIGIN}/mcp`,
    code_challenge: "a".repeat(43),
    code_challenge_method: "S256",
    state: "synthetic-client-state",
  }))
    authorizationUrl.searchParams.set(key, value);
  await provider.parseAuthRequest(request(authorizationUrl));
});

describe("Cookie-authenticated consent and connection routes", () => {
  it("shows account/read scope/private-feed consequences, escapes clients, preserves provider and refreshed cookies", async () => {
    const response = await authorizeGet(request(authorizationUrl));
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("account-a");
    expect(html).toContain("rss:read");
    expect(html).toContain("成人向け");
    expect(html).toContain("/api/mcp/settings");
    expect(html).not.toContain("<script>");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(responseCookies(response)).toContain("__Host-rss-mcp-consent-");
    expect(responseCookies(response)).toContain("synthetic-refreshed-session");
    const handle = formHandle(html);
    const approved = await authorizePost(
      request(
        new URL("/api/mcp/authorize", ORIGIN),
        "POST",
        `handle=${handle}&decision=approve`,
        responseCookies(response),
      ),
    );
    expect(approved.status).toBe(303);
    expect(new URL(approved.headers.get("location")!).hostname).toBe("client.example");
    expect(new URL(approved.headers.get("location")!).searchParams.get("iss")).toBe(ORIGIN);
    expect((await connectionGet(request(`${ORIGIN}/api/mcp/connection`))).status).toBe(200);
    const metadata = await (await connectionGet(request(`${ORIGIN}/api/mcp/connection`))).text();
    expect(metadata).toContain('"active":true');
    expect(metadata).not.toMatch(/token:|refresh_token|connectionRevision|encryptedProps|grantId/);
    expect(
      (
        await authorizePost(
          request(
            `${ORIGIN}/api/mcp/authorize`,
            "POST",
            `handle=${handle}&decision=approve`,
            responseCookies(response),
          ),
        )
      ).status,
    ).toBe(400);
  });
  it("rejects account switching, browser mismatch, cross-origin POST, unknown scopes and changed revocation revision", async () => {
    const response = await authorizeGet(request(authorizationUrl));
    const handle = formHandle(await response.text());
    mock.userId = "account-b";
    expect(
      (
        await authorizePost(
          request(
            `${ORIGIN}/api/mcp/authorize`,
            "POST",
            `handle=${handle}&decision=approve`,
            responseCookies(response),
          ),
        )
      ).status,
    ).toBe(409);
    expect(put).not.toHaveBeenCalled();
    mock.userId = "account-a";
    expect(
      (
        await authorizePost(
          request(`${ORIGIN}/api/mcp/authorize`, "POST", `handle=${handle}&decision=approve`),
        )
      ).status,
    ).toBe(400);
    const cross = request(
      `${ORIGIN}/api/mcp/authorize`,
      "POST",
      `handle=${handle}&decision=approve`,
      responseCookies(response),
    );
    cross.headers.set("origin", "https://evil.example");
    expect((await authorizePost(cross)).status).toBe(403);
    authorizationUrl.searchParams.set("scope", "rss:read write");
    expect((await authorizeGet(request(authorizationUrl))).status).toBe(400);
    // A new disabled revision after the page was shown cannot be overwritten by its old approval.
    entries.set("users/account-a/mcp-connection.json", {
      value: JSON.stringify({
        version: 1,
        revision: crypto.randomUUID(),
        active: false,
        updatedAt: new Date().toISOString(),
      }),
      etag: "synthetic-later",
    });
    expect(
      (
        await authorizePost(
          request(
            `${ORIGIN}/api/mcp/authorize`,
            "POST",
            `handle=${handle}&decision=approve`,
            responseCookies(response),
          ),
        )
      ).status,
    ).toBe(409);
  });
  it("denies without activating, preserves DBSC challenge and feature-off behavior", async () => {
    const response = await authorizeGet(request(authorizationUrl));
    const handle = formHandle(await response.text());
    const denied = await authorizePost(
      request(
        `${ORIGIN}/api/mcp/authorize`,
        "POST",
        `handle=${handle}&decision=deny`,
        responseCookies(response),
      ),
    );
    expect(new URL(denied.headers.get("location")!).searchParams.get("error")).toBe(
      "access_denied",
    );
    expect(put).not.toHaveBeenCalled();
    mock.mode = "dbsc";
    const challenge = await authorizeGet(request(authorizationUrl));
    expect(challenge.status).toBe(401);
    expect(challenge.headers.get("Sec-Session-Challenge")).toContain("synthetic-challenge");
    mock.env.RSS_MCP_ENABLED = "false";
    expect((await authorizeGet(request(authorizationUrl))).status).toBe(404);
    mock.mode = "session";
    expect((await settingsGet(request(`${ORIGIN}/api/mcp/settings`))).status).toBe(404);
  });
  it("provides a script-free accessible settings form and commits revocation before failed cleanup", async () => {
    const props = await approveMcpConnection(mock.env.RSS_DATA, "account-a", null);
    const settings = await settingsGet(request(`${ORIGIN}/api/mcp/settings`));
    const html = await settings.text();
    expect(html).toContain('name="account" value="account-a"');
    expect(html).toContain("すべての読み取り連携を解除");
    expect(html).not.toContain("<script");
    expect(
      (await settingsPost(request(`${ORIGIN}/api/mcp/settings`, "POST", "account=account-b")))
        .status,
    ).toBe(409);
    const writes = put.mock.calls.length;
    const broken = {
      ...provider,
      listUserGrants: vi.fn(async () => {
        expect(put.mock.calls.length).toBeGreaterThan(writes);
        throw new Error("synthetic KV outage");
      }),
    } as unknown as OAuthHelpers;
    mock.env.OAUTH_PROVIDER = broken;
    const disconnected = await settingsPost(
      request(`${ORIGIN}/api/mcp/settings`, "POST", "account=account-a"),
    );
    expect(disconnected.status).toBe(200);
    expect(await disconnected.text()).toContain('role="status"');
    await expect(assertMcpConnection(mock.env.RSS_DATA, props, mock.env)).rejects.toMatchObject({
      code: "MCP_CONNECTION_REVOKED",
    });
    expect(
      (
        await connectionDelete(
          new Request(`${ORIGIN}/api/mcp/connection`, {
            method: "DELETE",
            headers: { origin: ORIGIN, "X-RSS-Account-Id": "account-b" },
          }),
        )
      ).status,
    ).toBe(409);
  });
  it("never cleans up a concurrently newly approved or same-second grant", async () => {
    const revoke = vi.fn(async () => {});
    const now = Math.floor(Date.now() / 1_000);
    const cleanup = {
      listUserGrants: async () => ({
        items: [
          { id: "old", createdAt: now - 1 },
          { id: "new-same-second", createdAt: now },
          { id: "new-later", createdAt: now + 1 },
        ],
      }),
      revokeGrant: revoke,
    } as unknown as OAuthHelpers;
    expect(await cleanupMcpGrants(cleanup, "account-a", new Date().toISOString())).toBe(false);
    expect(revoke).toHaveBeenCalledExactlyOnceWith("old", "account-a");
  });
});

describe("ordinary login and exact OAuth resume callback regression", () => {
  it("keeps default login state cookie and /?login=1 return plus DBSC registration", async () => {
    const login = await loginGet(
      request(`${ORIGIN}/api/auth/login?return_to=https://evil.example`),
    );
    const state = new URL(login.headers.get("location")!).searchParams.get("state")!;
    expect(login.cookies.get("auth_state")?.value).toBe(state);
    mock.cookies.set("auth_state", state);
    mock.exchangeCode.mockResolvedValue({
      access_token: "synthetic-access",
      refresh_token: "synthetic-refresh",
      user: { id: "synthetic-id", name: "Synthetic", email: "synthetic@example.test" },
    });
    mock.verifyJwt.mockResolvedValue({ sub: "account-a" });
    const callback = await callbackGet(
      request(`${ORIGIN}/api/auth/callback?code=synthetic-code&state=${state}`),
    );
    expect(callback.headers.get("location")).toBe(`${ORIGIN}/?login=1`);
    expect(callback.headers.get("Secure-Session-Registration")).toBe("synthetic-dbsc-registration");
    expect(responseCookies(callback)).toContain("access_token=synthetic-access");
    expect(responseCookies(callback)).toContain("session_id=");
    mock.exchangeCode.mockClear();
    mock.cookies.set("auth_state", "different");
    expect(
      (await callbackGet(request(`${ORIGIN}/api/auth/callback?code=synthetic-code&state=${state}`)))
        .status,
    ).toBe(400);
    expect(mock.exchangeCode).not.toHaveBeenCalled();
  });
  it("performs browser-bound logged-out resume, preserves normal auth_state and returns only to final account consent", async () => {
    mock.mode = "anonymous";
    const consent = await authorizeGet(request(authorizationUrl));
    const handle = formHandle(await consent.text());
    const beginning = await authorizePost(
      request(
        `${ORIGIN}/api/mcp/authorize`,
        "POST",
        `handle=${handle}&decision=login`,
        responseCookies(consent),
      ),
    );
    expect(beginning.status).toBe(303);
    expect(put).not.toHaveBeenCalled();
    mock.cookies.set("auth_state", "existing-normal-login");
    const login = await loginGet(
      request(beginning.headers.get("location")!, "GET", undefined, responseCookies(beginning)),
    );
    const state = new URL(login.headers.get("location")!).searchParams.get("state")!;
    expect(state).toMatch(/^mcp\./);
    expect(responseCookies(login)).not.toContain("auth_state=");
    mock.exchangeCode.mockResolvedValue({
      access_token: "synthetic-access",
      refresh_token: "synthetic-refresh",
      user: { id: "synthetic-id", name: "Synthetic", email: "synthetic@example.test" },
    });
    mock.verifyJwt.mockResolvedValue({ sub: "account-a" });
    const callback = await callbackGet(
      request(
        `${ORIGIN}/api/auth/callback?code=synthetic-code&state=${state}`,
        "GET",
        undefined,
        responseCookies(login),
      ),
    );
    expect(callback.status).toBe(307);
    expect(new URL(callback.headers.get("location")!).pathname).toBe("/api/mcp/authorize");
    expect(callback.headers.get("Secure-Session-Registration")).toBe("synthetic-dbsc-registration");
    expect(responseCookies(callback)).not.toContain("auth_state=");
    mock.mode = "session";
    const finalConsent = await authorizeGet(
      request(callback.headers.get("location")!, "GET", undefined, responseCookies(callback)),
    );
    expect(finalConsent.status).toBe(200);
    expect(await finalConsent.text()).toContain("account-a");
    mock.exchangeCode.mockClear();
    const replay = await callbackGet(
      request(
        `${ORIGIN}/api/auth/callback?code=synthetic-code&state=${state}`,
        "GET",
        undefined,
        responseCookies(login),
      ),
    );
    expect(replay.status).toBe(400);
    expect(mock.exchangeCode).not.toHaveBeenCalled();
  });
});
