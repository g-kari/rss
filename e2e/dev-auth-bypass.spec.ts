import { test, expect } from "@playwright/test";

test.describe("dev 認証バイパス（DEV_AUTH_BYPASS_USER_ID 設定時）", () => {
  test("/api/auth/me が fakeProfile を返す", async ({ request }) => {
    const res = await request.get("/api/auth/me");
    expect(res.status()).toBe(200);
    const data = (await res.json()) as { user: { id: string; sub: string; email: string } | null };
    expect(data.user).not.toBeNull();
    expect(data.user?.id).toBe("e2e-test-user");
    expect(data.user?.sub).toBe("e2e-test-user");
    expect(data.user?.email).toBe("e2e@test.local");
  });

  test("起動直後の `/` で data-popup-open=false（リサイザー操作可）", async ({ page }) => {
    await page.goto("/");
    const root = page.locator('[data-layout="root"]');
    await expect(root).toBeVisible();
    await expect(root).toHaveAttribute("data-popup-open", "false");
  });
});
