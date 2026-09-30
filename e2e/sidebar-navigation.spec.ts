import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Exercise real React components and the production stylesheet in Chromium,
// independently of Next's network-fetched fonts and Cloudflare bindings.
let html = "";
test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [{ outputFiles }, css] = await Promise.all([
    build({
      entryPoints: [resolve(root, "e2e/fixtures/sidebar-navigation.tsx")],
      absWorkingDir: root,
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"test"' },
    }),
    postcss([tailwind({ base: root })]).process(
      await readFile(resolve(root, "app/globals.css"), "utf8"),
      { from: resolve(root, "app/globals.css") },
    ),
  ]);
  html = `<!doctype html><html lang="ja"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css.css}</style><style>body{font-family:system-ui,sans-serif}.preview-grid{height:100dvh;display:grid;grid-template-columns:200px minmax(0,1fr)}@media(max-width:640px){.preview-grid{grid-template-columns:1fr}.preview-articles{display:none}}</style><div id="root"></div><script>${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></html>`;
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test.describe(`${viewport.width}px サイドバー`, () => {
    test.use({ viewport });
    test.beforeEach(async ({ page }) => {
      await page.setContent(html);
    });

    test("主要導線とメニューが画面内に収まり、スクロールとキーボードで全操作へ到達できる", async ({
      page,
    }, testInfo) => {
      await expect(page.getByRole("button", { name: "フィードを追加", exact: true })).toBeVisible();
      await expect(
        page.getByRole("textbox", { name: "フィードを検索", exact: true }),
      ).toBeVisible();
      const trigger = page.getByRole("button", { name: "その他のメニュー", exact: true });
      await expect(trigger).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath("sidebar-light.png") });
      await trigger.click();
      const menu = page.getByRole("menu", { name: "その他のメニュー", exact: true });
      await expect(menu.getByRole("menuitem", { name: "読書統計", exact: true })).toBeFocused();
      const box = await menu.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      await page.screenshot({ path: testInfo.outputPath("menu-light.png") });
      await page.keyboard.press("End");
      await expect(menu.getByRole("menuitem", { name: "ログアウト", exact: true })).toBeFocused();
      await expect(
        menu.getByRole("menuitem", { name: "ログアウト", exact: true }),
      ).toBeInViewport();
      await page.keyboard.press("Escape");
      await expect(menu).not.toBeVisible();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await page.getByRole("menuitem", { name: "ダークモードに切替", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await page.screenshot({ path: testInfo.outputPath("sidebar-dark.png") });
      await trigger.click();
      await page.screenshot({ path: testInfo.outputPath("menu-dark.png") });
      await page.keyboard.press("Escape");
    });

    test("モーダルを閉じた後も、通知切替中もキーボード操作が途切れない", async ({ page }) => {
      const trigger = page.getByRole("button", { name: "その他のメニュー", exact: true });
      await trigger.click();
      await page.getByRole("menuitem", { name: "読書統計", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "読書統計" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await trigger.click();
      const toggle = page.getByRole("menuitemcheckbox", { name: "プッシュ通知", exact: true });
      await toggle.focus();
      await toggle.press("Enter");
      await expect(toggle).toBeFocused();
      await expect(page.getByRole("menu").getByRole("status")).toHaveText("通知の許可が必要です");
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
    });
  });
}

test("現在地の側線・未読ドット・タブの下線がlight/darkで独立する", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(html);
  for (const theme of ["light", "dark"]) {
    const current = page.getByRole("article").first();
    await expect(current).toHaveAttribute("aria-current", "true");
    expect(
      await current.evaluate((el) => getComputedStyle(el, "::before").borderInlineStartWidth),
    ).toBe("3px");
    await expect(current.locator(".bg-accent-dot")).toHaveCount(0);
    await expect(page.getByRole("article").nth(1).locator(".bg-accent-dot")).toHaveCount(1);
    const tab = page.getByRole("tab", { name: "記事", exact: true });
    expect(await tab.evaluate((el) => getComputedStyle(el, "::before").borderBottomWidth)).toBe(
      "3px",
    );
    if (theme === "light") {
      await page.getByRole("button", { name: "その他のメニュー", exact: true }).click();
      await page.getByRole("menuitem", { name: "ダークモードに切替", exact: true }).click();
    }
  }
});
