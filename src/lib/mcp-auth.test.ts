// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({ WorkerEntrypoint: class {} }));
import {
  getOAuthApi,
  GrantType,
  type OAuthHelpers,
  type AuthRequest,
} from "@cloudflare/workers-oauth-provider";
import {
  appendMcpHeaders,
  approveMcpConnection,
  assertMcpConnection,
  cleanupMcpGrants,
  disconnectMcpConnection,
  isMcpEnabled,
  MCP_SCOPE,
  mcpLoginResumeData,
  readMcpConnection,
  readMcpConsentAccount,
  storeMcpConsentAccount,
  validateMcpAuthProps,
  validateMcpAuthorization,
  validateMcpLoginResume,
} from "./mcp-auth";
import { createMcpOAuthProvider, mcpOAuthOptions } from "./mcp-provider";
import { finishMcpLogin, mcpAuthorizationReturn, startMcpLogin } from "./mcp-login";
import { readMcpConsentForm, renderMcpConsent } from "./mcp-auth-ui";

const ORIGIN = "https://rss.example";
const handler = { fetch: async () => new Response("synthetic") };
const revision = "00000000-0000-4000-8000-000000000001";
const userId = "synthetic-user";
function memoryR2() {
  let version = 0;
  const entries = new Map<string, { value: string; etag: string }>();
  const get = vi.fn(async (key: string) => {
    const entry = entries.get(key);
    return entry
      ? {
          size: new TextEncoder().encode(entry.value).length,
          etag: entry.etag,
          json: async () => JSON.parse(entry.value),
        }
      : null;
  });
  const put = vi.fn(async (key: string, value: string, options?: R2PutOptions) => {
    const entry = entries.get(key);
    const condition = options?.onlyIf as R2Conditional | undefined;
    if (
      (condition?.etagMatches && condition.etagMatches !== entry?.etag) ||
      (condition?.etagDoesNotMatch === "*" && entry)
    )
      return null;
    const etag = `${++version}`;
    entries.set(key, { value, etag });
    return { etag };
  });
  return { bucket: { get, put } as unknown as R2Bucket, get, put, entries };
}
function memoryKv() {
  const entries = new Map<string, { value: string; expires: number }>();
  const kv = {
    put: vi.fn(async (key: string, value: string, options?: KVNamespacePutOptions) => {
      entries.set(key, {
        value,
        expires: options?.expirationTtl
          ? Date.now() + options.expirationTtl * 1_000
          : Number.POSITIVE_INFINITY,
      });
    }),
    get: vi.fn(async (key: string, type?: string | { type: string }) => {
      const entry = entries.get(key);
      if (!entry || entry.expires <= Date.now()) return null;
      return type === "json" || (typeof type === "object" && type.type === "json")
        ? JSON.parse(entry.value)
        : entry.value;
    }),
    delete: vi.fn(async (key: string) => {
      entries.delete(key);
    }),
    list: vi.fn(async ({ prefix = "" }: { prefix?: string } = {}) => ({
      keys: [...entries.keys()].filter((name) => name.startsWith(prefix)).map((name) => ({ name })),
      list_complete: true,
      cursor: "",
    })),
  };
  return { kv: kv as unknown as KVNamespace, entries };
}
function boundRequest(url: string, headers: Headers): Request {
  return new Request(url, {
    headers: {
      cookie: headers
        .getSetCookie()
        .map((cookie) => cookie.split(";", 1)[0])
        .join("; "),
    },
  });
}
const auth: AuthRequest = {
  clientId: "synthetic-client",
  redirectUri: "https://client.example/callback",
  responseType: "code",
  scope: [MCP_SCOPE],
  resource: `${ORIGIN}/mcp`,
  issuer: ORIGIN,
  state: "synthetic-client-state",
  codeChallenge: "a".repeat(43),
  codeChallengeMethod: "S256",
};
let storage: ReturnType<typeof memoryR2>;
let namespace: ReturnType<typeof memoryKv>;
let env: CloudflareEnv;
let provider: OAuthHelpers;
beforeEach(() => {
  vi.useRealTimers();
  delete process.env.BETA_ALLOWED_SUBS;
  storage = memoryR2();
  namespace = memoryKv();
  env = {
    RSS_DATA: storage.bucket,
    OAUTH_KV: namespace.kv,
    RSS_MCP_ENABLED: "true",
  } as CloudflareEnv;
  provider = getOAuthApi(mcpOAuthOptions(handler, handler, ORIGIN), env);
});

