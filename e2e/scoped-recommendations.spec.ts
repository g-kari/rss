import { test, expect, type Page } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

let html = "";
const diagnostics = new WeakMap<
  Page,
  { requests: string[]; errors: string[]; configReads: number }
>();
test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [{ outputFiles }, css] = await Promise.all([
    build({
      entryPoints: [resolve(root, "e2e/fixtures/scoped-recommendations.tsx")],
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
  html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><style>${css.css}</style><style>body{font-family:system-ui,sans-serif;margin:0}</style><div id="root"></div><script>${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></html>`;
});

test.beforeEach(async ({ page }) => {
  const requests: string[] = [];
  const errors: string[] = [];
  const result = { requests, errors, configReads: 0 };
  diagnostics.set(page, result);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    if (
      route.request().url() === "https://rss-preview.test/" &&
      route.request().method() === "GET" &&
      route.request().isNavigationRequest()
    )
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    // Existing dismissal hook reads opt-in state on mount; never enable sync in this fixture.
    if (
      route.request().url() === "https://rss-preview.test/api/push/config" &&
      route.request().method() === "GET" &&
      !route.request().isNavigationRequest() &&
      route.request().headers()["x-rss-account-id"] === "list-test"
    ) {
      result.configReads++;
      return route.fulfill({
        json: { recommendationEnabled: false, recommendationDismissals: [] },
      });
    }
    requests.push(`${route.request().method()} ${route.request().url()}`);
    return route.abort();
  });
  await page.goto("https://rss-preview.test/");
  await expect(page.getByRole("button", { name: "ドパガキモード", exact: true })).toBeVisible();
});

test.afterEach(({ page }) => {
  const result = diagnostics.get(page);
  expect(result?.requests).toEqual([]);
  expect(result?.errors).toEqual([]);
  expect(result?.configReads).toBeGreaterThanOrEqual(1);
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test.describe(`${viewport.width}px scoped recommendations`, () => {
    test.use({ viewport, contextOptions: { reducedMotion: "reduce" } });
    test("retains persisted filters, scope and discoverable empty/loading/error states", async ({
      page,
    }, testInfo) => {
      const recommendations = page.getByRole("region", { name: "いま読むおすすめ" });
      const entry = page.getByRole("button", { name: "ドパガキモード", exact: true });
      await expect(recommendations.getByRole("button", { name: /を読む$/ })).toHaveCount(1);
      await expect(recommendations.getByText("保存されていない選択記事")).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath("filtered-entry.png") });
      await entry.click();
      const dialog = page.getByRole("dialog", { name: "ドパガキモード" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("heading", { name: "条件に合う記事" })).toBeVisible();
      await expect(dialog.locator(".immersive-slide")).toHaveCount(1);
      expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("filtered-immersive.png") });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(entry).toBeFocused();
      await expect(
        page.getByRole("button", { name: "ブックマークフィルター切替 (B)" }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.getByRole("button", { name: "リーディングリストフィルター切替 (T)" }),
      ).toHaveAttribute("aria-pressed", "true");

      const search = page.getByRole("combobox", { name: "検索" });
      await search.fill("missing-result");
      await expect(entry).toBeDisabled();
      await expect(entry).toBeEnabled();
      await expect(
        recommendations.getByText("現在のフィルターに合う未読のおすすめ記事はありません"),
      ).toBeVisible();
      await entry.click();
      await expect(dialog).toBeVisible();
      await expect(dialog.locator(".immersive-slide")).toHaveCount(0);
      await dialog.getByRole("button", { name: "一覧に戻る" }).click();

      await page.getByRole("button", { name: "読み込み状態", exact: true }).click();
      await expect(entry).toBeDisabled();
      await expect(recommendations.getByText(/記事を読み込み中/)).toBeVisible();
      await page.getByRole("button", { name: "読み込み状態", exact: true }).click();
      await page.getByRole("button", { name: "エラー状態", exact: true }).click();
      await expect(entry).toBeDisabled();
      await expect(recommendations.getByText(/記事を読み込めませんでした/)).toBeVisible();
      await page.getByRole("button", { name: "エラー状態", exact: true }).click();
      await expect(entry).toBeEnabled();
      await expect(dialog).toHaveCount(0);
      await search.fill("");
      await expect(recommendations.getByRole("button", { name: /を読む$/ })).toHaveCount(1);
      await page.getByRole("button", { name: "フィードを切り替える" }).click();
      await expect(recommendations.getByRole("button", { name: /を読む$/ })).toHaveCount(0);
      await expect(entry).toBeEnabled();
      await expect(
        page.getByRole("button", { name: "ブックマークフィルター切替 (B)" }),
      ).toHaveAttribute("aria-pressed", "true");
    });

    test("shows only zero/one/two scoped candidates and keeps group/date/Digest constraints", async ({
      page,
    }, testInfo) => {
      const recommendations = page.getByRole("region", { name: "いま読むおすすめ" });
      const picks = recommendations.getByRole("button", { name: /を読む$/ });
      const entry = page.getByRole("button", { name: "ドパガキモード", exact: true });
      const dialog = page.getByRole("dialog", { name: "ドパガキモード" });
      for (const count of [0, 1, 2]) {
        await page.getByRole("combobox", { name: "合成候補数" }).selectOption(String(count));
        await expect(picks).toHaveCount(count);
        await expect(entry).toBeEnabled();
        await entry.click();
        await expect(dialog.locator(".immersive-slide")).toHaveCount(count);
        await page.keyboard.press("Escape");
        await expect(entry).toBeFocused();
      }
      await page.getByRole("combobox", { name: "合成スコープ" }).selectOption("group");
      await expect(picks).toHaveCount(2);
      await entry.click();
      await dialog.getByRole("button", { name: "一覧に戻る" }).click();
      await page.getByRole("combobox", { name: "合成スコープ" }).selectOption("empty-group");
      await expect(picks).toHaveCount(0);
      await expect(entry).toBeEnabled();
      await expect(recommendations.getByText(/現在のフィルターに合う未読/)).toBeVisible();
      await page.getByRole("combobox", { name: "合成スコープ" }).selectOption("feed");
      await expect(picks).toHaveCount(2);
      await page.getByRole("button", { name: /^日付フィルター切替:.*\(d\)$/ }).click();
      await expect(picks).toHaveCount(1);
      await expect(picks).toHaveAttribute("aria-label", "条件に合う記事を読む");
      await page.screenshot({ path: testInfo.outputPath("dated-scoped-entry.png") });

      // Cycle the real date control back to all before selecting the special feed.
      for (let index = 0; index < 4; index++)
        await page.getByRole("button", { name: /^日付フィルター切替:.*\(d\)$/ }).click();
      await page.getByRole("button", { name: "ブックマークフィルター切替 (B)" }).click();
      await page.getByRole("button", { name: "リーディングリストフィルター切替 (T)" }).click();
      await page.getByRole("combobox", { name: "合成スコープ" }).selectOption("digest");
      await expect(picks).toHaveCount(3);
      await entry.click();
      await expect(dialog.locator(".immersive-slide")).toHaveCount(3);
      await expect(
        dialog.getByRole("heading", { name: "ダイジェスト候補 3", exact: true }),
      ).toHaveCount(0);
      await expect(
        dialog.getByRole("heading", { name: "ダイジェスト候補 4", exact: true }),
      ).toHaveCount(0);
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      await page.screenshot({ path: testInfo.outputPath("digest-scoped-immersive.png") });
      await page.keyboard.press("Escape");
      await expect(entry).toBeFocused();
    });
  });
}
