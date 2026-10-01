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
      entryPoints: [resolve(root, "e2e/fixtures/immersive-articles.tsx")],
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
  html = `<!doctype html><html lang="ja"><meta charset="utf-8"><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css.css}</style><style>body{font-family:system-ui,sans-serif}</style><div id="root"></div><script>${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></html>`;
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test.describe(`${viewport.width}px ドパガキモード`, () => {
    test.use({ viewport, contextOptions: { reducedMotion: "reduce" } });
    test.beforeEach(async ({ page }) => {
      const state = { requests: [] as string[], errors: [] as string[] };
      diagnostics.set(page, state);
      page.on("pageerror", (error) => state.errors.push(error.message));
      await page.route("**/*", (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (
          request.method() === "GET" &&
          request.isNavigationRequest() &&
          url.href === "https://rss-preview.test/"
        )
          return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
        if (
          request.method() === "GET" &&
          !request.isNavigationRequest() &&
          url.origin === "https://rss-preview.test" &&
          url.pathname === "/api/image-proxy" &&
          ["https://rss-preview.test/image.svg", "https://rss-preview.test/body.svg"].includes(
            url.searchParams.get("url") || "",
          )
        )
          return route.fulfill({
            contentType: "image/svg+xml",
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="teal"/><circle cx="400" cy="225" r="100" fill="white"/></svg>',
          });
        state.requests.push(`${request.method()} ${url.href}`);
        return route.abort();
      });
      await page.goto("https://rss-preview.test/");
    });
    test.afterEach(({ page }) => {
      const state = diagnostics.get(page)!;
      expect(state.requests, "Fixture must reject nonfixture routes and mutations").toEqual([]);
      expect(state.errors, "Fixture must not hide JavaScript exceptions").toEqual([]);
    });
    test("finite batches, native scroll, keyboard, focus return, and responsive controls", async ({
      page,
    }, testInfo) => {
      const list = page.getByTestId("underlying-list");
      await list.evaluate((element) => {
        element.scrollTop = 350;
      });
      const trigger = page.getByRole("button", { name: "ドパガキモードを開く" });
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      for (const button of await dialog.getByRole("button").all()) {
        const box = await button.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      }
      await page.screenshot({ path: testInfo.outputPath("immersive-light.png") });
      await page.evaluate(() => {
        document.documentElement.dataset.theme = "dark";
      });
      await page.screenshot({ path: testInfo.outputPath("immersive-dark.png") });
      await page.getByRole("region").evaluate((element) => {
        element.scrollTop = element.clientHeight;
      });
      await expect(page.getByRole("status")).toHaveText("2 / 10件");
      await page.keyboard.press("ArrowUp");
      await expect(page.getByRole("status")).toHaveText("1 / 10件");
      await page.getByRole("button", { name: "後で読む" }).click();
      await expect(page.getByRole("button", { name: "保存済み" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await page.getByRole("button", { name: "興味なし" }).click();
      await expect(page.getByRole("button", { name: "元に戻す" })).toBeFocused();
      await page.getByRole("button", { name: "元に戻す" }).click();
      for (let index = 0; index < 10; index++)
        await page.getByRole("button", { name: "次の記事", exact: true }).click();
      await expect(page.getByRole("button", { name: "次の記事", exact: true })).toBeDisabled();
      await page.keyboard.press("ArrowDown");
      await expect(page.getByRole("button", { name: "次の10件を見る" })).toBeVisible();
      await page.getByRole("button", { name: "次の10件を見る" }).click();
      await expect(page.getByRole("heading", { name: /^記事 11：/ })).toBeVisible();
      await expect(page.getByRole("region")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(await list.evaluate((element) => element.scrollTop)).toBe(350);
      await expect(page.getByText("開いた記事: なし")).toBeVisible();
      await trigger.click();
      await page.getByRole("button", { name: "本文を読む" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByText("開いた記事: 10")).toBeVisible();
    });
  });
}