describe("MCP OAuth policy and revocation", () => {
  it("defaults off; configures a single exact read resource, CIMD, bounded lifetimes, no DCR/external credentials", () => {
    expect(isMcpEnabled({})).toBe(false);
    expect(isMcpEnabled({ RSS_MCP_ENABLED: "true" })).toBe(false);
    const options = mcpOAuthOptions(handler, handler, ORIGIN);
    expect(options).toMatchObject({
      apiRoute: `${ORIGIN}/mcp`,
      authorizeEndpoint: `${ORIGIN}/api/mcp/authorize`,
      tokenEndpoint: `${ORIGIN}/api/mcp/token`,
      accessTokenTTL: 900,
      refreshTokenTTL: 2_592_000,
      refreshTokenIdleTTL: 2_592_000,
      requiredScopes: ["rss:read"],
      clientIdMetadataDocumentEnabled: true,
      allowTokenExchangeGrant: false,
    });
    expect(options.clientRegistrationEndpoint).toBeUndefined();
    expect(options.resolveExternalToken).toBeUndefined();
    expect(() => createMcpOAuthProvider(handler, handler, "https://rss.example/evil")).toThrow();
  });
  it("rejects caller identity paths, credentials and unapproved props", () => {
    expect(validateMcpAuthProps({ userId, connectionRevision: revision })).toEqual({
      userId,
      connectionRevision: revision,
    });
    for (const value of [
      null,
      { userId: "../other", connectionRevision: revision },
      { userId, connectionRevision: "bad" },
      { userId, connectionRevision: revision, access_token: "synthetic-secret" },
      { userId: "..", connectionRevision: revision },
    ])
      expect(validateMcpAuthProps(value)).toBeNull();
    for (const bad of [
      { ...auth, resource: "https://elsewhere.example/mcp" },
      { ...auth, scope: [] },
      { ...auth, scope: [MCP_SCOPE, "write"] },
      { ...auth, codeChallengeMethod: "plain" },
    ])
      expect(() => validateMcpAuthorization(bad, ORIGIN)).toThrow();
  });
  it("CAS creates state once, rejects stale approval, and requires new consent after disconnect", async () => {
    const [first, second] = await Promise.allSettled([
      approveMcpConnection(storage.bucket, userId, null),
      approveMcpConnection(storage.bucket, userId, null),
    ]);
    expect([first, second].filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const props =
      first.status === "fulfilled"
        ? first.value
        : (second as PromiseFulfilledResult<{ userId: string; connectionRevision: string }>).value;
    expect(await assertMcpConnection(storage.bucket, props, env)).toEqual(props);
    expect(storage.put.mock.calls[0][2]?.onlyIf).toEqual({ etagDoesNotMatch: "*" });
    const disabled = await disconnectMcpConnection(storage.bucket, userId);
    await expect(assertMcpConnection(storage.bucket, props, env)).rejects.toMatchObject({
      code: "MCP_CONNECTION_REVOKED",
    });
    await expect(
      approveMcpConnection(storage.bucket, userId, props.connectionRevision),
    ).rejects.toMatchObject({ code: "MCP_CONNECTION_CONFLICT" });
    const next = await approveMcpConnection(storage.bucket, userId, disabled.revision);
    expect(next.connectionRevision).not.toBe(props.connectionRevision);
    await expect(assertMcpConnection(storage.bucket, props, env)).rejects.toThrow();
    await expect(assertMcpConnection(storage.bucket, next, env)).resolves.toEqual(next);
  });
  it("token exchange and refresh fail closed on R2 revoke/beta/outage without reactivating", async () => {
    const props = await approveMcpConnection(storage.bucket, userId, null);
    const callback = mcpOAuthOptions(handler, handler, ORIGIN).tokenExchangeCallback!;
    const options = {
      grantType: GrantType.REFRESH_TOKEN,
      clientId: "synthetic-client",
      subjectClientId: "synthetic-client",
      grantId: "synthetic-grant",
      userId,
      scope: [MCP_SCOPE],
      requestedScope: [MCP_SCOPE],
      resource: `${ORIGIN}/mcp`,
      props,
      env,
    };
    await expect(callback(options)).resolves.toEqual({ accessTokenScope: [MCP_SCOPE] });
    env.BETA_ALLOWED_SUBS = "other-user";
    await expect(callback(options)).rejects.toMatchObject({ code: "invalid_grant" });
    delete env.BETA_ALLOWED_SUBS;
    await disconnectMcpConnection(storage.bucket, userId);
    const writes = storage.put.mock.calls.length;
    await expect(
      callback({ ...options, grantType: GrantType.AUTHORIZATION_CODE }),
    ).rejects.toMatchObject({ code: "invalid_grant" });
    await expect(callback(options)).rejects.toMatchObject({ code: "invalid_grant" });
    expect(storage.put).toHaveBeenCalledTimes(writes);
    storage.get.mockRejectedValue(new Error("synthetic outage"));
    await expect(callback(options)).rejects.toMatchObject({
      code: "temporarily_unavailable",
      statusCode: 503,
    });
  });
  it("corrupt/oversized/missing R2 state never authenticates; CAS contention remains disabled", async () => {
    await expect(
      assertMcpConnection(storage.bucket, { userId, connectionRevision: revision }, env),
    ).rejects.toThrow();
    storage.entries.set(`users/${userId}/mcp-connection.json`, {
      value: '{"unexpected":true}',
      etag: "1",
    });
    await expect(readMcpConnection(storage.bucket, userId)).rejects.toMatchObject({
      code: "MCP_STORAGE_INVALID",
    });
    storage.entries.set(`users/${userId}/mcp-connection.json`, {
      value: " ".repeat(2_049),
      etag: "1",
    });
    await expect(readMcpConnection(storage.bucket, userId)).rejects.toMatchObject({
      code: "MCP_STORAGE_INVALID",
    });
    storage.entries.clear();
    storage.put.mockResolvedValue(null);
    await expect(disconnectMcpConnection(storage.bucket, userId)).rejects.toMatchObject({
      code: "MCP_CONNECTION_CONFLICT",
    });
    expect(storage.put).toHaveBeenCalledTimes(4);
  });
  it("cleanup failure cannot undo the committed revocation", async () => {
    const props = await approveMcpConnection(storage.bucket, userId, null);
    await disconnectMcpConnection(storage.bucket, userId);
    const failing = {
      listUserGrants: async () => {
        throw new Error("synthetic outage");
      },
    } as unknown as OAuthHelpers;
    expect(await cleanupMcpGrants(failing, userId, new Date().toISOString())).toBe(false);
    await expect(assertMcpConnection(storage.bucket, props, env)).rejects.toThrow();
  });
  it("refresh extends the configured idle lifetime, rotates tokens and rejects 30-day inactivity", async () => {
    vi.useFakeTimers();
    const initialTime = Date.now();
    const verifier = "synthetic-pkce-verifier-only-for-local-tests-1234567890";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const client = await provider.createClient({
      redirectUris: [auth.redirectUri],
      tokenEndpointAuthMethod: "none",
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
    });
    const props = await approveMcpConnection(storage.bucket, userId, null);
    const parsedUrl = new URL(`${ORIGIN}/api/mcp/authorize`);
    for (const [key, value] of Object.entries({
      client_id: client.clientId,
      redirect_uri: auth.redirectUri,
      response_type: "code",
      resource: `${ORIGIN}/mcp`,
      scope: MCP_SCOPE,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }))
      parsedUrl.searchParams.set(key, value);
    const parsed = await provider.parseAuthRequest(new Request(parsedUrl));
    const approved = await provider.completeAuthorization({
      request: parsed,
      userId,
      scope: [MCP_SCOPE],
      props,
      metadata: {},
      revokeExistingGrants: false,
    });
    const code = new URL(approved.redirectTo).searchParams.get("code")!;
    const oauth = createMcpOAuthProvider(handler, handler, ORIGIN);
    const ctx = {
      waitUntil: () => {},
      passThroughOnException: () => {},
    } as unknown as ExecutionContext;
    const exchange = async (params: Record<string, string>) =>
      oauth.fetch(
        new Request(`${ORIGIN}/api/mcp/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: client.clientId,
            resource: `${ORIGIN}/mcp`,
            ...params,
          }),
        }),
        { ...env, OAUTH_PROVIDER: undefined },
        ctx,
      );
    const issuedResponse = await exchange({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: auth.redirectUri,
    });
    expect(issuedResponse.status).toBe(200);
    const issued = (await issuedResponse.json()) as { refresh_token: string; expires_in: number };
    expect(issued.expires_in).toBe(900);
    vi.setSystemTime(initialTime + 29 * 86_400_000);
    const renewedResponse = await exchange({
      grant_type: "refresh_token",
      refresh_token: issued.refresh_token,
    });
    expect(renewedResponse.status).toBe(200);
    const renewed = (await renewedResponse.json()) as { refresh_token: string };
    expect(renewed.refresh_token).not.toBe(issued.refresh_token);
    vi.setSystemTime(initialTime + 31 * 86_400_000);
    const usedResponse = await exchange({
      grant_type: "refresh_token",
      refresh_token: renewed.refresh_token,
    });
    expect(usedResponse.status).toBe(200);
    const used = (await usedResponse.json()) as { refresh_token: string };
    vi.setSystemTime(initialTime + 62 * 86_400_000);
    const expired = await exchange({
      grant_type: "refresh_token",
      refresh_token: used.refresh_token,
    });
    expect(expired.status).toBe(400);
    expect(await expired.json()).toMatchObject({ error: "invalid_grant" });
    expect((await readMcpConnection(storage.bucket, userId)).state?.active).toBe(true);
    vi.useRealTimers();
  });
});

describe("provider-bound consent and safe first-party login resume", () => {
  it("binds separate tabs to one-use browser handles; refuses another browser, replay and expiry", async () => {
    const first = await provider.beginConsent(auth);
    const second = await provider.beginConsent(auth);
    await expect(provider.approveConsent(new Request(ORIGIN), first.handle)).rejects.toThrow();
    expect(first.headers.getSetCookie()[0]).toContain("__Host-rss-mcp-consent-");
    const approved = await provider.approveConsent(
      boundRequest(ORIGIN, first.headers),
      first.handle,
      { scope: [MCP_SCOPE] },
    );
    expect(approved.request).toEqual(auth);
    await expect(
      provider.approveConsent(boundRequest(ORIGIN, first.headers), first.handle),
    ).rejects.toThrow();
    const denied = await provider.denyConsent(boundRequest(ORIGIN, second.headers), second.handle);
    expect(new URL(denied.redirectTo).searchParams.get("error")).toBe("access_denied");
    expect(new URL(denied.redirectTo).searchParams.get("iss")).toBe(ORIGIN);
    const expired = await provider.beginConsent(auth);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 601_000);
    await expect(
      provider.approveConsent(boundRequest(ORIGIN, expired.headers), expired.handle),
    ).rejects.toThrow();
  });
  it("resumes only the original validated request and exact authorization route", async () => {
    const upstream = await provider.beginUpstream(auth, { data: mcpLoginResumeData() });
    const start = await startMcpLogin(
      boundRequest(
        `${ORIGIN}/api/auth/login?mcp_resume=${upstream.state}&return_to=https://evil.example`,
        upstream.headers,
      ),
      provider,
      ORIGIN,
    );
    expect(start.state).toMatch(/^mcp\.[A-Za-z0-9_-]{43}$/);
    const callback = boundRequest(
      `${ORIGIN}/api/auth/callback?state=${start.state}&code=synthetic-code`,
      start.headers,
    );
    const resumed = await finishMcpLogin(callback, provider, ORIGIN);
    expect(resumed.request).toEqual(auth);
    const returned = await mcpAuthorizationReturn(resumed, provider, ORIGIN);
    expect(returned.url.origin).toBe(ORIGIN);
    expect(returned.url.pathname).toBe("/api/mcp/authorize");
    const final = await provider.finishUpstream(
      boundRequest(returned.url.toString(), returned.headers),
    );
    expect(final.request).toEqual(auth);
    await expect(finishMcpLogin(callback, provider, ORIGIN)).rejects.toThrow();
    await expect(
      startMcpLogin(
        new Request(`${ORIGIN}/api/auth/login?mcp_resume=https://evil.example`),
        provider,
        ORIGIN,
      ),
    ).rejects.toThrow();
  });
  it("stores only bounded account/revision metadata with TTL and rejects expired/invalid resume data", async () => {
    const transaction = await provider.beginConsent(auth);
    await storeMcpConsentAccount(namespace.kv, transaction.handle, userId, revision);
    expect(await readMcpConsentAccount(namespace.kv, transaction.handle)).toMatchObject({
      userId,
      revision,
    });
    expect(
      [...namespace.entries.keys()].find((key) => key.startsWith("rss-mcp:consent-account:")),
    ).not.toContain(transaction.handle);
    for (const bad of [
      null,
      { ...mcpLoginResumeData(), return_to: "https://evil.example" },
      { kind: "rss-mcp-login", expiresAt: Date.now() - 1 },
      { kind: "rss-mcp-login", expiresAt: Date.now() + 900_000 },
    ])
      expect(() => validateMcpLoginResume(bad)).toThrow();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 601_000);
    await expect(readMcpConsentAccount(namespace.kv, transaction.handle)).rejects.toThrow();
  });
  it("preserves all security/browser cookies and escapes every untrusted client value without loading logos", () => {
    const headers = new Headers();
    headers.append("Set-Cookie", "a=1; Secure");
    headers.append("Set-Cookie", "b=2; Secure");
    headers.set("Cache-Control", "no-store");
    const target = new Headers();
    appendMcpHeaders(target, headers);
    expect(target.getSetCookie()).toEqual(["a=1; Secure", "b=2; Secure"]);
    const html = renderMcpConsent(
      {
        clientId: "synthetic",
        clientName: '<script>alert("x")</script>',
        clientDomain: "<img src=x onerror=x>",
        redirectHost: 'evil"><script>',
        redirectUri: "https://client.example",
        scope: [MCP_SCOPE],
        redirectIsLoopback: false,
        logoUri: "https://evil.example/track",
      },
      "a".repeat(43),
      userId,
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("https://evil.example/track");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain(userId);
  });
  it("rejects oversized, duplicate and unknown consent form fields before trusting values", async () => {
    const request = (body: string) =>
      new Request(ORIGIN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
    expect(await readMcpConsentForm(request(`handle=${"a".repeat(43)}&decision=approve`))).toEqual({
      handle: "a".repeat(43),
      decision: "approve",
    });
    for (const body of [
      "handle=a&decision=approve&userId=other",
      "handle=a&handle=b&decision=approve",
      "handle=a&decision=approve&decision=deny",
      "x".repeat(4_097),
    ])
      expect(await readMcpConsentForm(request(body))).toBeNull();
  });
});
