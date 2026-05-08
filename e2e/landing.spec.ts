import { test, expect } from "@playwright/test";

/**
 * 未ログイン時のランディングページ
 * 認証不要で検証できるため E2E の基礎テストとして使用
 */
test.describe("ランディングページ", () => {
  // dev 認証バイパス有効時はログイン済み扱いになりランディングページが表示されないためスキップ
  test.skip(
    !!process.env.DEV_AUTH_BYPASS_USER_ID,
    "DEV_AUTH_BYPASS_USER_ID 設定時はランディングページが表示されないためスキップ",
  );

  test("タイトルと主要要素が表示される", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/RSS Reader/);
    await expect(page.getByText("シンプルな")).toBeVisible();
    await expect(page.getByText("RSSリーダー").or(page.getByText("RSS リーダー"))).toBeVisible();
  });

  test("ログインボタンが存在し /api/auth/login に遷移する", async ({ page }) => {
    await page.goto("/");
    const loginBtn = page.getByRole("link", { name: /ログイン/ }).first();
    await expect(loginBtn).toBeVisible();
    await expect(loginBtn).toHaveAttribute("href", "/api/auth/login");
  });

  test("機能カード（テーマ・レイアウト・AI）が表示される", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("テーマ", { exact: true })).toBeVisible();
    await expect(page.getByText("レイアウト", { exact: true })).toBeVisible();
    await expect(page.getByText("AI 機能", { exact: true })).toBeVisible();
  });

  test("OGP メタタグが正しく設定されている", async ({ page }) => {
    await page.goto("/");
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute("content", "RSS Reader");
    const ogImage = page.locator('meta[property="og:image"]');
    await expect(ogImage).toHaveAttribute("content", /\/og\.png/);
    const twitterCard = page.locator('meta[name="twitter:card"]');
    await expect(twitterCard).toHaveAttribute("content", "summary_large_image");
    const twitterImage = page.locator('meta[name="twitter:image"]');
    await expect(twitterImage).toHaveAttribute("content", /\/og\.png/);
  });
});
