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
      entryPoints: [resolve(root, "e2e/fixtures/ai-settings.tsx")],
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
  html = `<!doctype html><html lang="ja"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css.css}</style><div id="root"></div><script>${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></html>`;
});

for (const width of [390, 1280]) {
  test(`AI の実行先とモデルを保存・再表示できる (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    // Only local component fixtures and mocked config. No inference or production writes.
    await page.route("https://ai-settings.test/**", (route) =>
      route.fulfill({ contentType: "text/html", body: html }),
    );
    await page.route("**/api/**", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          silentStart: null,
          silentEnd: null,
          timezone: null,
          errorNotificationsEnabled: false,
        }),
      }),
    );
    await page.goto("https://ai-settings.test/");
    const source = page.getByRole("combobox", { name: "AI の実行先", exact: true });
    const model = page.getByRole("combobox", { name: "Workers AI モデル", exact: true });
    await expect(source).toHaveValue("auto");
    await source.selectOption("workers-ai");
    await model.selectOption("@cf/google/gemma-4-26b-a4b-it");
    await expect(page.getByText(/Chrome 内蔵 AI は使用しません/)).toBeVisible();
    const box = await model.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath("ai-cloud-settings.png"), fullPage: true });
    await page.keyboard.press("Escape");
    await expect(source).not.toBeVisible();
    await page.getByRole("button", { name: "設定を開く" }).click();
    await expect(source).toHaveValue("workers-ai");
    await page.reload();
    await expect(source).toHaveValue("workers-ai");
    await expect(model).toHaveValue("@cf/google/gemma-4-26b-a4b-it");
    await source.selectOption("browser");
    await expect(model).toBeDisabled();
    await source.selectOption("workers-ai");
    await expect(model).toBeEnabled();
    await expect(model).toHaveValue("@cf/google/gemma-4-26b-a4b-it");
  });
}

for (const retired of [
  "@cf/meta/llama-3.1-8b-instruct",
  "@cf/meta/llama-3.1-70b-instruct",
  "@cf/meta/llama-3.2-3b-instruct",
  "@cf/qwen/qwen3-30b-a3b-fp8",
  "@cf/google/gemma-3-27b-it",
  "@cf/qwen/qwen2.5-coder-1.5b-instruct",
]) {
  test(`廃止・利用不能モデル ${retired} は設定を破壊せず切り替え、表示だけでAIを呼ばない`, async ({
    page,
  }) => {
    const unexpected: string[] = [];
    await page.addInitScript((model) => {
      localStorage.setItem("rss-ai-model", model);
      localStorage.setItem('rss-ai-model:"fixture-user"', model);
      localStorage.setItem('rss-ai-provider:"fixture-user"', "browser");
    }, retired);
    await page.route("**/*", (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (
        url.origin === "https://ai-settings.test" &&
        url.pathname === "/" &&
        request.isNavigationRequest()
      )
        return route.fulfill({ contentType: "text/html", body: html });
      if (
        url.origin === "https://ai-settings.test" &&
        url.pathname === "/api/push/config" &&
        request.method() === "GET"
      )
        return route.fulfill({ contentType: "application/json", body: "{}" });
      unexpected.push(request.url());
      return route.abort();
    });
    await page.goto("https://ai-settings.test/");
    const provider = page.getByRole("combobox", { name: "AI の実行先", exact: true });
    const model = page.getByRole("combobox", { name: "Workers AI モデル", exact: true });
    await expect(provider).toHaveValue("browser");
    await expect(model).toHaveValue("@cf/google/gemma-4-26b-a4b-it");
    await expect(model).toBeDisabled();
    await expect(model.locator(`option[value="${retired}"]`)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('rss-ai-model:"fixture-user"'))).toBe(
      retired,
    );
    await provider.selectOption("workers-ai");
    await expect(model).toBeEnabled();
    await expect(model).toHaveValue("@cf/google/gemma-4-26b-a4b-it");
    expect(unexpected).toEqual([]);
  });
}
