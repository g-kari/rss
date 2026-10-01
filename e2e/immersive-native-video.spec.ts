import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

let html = "";
let unexpected: string[] = [];
let errors: string[] = [];
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
  html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css.css}</style><div id="root"></div><script>${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></html>`;
});
test.beforeEach(async ({ page }) => {
  unexpected = [];
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { value: 8 });
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 8 });
    HTMLMediaElement.prototype.pause = function () {};
    HTMLMediaElement.prototype.play = function () {
      if (new URLSearchParams(location.search).get("play") === "accepted") {
        Object.defineProperty(this, "currentTime", {
          value: 15,
          writable: true,
          configurable: true,
        });
        Object.defineProperty(this, "duration", { value: 60, configurable: true });
        return Promise.resolve();
      }
      return new Promise<void>(() => {});
    };
  });
  await page.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      request.method() === "GET" &&
      request.frame() === page.mainFrame() &&
      !request.isNavigationRequest()
    ) {
      // Leave only this synthetic media response pending. It never reaches the network.
      // play() and media-time states are controlled separately; no decoder/codec claim.
      if (
        url.href ===
          "https://rss-preview.test/api/video-proxy?url=https%3A%2F%2Frss-preview.test%2Fmovie.mp4" &&
        request.resourceType() === "media"
      )
        return;
      if (
        url.href ===
          "https://rss-preview.test/api/image-proxy?url=https%3A%2F%2Frss-preview.test%2Fimage.svg" &&
        request.resourceType() === "image"
      )
        return route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="teal"/></svg>',
        });
      if (url.href === "https://rss-preview.test/favicon.ico")
        return route.fulfill({ status: 204, body: "" });
    }
    if (
      request.method() === "GET" &&
      request.isNavigationRequest() &&
      request.frame() === page.mainFrame() &&
      request.resourceType() === "document" &&
      [
        "https://rss-preview.test/?case=native-video",
        "https://rss-preview.test/?case=native-video&play=accepted",
      ].includes(url.href)
    )
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    unexpected.push(`${request.method()} ${url.href}`);
    return route.abort();
  });
});
test.afterEach(() => {
  expect(errors).toEqual([]);
  expect(unexpected).toEqual([]);
});

test("pending video freezes while paused/hidden, then restores the article clock", async ({
  page,
}, testInfo) => {
  await page.goto("https://rss-preview.test/?case=native-video");
  await page.clock.install();
  await page.getByRole("button", { name: "ドパガキモードを開く" }).click();
  await expect(page.getByLabel("記事の動画（音声なし）")).toHaveCount(1);
  await page.clock.runFor(10_000);
  await page.getByRole("button", { name: "自動再生を一時停止" }).click();
  await page.clock.runFor(60_000);
  await expect(page.getByLabel("記事の動画（音声なし）")).toHaveCount(1);
  await page.getByRole("button", { name: "自動再生を再開" }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(60_000);
  await expect(page.getByLabel("記事の動画（音声なし）")).toHaveCount(1);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(5_000);
  await expect(page.getByLabel("記事の動画（音声なし）")).toHaveCount(0);
  await expect(page.locator(".immersive-navigation [role=status]")).toHaveText("1 / 10件");
  await page.screenshot({ path: testInfo.outputPath("native-video-static-fallback.png") });
  await page.clock.runFor(20_000);
  await expect(page.locator(".immersive-navigation [role=status]")).toHaveText("2 / 10件");
});
test("accepted playback that stops progressing falls back and moves forward", async ({ page }) => {
  await page.goto("https://rss-preview.test/?case=native-video&play=accepted");
  await page.clock.install();
  await page.getByRole("button", { name: "ドパガキモードを開く" }).click();
  const video = page.getByLabel("記事の動画（音声なし）");
  await video.evaluate((element) => element.dispatchEvent(new Event("timeupdate")));
  await page.clock.runFor(15_250);
  await expect(video).toHaveCount(0);
  await page.clock.runFor(20_000);
  await expect(page.locator(".immersive-navigation [role=status]")).toHaveText("2 / 10件");
});
test("normal end and repeated navigation leave no stale advancement", async ({ page }) => {
  await page.goto("https://rss-preview.test/?case=native-video");
  await page.clock.install();
  await page.getByRole("button", { name: "ドパガキモードを開く" }).click();
  await page.getByLabel("記事の動画（音声なし）").evaluate((element) => {
    element.dispatchEvent(new Event("ended"));
    element.dispatchEvent(new Event("ended"));
  });
  await expect(page.locator(".immersive-navigation [role=status]")).toHaveText("2 / 10件");
  for (let index = 0; index < 3; index++) {
    await page.getByRole("button", { name: "前の記事" }).click();
    await page.clock.runFor(10_000);
    await expect(page.getByLabel("記事の動画（音声なし）")).toHaveCount(1);
    await page.getByRole("button", { name: "次の記事", exact: true }).click();
  }
  await page.keyboard.press("Escape");
  await page.clock.runFor(60_000);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
