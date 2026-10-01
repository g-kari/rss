import { test, expect, type Page } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const fixtureUrl = "https://rss-feed-status.test/";
const pushConfigUrl = `${fixtureUrl}api/push/config`;
let html = "";
const requests = new WeakMap<Page, { errors: string[]; pushReads: number }>();

test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [{ outputFiles }, css] = await Promise.all([
    build({
      entryPoints: [resolve(root, "e2e/fixtures/feed-retry-status.tsx")],
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
  html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>${css.css}</style><style>body{margin:0;font-family:system-ui}</style><div id="root"></div><script>${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></html>`;
});

test.beforeEach(async ({ page }) => {
  const state = { errors: [] as string[], pushReads: 0 };
  requests.set(page, state);
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.clock.install({ time: new Date("2026-10-01T12:00:00Z") });
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() === "GET" && request.frame() === page.mainFrame()) {
      if (
        request.url() === fixtureUrl &&
        request.isNavigationRequest() &&
        request.resourceType() === "document"
      ) {
        await route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
        return;
      }
      if (
        request.url() === pushConfigUrl &&
        !request.isNavigationRequest() &&
        request.resourceType() === "fetch"
      ) {
        state.pushReads++;
        await route.fulfill({ json: { disabledFeeds: {} } });
        return;
      }
    }
    state.errors.push(`unexpected ${request.method()} ${request.resourceType()} ${request.url()}`);
    await route.abort();
  });
});
test.afterEach(({ page }) => expect(requests.get(page)?.errors).toEqual([]));

for (const width of [1280, 390, 320]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test.describe(`${width}px ${colorScheme} feed retry status`, () => {
      test.use({ viewport: { width, height: 844 }, colorScheme });
      test("wraps actual detail copy, restores focus and clears recovery state without retry requests", async ({
        page,
      }, testInfo) => {
        await page.goto(fixtureUrl);
        const opener = page.getByRole("button", { name: "フィード詳細を開く" });
        const row = page.getByLabel("フィード行");
        await expect(row).toContainText("自動再試行待ち · Response closed due to connection limit");
        expect(
          await row.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        ).toBe(true);
        await page.screenshot({ path: testInfo.outputPath("feed-retry-sidebar.png") });
        await opener.click();
        const dialog = page.getByRole("dialog", { name: "フィード詳細" });
        const explanation = dialog.getByText(/通常は最終エラーから24時間以上経過後/);
        await expect(dialog.getByText("自動再試行待ち", { exact: true })).toBeVisible();
        await explanation.scrollIntoViewIfNeeded();
        await expect(explanation).toBeVisible();
        await expect(explanation).toContainText("他の待機条件も満たすと再試行します");
        const bounds = await explanation.boundingBox();
        const dialogBounds = await dialog.boundingBox();
        expect(bounds).not.toBeNull();
        expect(dialogBounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(dialogBounds!.x);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
          dialogBounds!.x + dialogBounds!.width,
        );
        expect(bounds!.y).toBeGreaterThanOrEqual(0);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
        expect(
          await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        ).toBe(true);
        await page.screenshot({ path: testInfo.outputPath("feed-retry-detail.png") });
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(opener).toBeFocused();
        await opener.click();
        await expect(dialog.getByText("自動再試行待ち", { exact: true })).toBeVisible();
        await page.keyboard.press("Escape");
        await page.getByRole("combobox", { name: "連続エラーの状態" }).selectOption("0");
        await expect(row).not.toContainText("自動再試行待ち");
        await opener.click();
        await expect(dialog.getByText("正常", { exact: true })).toBeVisible();
        await expect(dialog.getByText(/24時間以上/)).toHaveCount(0);
        await page.keyboard.press("Escape");
        await page.getByRole("combobox", { name: "連続エラーの状態" }).selectOption("4");
        await opener.click();
        await expect(dialog.getByText("注意", { exact: true })).toBeVisible();
        await expect(dialog.getByText(/24時間以上/)).toHaveCount(0);
        await expect.poll(() => requests.get(page)?.pushReads).toBe(4);
      });
    });
  }
}
