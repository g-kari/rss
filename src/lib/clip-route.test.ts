// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  userId: null as string | null,
  authenticate: vi.fn(),
  persist: vi.fn(),
  revokeCache: vi.fn(),
  readSaved: vi.fn(),
  get: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({
    env: { RSS_DATA: { get: state.get }, RATE_LIMIT: {} },
    ctx: {},
  }),
}));
vi.mock("./dev-auth-bypass", () => ({ getDevBypassUserId: () => state.userId }));
vi.mock("./clip-token", () => ({ authenticateClipToken: state.authenticate }));
vi.mock("./rate-limit", () => ({
  checkAndUpdateCooldown: async () => null,
  checkSlidingWindow: async () => null,
}));
vi.mock("./clip-storage", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  persistClip: state.persist,
  readSavedClip: state.readSaved,
}));
vi.mock("./cache-helper", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  deleteCfCache: state.revokeCache,
  matchCfCache: async () => new Response(JSON.stringify({ content: "shared" })),
}));
import { POST, OPTIONS } from "../../app/api/clip/route";
import { GET as GET_CONTENT } from "../../app/api/content/route";
import { GET as GET_IMAGE } from "../../app/api/clip/images/[id]/route";
const imageId = "a".repeat(64);
function request(token?: string, origin?: string) {
  const body = new FormData();
  body.append("html", new Blob(["<article>test</article>"], { type: "text/html" }), "page.html");
  body.append("url", "https://example.com/article");
  return new Request("https://reader.example/api/clip", {
    method: "POST",
    body,
    headers: { ...(token ? { Authorization: token } : {}), ...(origin ? { Origin: origin } : {}) },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_BASE_URL", "https://reader.example");
  vi.stubEnv("BETA_ALLOWED_SUBS", "");
  state.userId = null;
  state.authenticate.mockResolvedValue({ userId: "owner" });
  state.persist.mockResolvedValue({ created: true, article: { id: "article" } });
  state.revokeCache.mockResolvedValue(true);
  state.readSaved.mockResolvedValue(null);
  state.get.mockResolvedValue(null);
});
describe("SingleFile API authorization and persistence", () => {
  it("accepts multipart from the extension using a verified upload token", async () => {
    const response = await POST(request("Bearer synthetic-token", "chrome-extension://singlefile"));
    expect(response.status).toBe(201);
    expect(state.persist.mock.calls[0][1]).toBe("owner");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("does not fall back to a valid cookie when the bearer is invalid", async () => {
    state.userId = "cookie-user";
    state.authenticate.mockResolvedValue(null);
    expect((await POST(request("Bearer invalid", "https://reader.example"))).status).toBe(401);
    expect(state.persist).not.toHaveBeenCalled();
  });
  it("preserves same-origin CSRF for cookie-only uploads", async () => {
    state.userId = "cookie-user";
    expect((await POST(request(undefined, "chrome-extension://singlefile"))).status).toBe(403);
    expect((await POST(request(undefined, "https://reader.example"))).status).toBe(201);
  });
  it("does not accept bearer credentials for private body/image reads", async () => {
    const headers = { Authorization: "Bearer synthetic-token" };
    expect(
      (
        await GET_CONTENT(
          new Request("https://reader.example/api/content?url=https://example.com/article", {
            headers,
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await GET_IMAGE(
          new Request(`https://reader.example/api/clip/images/${imageId}`, { headers }),
          { params: Promise.resolve({ id: imageId }) },
        )
      ).status,
    ).toBe(401);
    expect(state.readSaved).not.toHaveBeenCalled();
    expect(state.get).not.toHaveBeenCalled();
  });
  it("returns durable private content before the shared cache", async () => {
    state.userId = "owner";
    state.readSaved.mockResolvedValue({ content: "my archived body" });
    const response = await GET_CONTENT(
      new Request("https://reader.example/api/content?url=https://example.com/article"),
    );
    expect(await response.json()).toEqual({ content: "my archived body" });
    expect(state.readSaved.mock.calls[0][1]).toBe("owner");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("reads images only from the current user's namespace", async () => {
    state.userId = "owner";
    state.get.mockResolvedValue({
      body: new Uint8Array([137, 80, 78, 71]),
      httpMetadata: { contentType: "image/png" },
    });
    const response = await GET_IMAGE(
      new Request(`https://reader.example/api/clip/images/${imageId}`),
      { params: Promise.resolve({ id: imageId }) },
    );
    expect(response.status).toBe(200);
    expect(state.get).toHaveBeenCalledWith(`users/owner/clip-images/${imageId}`);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("never emits uploaded HTML, token or storage error text after a failed write", async () => {
    state.persist.mockRejectedValue(new Error("sensitive internal storage details"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(request("Bearer synthetic-token"));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("sensitive");
    expect(JSON.stringify(log.mock.calls)).not.toContain("sensitive");
    log.mockRestore();
  });
  it("preflight allows only uploads without credentialed CORS", async () => {
    const response = await OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });
});
