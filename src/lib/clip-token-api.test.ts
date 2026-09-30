// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateClipToken, type ClipTokenMetadata } from "./clip-token";

const mock = vi.hoisted(() => ({
  userId: null as string | null,
  bucket: {} as R2Bucket,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) =>
      key === "access_token" && mock.userId ? { value: "synthetic-session" } : undefined,
  }),
}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { RSS_DATA: mock.bucket }, ctx: {} }),
}));
vi.mock("./auth", () => ({
  verifyJwt: async () => (mock.userId ? { sub: mock.userId } : null),
  refreshTokens: async () => ({ kind: "invalid" }),
  getJwtExp: () => null,
}));
vi.mock("./dev-auth-bypass", () => ({ getDevBypassUserId: () => null }));

import { DELETE, GET, POST } from "../../app/api/clip/token/route";

const ORIGIN = "https://rss.example";
const USER = "synthetic-user";
let store: Map<string, { body: string; etag: string }>;
let put: ReturnType<typeof vi.fn>;
let get: ReturnType<typeof vi.fn>;

function request(method: string, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/clip/token`, {
    method,
    headers: { Origin: ORIGIN, ...headers },
  });
}

async function issuedToken(response: Response) {
  return (await response.json()) as ClipTokenMetadata & { token: string };
}

beforeEach(() => {
  vi.stubEnv("APP_BASE_URL", ORIGIN);
  vi.stubEnv("BETA_ALLOWED_SUBS", "");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  mock.userId = USER;
  store = new Map();
  let sequence = 0;
  get = vi.fn(async (key: string) => {
    const entry = store.get(key);
    return entry
      ? { etag: entry.etag, size: entry.body.length, json: async () => JSON.parse(entry.body) }
      : null;
  });
  put = vi.fn(async (key: string, body: string, options?: R2PutOptions) => {
    const condition = options?.onlyIf;
    if (condition instanceof Headers) {
      if (condition.get("If-None-Match") === "*" && store.has(key)) return null;
    } else if (condition?.etagMatches && store.get(key)?.etag !== condition.etagMatches) {
      return null;
    }
    const etag = String(++sequence);
    store.set(key, { body, etag });
    return { etag };
  });
  mock.bucket = {
    get,
    put,
    delete: async (key: string) => {
      store.delete(key);
    },
  } as unknown as R2Bucket;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("SingleFile token management with actual session/CSRF guards", () => {
  it("does not create a token through GET, then exposes the raw token only on explicit POST", async () => {
    const empty = await GET(request("GET"));
    expect(await empty.json()).toEqual({ token: null });
    expect(put).not.toHaveBeenCalled();
    const issued = await POST(request("POST"));
    expect(issued.status).toBe(201);
    expect(issued.headers.get("Cache-Control")).toBe("no-store");
    const created = await issuedToken(issued);
    expect(created.token).toMatch(/^clip_v1\.[0-9a-f]{32}\.[0-9a-f]{64}$/);
    const read = await GET(request("GET"));
    expect(await read.json()).toEqual({
      token: { id: created.id, createdAt: created.createdAt, expiresAt: created.expiresAt },
    });
    expect(read.headers.get("Cache-Control")).toBe("no-store");
    const revoked = await DELETE(request("DELETE"));
    expect(await revoked.json()).toEqual({ ok: true });
    expect(revoked.headers.get("Cache-Control")).toBe("no-store");
    expect(await authenticateClipToken(mock.bucket, `Bearer ${created.token}`)).toBeNull();
    expect(await (await GET(request("GET"))).json()).toEqual({ token: null });
  });

  it.each([
    ["GET", GET],
    ["POST", POST],
    ["DELETE", DELETE],
  ] as const)(
    "requires a browser session for %s even with a valid scoped bearer",
    async (method, handler) => {
      const created = await issuedToken(await POST(request("POST")));
      put.mockClear();
      get.mockClear();
      mock.userId = null;
      const response = await handler(request(method, { Authorization: `Bearer ${created.token}` }));
      expect(response.status).toBe(401);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(put).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
    },
  );

  it.each(["POST", "DELETE"])("keeps same-origin CSRF protection for %s", async (method) => {
    for (const origin of [
      undefined,
      "https://evil.example",
      "chrome-extension://singlefile",
      "null",
    ]) {
      const req = request(method);
      if (origin === undefined) req.headers.delete("Origin");
      else req.headers.set("Origin", origin);
      const response = await (method === "POST" ? POST(req) : DELETE(req));
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "CSRF_ORIGIN_MISMATCH" });
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(put).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it("binds token management to the authenticated account and rejects stale UI requests", async () => {
    const created = await issuedToken(await POST(request("POST", { "X-RSS-Account-Id": USER })));
    put.mockClear();
    for (const [method, handler] of [
      ["GET", GET],
      ["POST", POST],
      ["DELETE", DELETE],
    ] as const) {
      const response = await handler(request(method, { "X-RSS-Account-Id": "old-account" }));
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: "ACCOUNT_CHANGED" });
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(put).not.toHaveBeenCalled();
    mock.userId = "another-account";
    expect(await (await GET(request("GET"))).json()).toEqual({ token: null });
    await DELETE(request("DELETE"));
    expect(await authenticateClipToken(mock.bucket, `Bearer ${created.token}`)).toEqual({
      userId: USER,
    });
  });

  it("does not accept ownership, scope or expiry from the POST body or query string", async () => {
    const response = await POST(
      new Request(`${ORIGIN}/api/clip/token?userId=victim`, {
        method: "POST",
        headers: { Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "victim", scope: "admin", expiresAt: "2099-01-01" }),
      }),
    );
    expect(response.status).toBe(201);
    const created = await issuedToken(response);
    expect(await authenticateClipToken(mock.bucket, `Bearer ${created.token}`)).toEqual({
      userId: USER,
    });
    expect(store.has("users/victim/clip-token.json")).toBe(false);
  });

  it("accepts the displayed profile id when it differs from the OAuth subject", async () => {
    store.set(`users/${USER}/profile.json`, {
      body: JSON.stringify({ id: "displayed-profile-id" }),
      etag: "synthetic-profile-etag",
    });
    const response = await POST(request("POST", { "X-RSS-Account-Id": "displayed-profile-id" }));
    expect(response.status).toBe(201);
    const created = await issuedToken(response);
    expect(await authenticateClipToken(mock.bucket, `Bearer ${created.token}`)).toEqual({
      userId: USER,
    });
    expect((await GET(request("GET", { "X-RSS-Account-Id": USER }))).status).toBe(409);
  });

  it("cannot rotate or revoke a token when the current session user loses beta access", async () => {
    const created = await issuedToken(await POST(request("POST")));
    vi.stubEnv("BETA_ALLOWED_SUBS", "another-user");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    put.mockClear();
    expect((await POST(request("POST"))).status).toBe(401);
    expect((await DELETE(request("DELETE"))).status).toBe(401);
    expect(put).not.toHaveBeenCalled();
    vi.stubEnv("BETA_ALLOWED_SUBS", "");
    expect(await authenticateClipToken(mock.bucket, `Bearer ${created.token}`)).toEqual({
      userId: USER,
    });
  });

  it("returns a retriable conflict on concurrent mutation", async () => {
    put.mockResolvedValueOnce(null);
    const response = await POST(request("POST"));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "CLIP_TOKEN_CONFLICT" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns an uncached operational error without echoing or logging storage error details", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    get.mockRejectedValue(new Error("synthetic-private-storage-detail"));
    for (const [method, handler] of [
      ["GET", GET],
      ["POST", POST],
      ["DELETE", DELETE],
    ] as const) {
      const response = await handler(request(method));
      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      const body = await response.text();
      expect(body).not.toContain("synthetic-private-storage-detail");
      expect(body).not.toContain("clip_v1");
    }
    expect(errorLog).not.toHaveBeenCalled();
  });
});
