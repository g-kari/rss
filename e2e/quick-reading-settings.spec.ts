import { test, expect, type Page } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
let html = "";
const diagnostics = new WeakMap<Page, { failures: string[]; imageRequests: number }>();
test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [{ outputFiles }, css] = await Promise.all([
    build({
      entryPoints: [resolve(root, "e2e/fixtures/quick-reading-settings.tsx")],
      absWorkingDir: root,
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      loader: { ".css": "empty" },
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
  const failures: string[] = [];
  const result = { failures, imageRequests: 0 };
  diagnostics.set(page, result);
  page.on("pageerror", (error) => failures.push(error.message));
  await page.route("**/*", (route) => {
    const request = route.request();
    if (
      request.url() === "https://rss-preview.test/" &&
      request.isNavigationRequest() &&
      request.method() === "GET"
    )
      return route.fulfill({ contentType: "text/html", body: html });
    if (
      [
        "https://rss-preview.test/image.svg",
        "https://rss-preview.test/api/image-proxy?url=https%3A%2F%2Frss-preview.test%2Fimage.svg",
      ].includes(request.url()) &&
      request.method() === "GET" &&
      request.resourceType() === "image" &&
      !request.isNavigationRequest()
    ) {
      result.imageRequests++;
      return route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="teal"/></svg>',
      });
    }
    failures.push(`${request.method()} ${request.url()}`);
    return route.abort();
  });
});
test.afterEach(async ({ page }) => {
  expect(diagnostics.get(page)?.failures).toEqual([]);
  expect(await page.evaluate(() => window.quickActions)).toEqual([]);
});
async function panel(page: Page, root = page.getByRole("article", { name: "記事本文" }).first()) {
  await root.getByRole("button", { name: "読書設定", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "読書設定", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "閉じる", exact: true })).toBeFocused();
  expect(
    await dialog.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
    }),
  ).toBe(true);
  return dialog;
}
for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  for (const theme of ["light", "dark"]) {
    test.describe(`${viewport.width}px ${theme}`, () => {
      test.use({ viewport, contextOptions: { reducedMotion: "reduce" } });
      test("ordinary and immersive bodies share persistent settings without extra effects", async ({
        page,
      }, testInfo) => {
        await page.addInitScript(
          (initialTheme) => localStorage.setItem("rss-theme", initialTheme),
          theme,
        );
        await page.goto("https://rss-preview.test/");
        const ordinary = page.getByRole("article", { name: "記事本文" }).first();
        const body = ordinary.locator(".article-content").first();
        await body.evaluate((el) => {
          window.retainedBody = el;
        });
        const dialog = await panel(page);
        await ordinary.evaluate((el) => {
          el.scrollTop = 300;
        });
        await dialog.dispatchEvent("wheel", { deltaX: 200, deltaY: 0 });
        await dialog.evaluate((el) => {
          const start = new Touch({ identifier: 1, target: el, clientX: 200, clientY: 200 });
          const end = new Touch({ identifier: 1, target: el, clientX: 50, clientY: 200 });
          el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [start] }));
          el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, changedTouches: [end] }));
        });
        const imagesBefore = diagnostics.get(page)?.imageRequests;
        for (const [label, value] of [
          ["文字サイズ", "large"],
          ["フォント", "serif"],
          ["行間", "loose"],
          ["本文の幅", "wide"],
          ["テーマ", theme === "light" ? "dark" : "light"],
        ])
          await dialog.getByLabel(label, { exact: true }).selectOption(value);
        expect(diagnostics.get(page)?.imageRequests).toBe(imagesBefore);
        await expect(body).toHaveCSS("font-size", "19px");
        expect(await ordinary.evaluate((el) => el.scrollTop)).toBe(300);
        await expect(body).toHaveCSS("line-height", "43.7px");
        await expect(body).toHaveClass(/font-serif/);
        expect(await body.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(
          /\bui-serif\b/,
        );
        expect(await body.evaluate((el) => el === window.retainedBody)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath("ordinary-settings.png") });
        await page.keyboard.press("Escape");
        await expect(ordinary.getByRole("button", { name: "読書設定", exact: true })).toBeFocused();
        await ordinary.evaluate((el) => {
          el.scrollTop = 300;
        });
        await body.evaluate((el) => {
          window.retainedBody = el;
        });
        // Settings can also change through the existing full display sections.
        await page.getByRole("button", { name: "既存の表示設定", exact: true }).click();
        const full = page.getByRole("region", { name: "既存の表示設定", exact: true });
        await expect(
          full
            .getByRole("radiogroup", { name: "フォントサイズ", exact: true })
            .getByRole("radio", { name: "大", exact: true }),
        ).toHaveAttribute("aria-checked", "true");
        await full
          .getByRole("radiogroup", { name: "フォントサイズ", exact: true })
          .getByRole("radio", { name: "小", exact: true })
          .click();
        await expect(body).toHaveCSS("font-size", "14px");
        expect(await ordinary.evaluate((el) => el.scrollTop)).toBe(300);
        expect(await body.evaluate((el) => el === window.retainedBody)).toBe(true);
        await page.getByRole("button", { name: "既存の表示設定", exact: true }).click();
        await page.getByRole("button", { name: "モードを開く", exact: true }).click();
        await page.getByRole("button", { name: "ここで読む", exact: true }).click();
        const inline = page.getByRole("dialog", { name: "ここで記事の本文を読む", exact: true });
        const inlineBody = inline.locator(".article-content");
        await expect(inlineBody).toHaveCSS("font-size", "14px");
        await expect(inlineBody).toHaveCSS("line-height", "32.2px");
        expect(await inlineBody.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(
          /\bui-serif\b/,
        );
        const inlineDialog = await panel(page, inline);
        await inline.getByRole("document").evaluate((el) => {
          el.scrollTop = 300;
        });
        await inlineBody.evaluate((el) => {
          window.retainedBody = el;
        });
        await expect(inlineDialog.getByLabel("文字サイズ", { exact: true })).toHaveValue("small");
        const inlineImagesBefore = diagnostics.get(page)?.imageRequests;
        await inlineDialog.getByLabel("文字サイズ", { exact: true }).selectOption("large");
        expect(diagnostics.get(page)?.imageRequests).toBe(inlineImagesBefore);
        await expect(inlineBody).toHaveCSS("font-size", "19px");
        expect(await inline.getByRole("document").evaluate((el) => el.scrollTop)).toBe(300);
        expect(await inlineBody.evaluate((el) => el === window.retainedBody)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath("immersive-settings.png") });
        await page.keyboard.press("Escape");
        await expect(inline).toBeVisible();
        await expect(inline.getByRole("button", { name: "読書設定", exact: true })).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(inline).toHaveCount(0);
        await page.keyboard.press("Escape");
        await expect(body).toHaveCSS("font-size", "19px");
        await page.reload();
        const reloaded = await panel(page);
        await expect(reloaded.getByLabel("文字サイズ", { exact: true })).toHaveValue("large");
        await expect(reloaded.getByLabel("フォント", { exact: true })).toHaveValue("serif");
        await expect(reloaded.getByLabel("行間", { exact: true })).toHaveValue("loose");
        await expect(reloaded.getByLabel("本文の幅", { exact: true })).toHaveValue("wide");
      });
    });
  }
}
test("interrupted/repeated panel dismissal and nested capture Escape keep reader/navigation intact", async ({
  page,
}) => {
  await page.goto("https://rss-preview.test/");
  const trigger = page.getByRole("button", { name: "読書設定", exact: true });
  await trigger.click();
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "読書設定" })).toHaveCount(0);
  await trigger.click();
  await page.getByTestId("outside-settings").click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole("button", { name: "次のテスト記事", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "読書設定" })).toHaveCount(0);
  await page.getByRole("button", { name: "オーバーレイを開く", exact: true }).click();
  const overlay = page.getByRole("dialog", { name: /記事詳細/ });
  await panel(page, overlay);
  const select = page
    .getByRole("dialog", { name: "読書設定" })
    .getByLabel("文字サイズ", { exact: true });
  await select.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "読書設定" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(overlay).toBeVisible();
  await expect(overlay.getByRole("button", { name: "読書設定", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(overlay).toHaveCount(0);
});

test("settings remain usable in visual still and full-motion modes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { value: 8, configurable: true });
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 8, configurable: true });
    localStorage.setItem("rss-visual-mode", "cinema");
  });
  await page.goto("https://rss-preview.test/");
  await expect(page.locator("html")).toHaveAttribute("data-visual-motion", "full");
  let dialog = await panel(page);
  await dialog.getByLabel("文字サイズ", { exact: true }).selectOption("large");
  await expect(dialog).toHaveCSS("animation-name", "none");
  await page.keyboard.press("Escape");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-visual-motion", "still");
  dialog = await panel(page);
  await expect(dialog.getByLabel("文字サイズ", { exact: true })).toHaveValue("large");
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
});
