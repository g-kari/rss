import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Component-browser integration needs neither credentials, Workers bindings nor notification access.
let html = "";
test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [{ outputFiles }, css] = await Promise.all([
    build({
      entryPoints: [resolve(root, "e2e/fixtures/recommendation-settings.tsx")],
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
  html = `<!doctype html><html lang="ja"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css.css}</style><style>body{font-family:system-ui,sans-serif}</style><div id="root"></div><script>${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></html>`;
});
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test.describe(`${viewport.width}px おすすめ通知`, () => {
    test.use({ viewport });
    test.beforeEach(async ({ page }) => {
      await page.route("https://rss-preview.test/**", (route) =>
        route.fulfill({ contentType: "text/html", body: html }),
      );
      await page.goto("https://rss-preview.test/");
    });
    test("読み込み中は無効で、30分刻みの時刻とオプトインをキーボード操作できる", async ({
      page,
    }, testInfo) => {
      const toggle = page.getByRole("switch");
      const time = page.getByRole("combobox");
      await expect(toggle).toBeDisabled();
      await expect(time).toBeDisabled();
      await page.getByRole("button", { name: "設定を読み込む", exact: true }).click();
      await expect(toggle).toBeEnabled();
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await expect(time.locator("option")).toHaveCount(48);
      expect(
        await time
          .locator("option")
          .evaluateAll((options) =>
            options.every((option) =>
              /^(?:[01]\d|2[0-3]):(?:00|30)$/.test((option as HTMLOptionElement).value),
            ),
          ),
      ).toBe(true);
      await toggle.focus();
      await page.keyboard.press("Space");
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      await expect(toggle).toBeEnabled();
      await time.focus();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect(time).toHaveValue("09:30");
      await expect(time).toBeEnabled();
      await expect(page.getByRole("status")).toHaveText("おすすめ通知の設定を保存しました");
      const requests = await page.evaluate(() => window.recommendationRequests);
      expect(requests).toHaveLength(2);
      expect(requests[0]).toMatchObject({
        recommendationEnabled: true,
        recommendationTime: "09:00",
        timezone: "Asia/Tokyo",
        recommendationDismissals: [],
      });
      expect(requests[1]).toMatchObject({
        recommendationEnabled: true,
        recommendationTime: "09:30",
        timezone: "Asia/Tokyo",
      });
      const dialog = page.getByRole("dialog");
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({ path: testInfo.outputPath("recommendation-settings-light.png") });
      await page.evaluate(() => {
        document.documentElement.dataset.theme = "dark";
      });
      await page.screenshot({ path: testInfo.outputPath("recommendation-settings-dark.png") });
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
    });
    test("読み込み失敗中は無効で、保存失敗は切替と時刻を元に戻す", async ({ page }) => {
      await page.getByRole("button", { name: "読み込み失敗を再現" }).click();
      await expect(page.getByRole("switch")).toBeDisabled();
      await expect(page.getByRole("combobox")).toBeDisabled();
      await page.getByRole("button", { name: "設定を読み込む", exact: true }).click();
      await page.getByRole("button", { name: "保存失敗を再現" }).click();
      await page.getByRole("switch").click();
      await expect(page.getByRole("status")).toHaveText("おすすめ通知の設定を保存できませんでした");
      await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "false");
      await page.getByRole("combobox").selectOption("20:30");
      await expect(page.getByRole("combobox")).toHaveValue("09:00");
    });
  });
}
