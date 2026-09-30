import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

let html = "";
test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [{ outputFiles }, css] = await Promise.all([
    build({
      entryPoints: [resolve(root, "e2e/fixtures/visual-mode.tsx")],
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
  html = `<!doctype html><html lang="ja"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style><div id="root"></div><script>${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></html>`;
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
]) {
  test.describe(`${viewport.width}px visual reader`, () => {
    test.use({ viewport });
    test.beforeEach(async ({ page }) => {
      await page.route("https://rss-preview.test/**", (route) =>
        route.fulfill(
          route.request().url().includes("image")
            ? {
                contentType: "image/svg+xml",
                body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="a"><stop stop-color="#27316b"/><stop offset="1" stop-color="#74e5c3"/></linearGradient></defs><rect width="800" height="600" fill="url(#a)"/><circle cx="600" cy="120" r="200" fill="#dad6ff"/><circle cx="240" cy="360" r="180" fill="#4338ca"/></svg>',
              }
            : { contentType: "text/html", body: html },
        ),
      );
      await page.goto("https://rss-preview.test/");
    });
    test("switches without losing list position, settings input or focus and stays in the viewport", async ({
      page,
    }, testInfo) => {
      const chrome = page.getByRole("banner", { name: "サイトの表示モード" });
      await expect(page.locator("html")).not.toHaveAttribute("data-visual-mode");
      const list = page.getByTestId("underlying-list");
      await list.evaluate((element) => {
        element.scrollTop = 300;
      });
      await chrome.getByRole("button", { name: "ビジュアル表示", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-visual-mode", "cinema");
      expect(await list.evaluate((element) => element.scrollTop)).toBe(300);
      expect(
        await page
          .locator("body")
          .evaluate(
            (element) => element.scrollWidth <= innerWidth && element.scrollHeight <= innerHeight,
          ),
      ).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("visual-reader.png") });
      await page.getByRole("button", { name: "設定", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("spinbutton").fill("22");
      await page.keyboard.press("Escape");
      expect(await list.evaluate((element) => element.scrollTop)).toBe(300);
      await chrome.getByRole("button", { name: "ビジュアル表示", exact: true }).click();
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-visual-mode", "cinema");
    });
    test("full-viewport media, readable overlays, keyboard, and reduced motion", async ({
      page,
    }, testInfo) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.getByRole("button", { name: "ビジュアル表示", exact: true }).click();
      await page.getByRole("button", { name: "ドパガキモードを開く" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("button", { name: "一覧に戻る" })).toBeFocused();
      await expect(dialog.getByRole("button", { name: "20秒の演出を再生" })).toHaveCount(0);
      await expect(dialog.getByRole("button", { name: "自動再生を再開" })).toBeDisabled();
      const stage = dialog.locator('.immersive-slide[aria-hidden="false"] .cinematic-shot');
      const stageBox = await stage.boundingBox();
      expect(stageBox!.width).toBe(viewport.width);
      expect(stageBox!.height).toBe(viewport.height);
      const caption = stage.locator(".cinematic-caption");
      expect(
        await caption.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
      ).toBeGreaterThanOrEqual(24);
      const captionBox = await caption.boundingBox();
      const actionsBox = await dialog.locator(".immersive-actions").boundingBox();
      expect(captionBox!.x + captionBox!.width).toBeLessThanOrEqual(actionsBox!.x);
      expect(captionBox!.y).toBeGreaterThan(60);
      expect(captionBox!.y + captionBox!.height).toBeLessThan(viewport.height - 80);
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      for (const button of await dialog.getByRole("button").all()) {
        const box = await button.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      }
      await page.screenshot({ path: testInfo.outputPath("visual-story.png") });
      await page.keyboard.press("ArrowDown");
      await expect(dialog.getByRole("status")).toHaveText("2 / 10件");
      await dialog.getByRole("button", { name: "通常表示に戻す" }).click();
      await expect(dialog.getByRole("status")).toHaveText("2 / 10件");
      await expect(dialog.getByRole("button", { name: "ビジュアル表示" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "ドパガキモードを開く" })).toBeFocused();
      await expect(page.getByTestId("selected")).toHaveText("開いた記事: なし");
    });
  });
}

test("opening immersive mode autoplays, keeps pause/speed available and advances without marking read", async ({
  page,
}) => {
  await page.route("https://rss-preview.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto("https://rss-preview.test/");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // No site-wide visual-mode switch is required.
  await page.getByRole("button", { name: "ドパガキモードを開く" }).click();
  await expect(page.getByRole("button", { name: "自動再生を一時停止" })).toBeEnabled();
  await page.getByRole("button", { name: "自動再生を一時停止" }).click();
  await page.getByLabel("再生速度").selectOption("2");
  await expect(page.getByRole("status")).toHaveText("1 / 10件");
  await page.getByRole("button", { name: "自動再生を再開" }).click();
  await expect(page.getByRole("status")).toHaveText("2 / 10件", { timeout: 25_000 });
  await expect(page.getByLabel("再生速度")).toHaveValue("2");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("selected")).toHaveText("開いた記事: なし");
});
