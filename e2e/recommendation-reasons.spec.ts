import { test, expect, type Page } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

let html = "";
const diagnostics = new WeakMap<Page, { requests: string[]; errors: string[] }>();
test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [{ outputFiles }, css] = await Promise.all([
    build({
      entryPoints: [resolve(root, "e2e/fixtures/recommendation-reasons.tsx")],
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
  const result = { requests: [] as string[], errors: [] as string[] };
  diagnostics.set(page, result);
  page.on("pageerror", (error) => result.errors.push(error.message));
  await page.route("**/*", (route) => {
    const request = route.request();
    if (
      request.url() === "https://rss-preview.test/" &&
      request.method() === "GET" &&
      request.isNavigationRequest()
    )
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    if (
      request.url() === "https://rss-preview.test/api/push/config" &&
      request.method() === "GET" &&
      ["one", "two"].includes(request.headers()["x-rss-account-id"])
    )
      return route.fulfill({
        json: { recommendationEnabled: false, recommendationDismissals: [] },
      });
    result.requests.push(`${request.method()} ${request.url()}`);
    return route.abort();
  });
  await page.goto("https://rss-preview.test/");
});
test.afterEach(({ page }) => {
  expect(diagnostics.get(page)?.requests).toEqual([]);
  expect(diagnostics.get(page)?.errors).toEqual([]);
});

for (const width of [320, 390, 1280])
  for (const theme of ["light", "dark"]) {
    test.describe(`${width}px ${theme} reasons`, () => {
      test.use({
        viewport: { width, height: width === 320 ? 568 : 844 },
        contextOptions: { reducedMotion: "reduce" },
      });
      test.beforeEach(async ({ page }) => {
        await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
      });
      test("truthful reasons, more/less, undo, persistence, account isolation and empty reset", async ({
        page,
      }, testInfo) => {
        const region = page.getByRole("region", { name: "いま読むおすすめ" });
        const reads = region.getByRole("button", { name: /を読む$/ });
        await expect(reads.first()).toHaveAttribute("aria-label", "合成記事 aを読む");
        await region.getByRole("button", { name: "Unityの新しい記事をおすすめした理由" }).click();
        const dialog = page.getByRole("dialog", { name: "この記事をおすすめした理由" });
        await expect(dialog).toContainText("一致する閲覧・保存・いいねのカテゴリなし");
        await expect(dialog).toContainText("AIで推測していません");
        expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true,
        );
        await dialog.getByRole("button", { name: "Unityの話題を増やす" }).click();
        await expect(reads.first()).toHaveAttribute("aria-label", "Unityの新しい記事を読む");
        await expect(dialog.getByRole("button", { name: "Unityの話題を増やす" })).toHaveAttribute(
          "aria-pressed",
          "true",
        );
        await page.screenshot({ path: testInfo.outputPath("reasons-more.png") });
        await dialog.getByRole("button", { name: "Unityの話題を減らす" }).click();
        await expect(reads.filter({ hasText: "Unityの新しい記事" })).toHaveCount(0);
        await expect(dialog).toBeVisible();
        const undo = dialog.getByRole("button", { name: "話題の調整を元に戻す" });
        await undo.focus();
        await page.keyboard.press("Enter");
        expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
          true,
        );
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await region.getByRole("button", { name: "Unityの新しい記事をおすすめした理由" }).click();
        const standard = dialog.getByRole("button", { name: "Unityの調整を解除" });
        await standard.focus();
        await page.keyboard.press("Enter");
        await expect(standard).toBeFocused();
        await expect(standard).toHaveAttribute("aria-disabled", "true");
        await expect(reads.first()).toHaveAttribute("aria-label", "合成記事 aを読む");
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await region.getByRole("button", { name: "Unityの新しい記事をおすすめした理由" }).click();
        await dialog.getByRole("button", { name: "Unityの話題を増やす" }).click();
        await expect(reads.first()).toHaveAttribute("aria-label", "Unityの新しい記事を読む");
        await dialog.getByRole("button", { name: "閉じる" }).focus();
        await page.keyboard.press("Shift+Tab");
        expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
          true,
        );
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(region.getByRole("button", { name: "おすすめを折りたたむ" })).toBeFocused();
        await page.reload();
        await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
        await expect(reads.first()).toHaveAttribute("aria-label", "Unityの新しい記事を読む");
        await page.getByRole("combobox", { name: "合成アカウント" }).selectOption("two");
        await expect(reads.first()).toHaveAttribute("aria-label", "合成記事 aを読む");
        await page.getByRole("combobox", { name: "合成アカウント" }).selectOption("one");
        await page.getByRole("combobox", { name: "合成フィルター" }).selectOption("without-unity");
        await expect(reads.filter({ hasText: "Unityの新しい記事" })).toHaveCount(0);
        await page.getByRole("combobox", { name: "合成フィルター" }).selectOption("empty");
        await region.getByText("選び方・おすすめの調整", { exact: true }).click();
        await region.getByRole("button", { name: "話題の調整をすべてリセット" }).click();
        await expect(region.getByRole("group", { name: "Unityのおすすめ調整" })).toHaveCount(0);
        await region.getByRole("button", { name: "話題の調整を元に戻す" }).click();
        await expect(region.getByRole("group", { name: "Unityのおすすめ調整" })).toBeVisible();
        await expect(page.getByTestId("mutations")).toHaveText("選択0 既読0 保存0");
        await page.screenshot({ path: testInfo.outputPath("empty-reset-undo.png") });
      });
      test("immersive keeps the current card and playback state while nested reason choices change", async ({
        page,
      }, testInfo) => {
        const region = page.getByRole("region", { name: "いま読むおすすめ" });
        const modes = region.locator("summary").filter({ hasText: "読み方" });
        await modes.click();
        await region.getByRole("button", { name: "ドパガキモード", exact: true }).click();
        const immersive = page.getByRole("dialog", { name: "ドパガキモード" });
        await expect(modes.locator("..")).toHaveJSProperty("open", false);
        await expect(immersive.getByRole("heading", { name: "合成記事 a" })).toBeVisible();
        const pause = immersive.getByRole("button", { name: "自動再生を再開" });
        await expect(pause).toBeVisible();
        const trigger = immersive.getByRole("button", { name: "おすすめ理由", exact: true });
        await trigger.click();
        const dialog = page.getByRole("dialog", { name: "この記事をおすすめした理由" });
        await dialog.getByRole("button", { name: "Topic aの話題を減らす" }).click();
        await expect(immersive).toHaveAttribute("aria-modal", "false");
        await expect(immersive.getByRole("heading", { name: "合成記事 a" })).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath("immersive-reasons.png") });
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await expect(pause).toBeVisible();
        await expect(immersive).toHaveAttribute("aria-modal", "true");
        await immersive.getByRole("button", { name: "一覧に戻る" }).click();
        await expect(modes).toBeFocused();
        expect(await page.getByTestId("mutations").textContent()).toMatch(/選択0 既読[01] 保存0/);
      });
    });
  }
