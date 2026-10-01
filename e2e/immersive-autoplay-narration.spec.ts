import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

let html = "";
let unexpectedRequests: string[] = [];
let pageErrors: string[] = [];
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
  html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css.css}</style><style>body{font-family:system-ui,sans-serif}</style><div id="root"></div><script>${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></html>`;
});

test.beforeEach(async ({ page }) => {
  unexpectedRequests = [];
  pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/*", (route) => {
    unexpectedRequests.push(route.request().url());
    return route.abort();
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { value: 2 });
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 2 });
  });
  await page.route("https://rss-preview.test/**", (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET") {
      unexpectedRequests.push(`${route.request().method()} ${url.href}`);
      return route.abort();
    }
    if (
      !["/", "/favicon.ico", "/api/content", "/api/ogp", "/api/image-proxy"].includes(url.pathname)
    ) {
      unexpectedRequests.push(url.href);
      return route.abort();
    }
    if (url.pathname === "/favicon.ico") return route.fulfill({ status: 204, body: "" });
    if (url.pathname === "/api/image-proxy")
      return route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="teal"/></svg>',
      });
    if (url.pathname === "/api/ogp")
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ image: "" }),
      });
    if (url.pathname === "/api/content")
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ content: "<p>取得した全文をモード内で読みます</p>" }),
      });
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
  });
  await page.goto("https://rss-preview.test/");
});
test.afterEach(() => {
  expect(pageErrors, "Fixture must not hide JavaScript exceptions").toEqual([]);
  expect(
    unexpectedRequests,
    "Fixture must not contact external services or unexpected API endpoints",
  ).toEqual([]);
});

test("lightweight fallback starts first article immediately; pause persists across movement; reopen resets consent", async ({
  page,
}) => {
  await page.clock.install();
  const trigger = page.getByRole("button", { name: "ドパガキモードを開く" });
  await trigger.click();
  await expect(page.getByRole("button", { name: "自動再生を一時停止" })).toBeEnabled();
  await expect(page.getByText(/画像の動きは停止中（軽量表示）/)).toBeVisible();
  await page.clock.runFor(1200);
  expect(await page.locator(".cinematic-progress span").first().getAttribute("style")).not.toBe(
    "width: 0%;",
  );
  await page.getByRole("button", { name: "自動再生を一時停止" }).click();
  await page.getByRole("button", { name: "次の記事", exact: true }).click();
  await page.clock.runFor(60000);
  await expect(page.getByRole("status")).toHaveText("2 / 10件");
  await page.getByRole("button", { name: "自動再生を再開" }).click();
  await page.clock.runFor(60000);
  await expect(page.getByRole("status")).not.toHaveText("2 / 10件");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(page.getByRole("button", { name: "ナレーションを開始" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
test("reduced motion allows explicit timer resume while keeping images still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await page.getByRole("button", { name: "ドパガキモードを開く" }).click();
  await page.clock.runFor(10000);
  await expect(page.getByRole("status")).toHaveText("1 / 10件");
  await expect(page.getByRole("button", { name: "自動再生を再開" })).toBeEnabled();
  await page.getByRole("button", { name: "自動再生を再開" }).click();
  await page.clock.runFor(60000);
  await expect(page.getByRole("status")).not.toHaveText("1 / 10件");
  expect(await page.locator(".cinematic-image").first().getAttribute("style")).toBeNull();
});

test("inline read pauses, Escape restores focus, and outside read removes the current queue item", async ({
  page,
}) => {
  await page.clock.install();
  await page.getByRole("button", { name: "ドパガキモードを開く" }).click();
  const here = page.getByRole("button", { name: "ここで読む", exact: true });
  await here.click();
  await expect(page.getByRole("dialog", { name: "ここで記事の本文を読む" })).toBeVisible();
  await expect(page.getByText("取得した全文をモード内で読みます")).toBeVisible();
  await page.clock.runFor(60000);
  await expect(page.locator(".immersive-navigation [role=status]")).toHaveText("1 / 10件");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "ここで記事の本文を読む" })).toHaveCount(0);
  await expect(here).toBeFocused();
  await page.getByRole("button", { name: "本文を読む", exact: true }).click();
  await expect(page.getByText("開いた記事: 0")).toBeVisible();
  await page.getByRole("button", { name: "ドパガキモードを開く" }).click();
  await expect(page.getByRole("heading", { name: /^記事 2：/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "前の記事" })).toBeDisabled();
});

test("unavailable/remote-only voices do not speak or block the finite article clock", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const fixture = { calls: 0 };
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [
          { name: "Remote fixture", lang: "ja-JP", voiceURI: "remote", localService: false },
        ],
        addEventListener() {},
        removeEventListener() {},
        cancel() {},
        pause() {},
        resume() {},
        speak() {
          fixture.calls++;
        },
      },
      configurable: true,
    });
    (window as unknown as { narrationFixture: typeof fixture }).narrationFixture = fixture;
  });
  await page.reload();
  await page.clock.install();
  await page.getByRole("button", { name: "ドパガキモードを開く" }).click();
  await page.getByRole("button", { name: "ナレーションを開始" }).click();
  await expect(page.getByText(/端末内の音声が利用できません/)).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { narrationFixture: { calls: number } }).narrationFixture.calls,
    ),
  ).toBe(0);
  await page.screenshot({ path: testInfo.outputPath("remote-voice-fallback.png") });
  await page.clock.runFor(60000);
  await expect(page.getByRole("status")).not.toHaveText("1 / 10件");
});

test("synthetic local-voice callbacks coordinate narration and media without claiming OS audio", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    let current: { onstart?: () => void; onend?: () => void } | null = null;
    const fixture = {
      calls: 0,
      cancels: 0,
      completeArticle() {
        while (current) {
          const utterance = current;
          current = null;
          utterance.onend?.();
        }
      },
    };
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [
          {
            name: "Synthetic local fixture",
            lang: "ja-JP",
            voiceURI: "fixture-ja",
            localService: true,
          },
        ],
        addEventListener() {},
        removeEventListener() {},
        cancel() {
          fixture.cancels++;
          current = null;
        },
        pause() {},
        resume() {},
        speak(utterance: typeof current) {
          fixture.calls++;
          current = utterance;
          current?.onstart?.();
        },
      },
      configurable: true,
    });
    class FixtureUtterance {
      text: string;
      constructor(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: FixtureUtterance,
      configurable: true,
    });
    (window as unknown as { narrationFixture: typeof fixture }).narrationFixture = fixture;
  });
  await page.reload();
  await page.clock.install();
  await page.getByRole("button", { name: "ドパガキモードを開く" }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { narrationFixture: { calls: number } }).narrationFixture.calls,
    ),
  ).toBe(0);
  await page.getByRole("button", { name: "ナレーションを開始" }).click();
  await page.clock.runFor(60000);
  await expect(page.getByRole("status")).toHaveText("1 / 10件");
  await page.getByRole("button", { name: "自動再生を一時停止" }).click();
  await page.evaluate(() =>
    (
      window as unknown as { narrationFixture: { completeArticle(): void } }
    ).narrationFixture.completeArticle(),
  );
  await expect(page.getByRole("status")).toHaveText("1 / 10件");
  await page.getByRole("button", { name: "自動再生を再開" }).click();
  await expect(page.getByRole("status")).toHaveText("2 / 10件");
  await page.screenshot({ path: testInfo.outputPath("synthetic-narration-controls.png") });
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { narrationFixture: { cancels: number } }).narrationFixture.cancels,
    ),
  ).toBeGreaterThan(0);
});

test("failed OGP falls back to an already-loaded body image", async ({ page }, testInfo) => {
  await page.route("https://rss-preview.test/api/image-proxy**", (route) => {
    if (route.request().method() !== "GET") {
      unexpectedRequests.push(`${route.request().method()} ${route.request().url()}`);
      return route.abort();
    }
    const source = new URL(route.request().url()).searchParams.get("url");
    if (source?.endsWith("/body.svg"))
      return route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="teal"/></svg>',
      });
    return route.fulfill({ status: 503, body: "fixture OGP unavailable" });
  });
  await page.getByRole("button", { name: "ドパガキモードを開く" }).click();
  const image = page.locator(".immersive-slide:not([inert]) .cinematic-image img");
  await expect(image).toHaveAttribute("src", /body\.svg/);
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath("body-image-fallback.png") });
});

test("English-only local voice is clearly identified as a language fallback", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [
          {
            name: "Synthetic English fixture",
            lang: "en-US",
            voiceURI: "fixture-en",
            localService: true,
          },
        ],
        addEventListener() {},
        removeEventListener() {},
        cancel() {},
        pause() {},
        resume() {},
        speak() {},
      },
      configurable: true,
    });
    class FixtureUtterance {
      text: string;
      constructor(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: FixtureUtterance,
      configurable: true,
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "ドパガキモードを開く" }).click();
  await page.getByRole("button", { name: "ナレーションを開始" }).click();
  await expect(
    page.getByText("日本語音声がないため、端末内の別言語の音声を使います", { exact: true }),
  ).toBeVisible();
});
