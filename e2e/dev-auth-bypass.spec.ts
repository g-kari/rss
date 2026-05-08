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

  // Issue #609: data-popup-open がポップアップ open に追従して true へ遷移するか検証する。
  // ConfirmModal の常時マウント＋引数なし usePopupLock デグレ (#606) を実 DOM で検出するため。
  test("`?` キーでヘルプモーダルを開くと data-popup-open=true、閉じると false に戻る", async ({
    page,
  }) => {
    await page.goto("/");
    const root = page.locator('[data-layout="root"]');
    await expect(root).toHaveAttribute("data-popup-open", "false");

    // Shift+/ で `?` を入力し useUIState のキーバインド (e.key === "?") を発火
    await page.keyboard.press("Shift+Slash");
    await expect(root).toHaveAttribute("data-popup-open", "true");

    // ESC で閉じる
    await page.keyboard.press("Escape");
    await expect(root).toHaveAttribute("data-popup-open", "false");
  });
});
