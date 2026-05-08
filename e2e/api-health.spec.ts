import { test, expect } from "@playwright/test";

/**
 * API エンドポイントの基本動作確認
 * 認証不要なエンドポイントのみ対象
 */
test.describe("API ヘルスチェック", () => {
  // 401 を期待するテストは dev 認証バイパス有効時はバイパスにより 200/その他になるためスキップ
  const skipWhenBypass = !!process.env.DEV_AUTH_BYPASS_USER_ID;

  test("GET /api/health が 200 を返す", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test("GET /api/auth/me が未認証時に user: null を返す", async ({ request }) => {
    test.skip(skipWhenBypass, "DEV_AUTH_BYPASS_USER_ID 設定時はバイパスでユーザーが返る");
    // /api/auth/me は未認証でも 200 + { user: null } を返す仕様
    const res = await request.get("/api/auth/me");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { user: null };
    expect(body.user).toBeNull();
  });

  test("GET /api/feeds が未認証時に 401 を返す", async ({ request }) => {
    test.skip(skipWhenBypass, "DEV_AUTH_BYPASS_USER_ID 設定時は認証バイパス済み");
    const res = await request.get("/api/feeds");
    expect(res.status()).toBe(401);
  });

  test("GET /api/articles が未認証時に 401 を返す", async ({ request }) => {
    test.skip(skipWhenBypass, "DEV_AUTH_BYPASS_USER_ID 設定時は認証バイパス済み");
    const res = await request.get("/api/articles");
    expect(res.status()).toBe(401);
  });

  test("GET /api/content が未認証時に 401 を返す", async ({ request }) => {
    test.skip(skipWhenBypass, "DEV_AUTH_BYPASS_USER_ID 設定時は認証バイパス済み");
    const res = await request.get("/api/content?url=https://example.com");
    expect(res.status()).toBe(401);
  });

  test("GET /api/feed-groups が未認証時に 401 を返す", async ({ request }) => {
    test.skip(skipWhenBypass, "DEV_AUTH_BYPASS_USER_ID 設定時は認証バイパス済み");
    const res = await request.get("/api/feed-groups");
    expect(res.status()).toBe(401);
  });

  test("POST /api/feed-groups が未認証時に 401 を返す", async ({ request }) => {
    test.skip(skipWhenBypass, "DEV_AUTH_BYPASS_USER_ID 設定時は認証バイパス済み");
    const res = await request.post("/api/feed-groups", {
      headers: { Origin: "http://localhost:3000" },
      data: { name: "Tech" },
    });
    expect(res.status()).toBe(401);
  });

  test("PATCH /api/feed-groups/:id が未認証時に 401 を返す", async ({ request }) => {
    test.skip(skipWhenBypass, "DEV_AUTH_BYPASS_USER_ID 設定時は認証バイパス済み");
    const res = await request.patch("/api/feed-groups/dummy-id", {
      headers: { Origin: "http://localhost:3000" },
      data: { name: "Renamed" },
    });
    expect(res.status()).toBe(401);
  });

  test("DELETE /api/feed-groups/:id が未認証時に 401 を返す", async ({ request }) => {
    test.skip(skipWhenBypass, "DEV_AUTH_BYPASS_USER_ID 設定時は認証バイパス済み");
    const res = await request.delete("/api/feed-groups/dummy-id", {
      headers: { Origin: "http://localhost:3000" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/feed-groups が別オリジンからは 403 を返す（CSRF 対策）", async ({ request }) => {
    const res = await request.post("/api/feed-groups", {
      headers: { Origin: "https://evil.example" },
      data: { name: "Tech" },
    });
    expect(res.status()).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("CSRF_ORIGIN_MISMATCH");
  });

  test("POST /api/feed-groups が Origin/Referer なしでは 403 を返す（CSRF 対策）", async ({
    request,
  }) => {
    // playwright の APIRequestContext は Origin を自動付与しないため、ヘッダー無しのケースを検証
    const res = await request.fetch("/api/feed-groups", {
      method: "POST",
      data: { name: "Tech" },
    });
    expect(res.status()).toBe(403);
  });
});
