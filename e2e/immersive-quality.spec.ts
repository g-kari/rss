import { test, expect, type Page } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { classifyQualityRequest } from "./helpers/immersive-quality-request";

let html = "";
const diagnostics = new WeakMap<
  Page,
  { rejected: string[]; errors: string[]; content: number; images: string[]; failContent: boolean }
>();
test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [{ outputFiles }, css] = await Promise.all([
    build({
      entryPoints: [resolve(root, "e2e/fixtures/immersive-quality.tsx")],
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
test.beforeEach(async ({ page }) => {
  const state = {
    rejected: [] as string[],
    errors: [] as string[],
    content: 0,
    images: [] as string[],
    failContent: false,
  };
  diagnostics.set(page, state);
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const source = url.searchParams.get("url");
    const kind = classifyQualityRequest({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      isNavigation: request.isNavigationRequest(),
      isMainFrame: request.frame() === page.mainFrame(),
    });
    if (kind === "document") {
      state.failContent = url.searchParams.get("case") === "failure";
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    }
    if (kind === "image") {
      const imageSource = source || url.href;
      state.images.push(imageSource);
      const width = imageSource.includes("1600") ? 1600 : imageSource.includes("768") ? 768 : 300;
      return route.fulfill({
        contentType: "image/svg+xml",
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${(width * 9) / 16}"><rect width="100%" height="100%" fill="#176774"/><text x="40" y="100" fill="white" font-size="50">${width}px supplied feed image</text></svg>`,
      });
    }
    if (kind === "content") {
      state.content++;
      return route.fulfill({
        status: state.failContent ? 503 : 200,
        contentType: "application/json",
        body: JSON.stringify(
          state.failContent
            ? { error: "合成の通信エラー" }
            : { content: "<p>元記事から取得した本文をここで読みます。</p>" },
        ),
      });
    }
    state.rejected.push(`${request.method()} ${url.href}`);
    return route.abort();
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
});
test.afterEach(({ page }) => {
  expect(
    diagnostics.get(page)!.rejected,
    "Reject every nonfixture request, mutation and external origin",
  ).toEqual([]);
  expect(diagnostics.get(page)!.errors, "Do not hide component exceptions").toEqual([]);
});
for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test.describe(`${viewport.width}px immersive quality`, () => {
    test.use({ viewport });
    test("uses supplied high-resolution responsive image and complete body captions while paused", async ({
      page,
    }, info) => {
      await page.goto("https://quality.test/");
      await page.getByRole("button", { name: "ドパガキモードを開く" }).click();
      const image = page.locator(".cinematic-image img");
      await expect(image).toHaveAttribute("src", /1600x900/);
      await expect
        .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
        .toBe(1600);
      expect(diagnostics.get(page)!.content).toBe(0);
      await page.getByRole("button", { name: "次の説明" }).click();
      const caption = page.locator(".cinematic-caption");
      await expect(caption).toContainText("11.5万人");
      await expect(caption).toContainText("発表しました。");
      await expect(page.locator(".cinematic-transcript")).toContainText("9段落目");
      await expect(page.getByRole("button", { name: "自動再生を再開" })).toBeVisible();
      const box = await page.locator(".cinematic-copy").boundingBox();
      expect(box!.y).toBeGreaterThan(80);
      expect(box!.y + box!.height).toBeLessThan(viewport.height - 85);
      expect(
        await page
          .getByRole("dialog")
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      await page.screenshot({ path: info.outputPath("complete-body-high-resolution.png") });
      await page.getByRole("button", { name: "前の説明" }).click();
      await expect(caption).toHaveText("大きな画像と説明を文の終わりまで読む");
    });
    test("inline reading labels feed-only text, extracts once despite long feed content, and reuses cache", async ({
      page,
    }, info) => {
      await page.goto("https://quality.test/");
      await page.getByRole("button", { name: "ドパガキモードを開く" }).click();
      await page.getByRole("button", { name: "ここで読む", exact: true }).click();
      await expect(page.getByText("元記事から取得した本文をここで読みます。")).toBeVisible();
      await expect(page.getByText("取得済みの記事本文", { exact: true })).toBeVisible();
      expect(diagnostics.get(page)!.content).toBe(1);
      await page.screenshot({ path: info.outputPath("inline-extracted-body.png") });
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "ここで読む", exact: true })).toBeFocused();
      await page.getByRole("button", { name: "ここで読む", exact: true }).click();
      await expect(page.getByText("元記事から取得した本文をここで読みます。")).toBeVisible();
      expect(diagnostics.get(page)!.content).toBe(1);
    });
  });
}

test("failed source extraction keeps the complete feed text, discloses its scope and offers one retry", async ({
  page,
}, info) => {
  await page.goto("https://quality.test/?case=failure");
  await page.getByRole("button", { name: "ドパガキモードを開く" }).click();
  await page.getByRole("button", { name: "ここで読む", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText(/全文とは限りません/)).toBeVisible();
  await expect(page.locator(".article-content")).toContainText("9段落目");
  expect(diagnostics.get(page)!.content).toBe(1);
  await page.screenshot({ path: info.outputPath("feed-only-failure.png") });
  diagnostics.get(page)!.failContent = false;
  await page.getByRole("button", { name: "全文取得を再試行" }).click();
  await expect(page.getByText("元記事から取得した本文をここで読みます。")).toBeVisible();
  expect(diagnostics.get(page)!.content).toBe(2);
});

test("cached extraction does not fetch again and tiny-only images keep native dimensions", async ({
  page,
}, info) => {
  await page.goto("https://quality.test/?case=cached");
  await page.getByRole("button", { name: "ドパガキモードを開く" }).click();
  await page.getByRole("button", { name: "ここで読む", exact: true }).click();
  await expect(page.getByText("すでに取得した記事本文です。")).toBeVisible();
  expect(diagnostics.get(page)!.content).toBe(0);
  await page.keyboard.press("Escape");
  await page.goto("https://quality.test/?case=failure");
  await page.getByRole("button", { name: "ドパガキモードを開く" }).click();
  const image = page.locator(".cinematic-image img");
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBe(300);
  await expect
    .poll(() => image.evaluate((element) => element.clientWidth))
    .toBeLessThanOrEqual(300);
  await page.screenshot({ path: info.outputPath("tiny-image-native-size.png") });
});
