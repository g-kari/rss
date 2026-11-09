import {
  installActiveArticleCapture,
  matchActiveArticleRequest,
  previewArticles,
} from "./helpers/active-article-request";
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
      await installActiveArticleCapture(page);
      const state = { requests: [] as string[], errors: [] as string[] };
      diagnostics.set(page, state);
      page.on("pageerror", (error) => state.errors.push(error.message));
      await page.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const target = encodeURIComponent(url.searchParams.get("url") || "");
        const proxy = `https://rss-preview.test/api/image-proxy?url=${target}`;
        if (
          request.method() === "GET" &&
          request.isNavigationRequest() &&
          request.frame() === page.mainFrame() &&
          request.resourceType() === "document" &&
          url.href === "https://rss-preview.test/"
        )
          return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
        if (
          request.method() === "GET" &&
          !request.isNavigationRequest() &&
          request.frame() === page.mainFrame() &&
          request.resourceType() === "image" &&
          url.origin === "https://rss-preview.test" &&
          url.pathname === "/api/image-proxy" &&
          [proxy, `${proxy}&error=empty`].includes(url.href) &&
          ["https://rss-preview.test/image.svg", "https://rss-preview.test/body.svg"].includes(
            url.searchParams.get("url") || "",
          )
        )
          return route.fulfill({
            contentType: "image/svg+xml",
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="teal"/><circle cx="400" cy="225" r="100" fill="white"/></svg>',
          });
        const active = await matchActiveArticleRequest(
          page,
          request,
          "https://rss-preview.test",
          previewArticles,
        );
        if (active?.aborted) return route.abort();
        if (active)
          return route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(
              active.kind === "ogp" ? {} : { content: "<p>合成記事の全文です。</p>" },
            ),
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
    test("continuous articles, native scroll, keyboard, focus return, and responsive controls", async ({
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
      await page.getByRole("region", { name: "おすすめ記事を縦にスワイプ" }).evaluate((element) => {
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
      await expect(page.getByRole("heading", { name: /^記事 11：/ })).toBeVisible();
      await expect(page.locator(".immersive-navigation [role=status]")).toHaveText("11 / 20件");
      await expect(page.getByRole("button", { name: "次の10件を見る" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "次の記事", exact: true })).toBeEnabled();
      // A painted article is locally marked read; queued cards must not be marked.
      await expect(page.getByTestId("read-ids")).toContainText('"10"');
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(await list.evaluate((element) => element.scrollTop)).toBe(350);
      await expect(page.getByText("開いた記事: なし")).toBeVisible();
      await trigger.click();
      await page.getByRole("button", { name: "本文を読む" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByText("開いた記事: 11")).toBeVisible();
    });
  });
}

test.describe("active article dispatch isolation", () => {
  const origin = "https://rss-dispatch.test";
  const articles = { active: "https://example.com/active", queued: "https://example.com/queued" };
  const contentUrl = `${origin}/api/content?url=${encodeURIComponent(articles.active)}`;
  const documentBody =
    '<!doctype html><link rel="icon" href="data:,"><div class="immersive-dialog"><div class="immersive-slide" aria-hidden="false" data-article-id="active"></div></div>';

  test("known queued, hidden, closed and external requests remain rejected at dispatch", async ({
    page,
  }) => {
    const accepted: string[] = [];
    const rejected: string[] = [];
    await installActiveArticleCapture(page);
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (
        request.url() === `${origin}/` &&
        request.method() === "GET" &&
        request.isNavigationRequest() &&
        request.resourceType() === "document" &&
        request.frame() === page.mainFrame()
      )
        return route.fulfill({ contentType: "text/html", body: documentBody });
      const active = await matchActiveArticleRequest(page, request, origin, articles);
      if (active && !active.aborted) {
        accepted.push(active.articleUrl);
        return route.fulfill({ json: { content: "synthetic current body" } });
      }
      rejected.push(request.url());
      return route.abort();
    });
    await page.goto(`${origin}/`);
    const read = async (url: string) =>
      page.evaluate(async (target) => {
        await fetch(target).catch(() => undefined);
      }, url);
    await read(contentUrl);
    await read(`${origin}/api/content?url=${encodeURIComponent(articles.queued)}`);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    });
    await read(contentUrl);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.querySelector(".immersive-dialog")!.remove();
    });
    await read(contentUrl);
    await read("https://outside.test/api/content?url=https%3A%2F%2Fexample.com%2Factive");
    expect(accepted).toEqual([articles.active]);
    expect(rejected).toEqual([
      `${origin}/api/content?url=${encodeURIComponent(articles.queued)}`,
      contentUrl,
      contentUrl,
      "https://outside.test/api/content?url=https%3A%2F%2Fexample.com%2Factive",
    ]);
  });

  test("aborted and concurrent same-URL dispatches cannot lend an old active snapshot to a hidden request", async ({
    page,
  }) => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const dispatchIds: string[] = [];
    const decisions: string[] = [];
    await installActiveArticleCapture(page);
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (
        request.url() === `${origin}/` &&
        request.method() === "GET" &&
        request.isNavigationRequest() &&
        request.resourceType() === "document" &&
        request.frame() === page.mainFrame()
      )
        return route.fulfill({ contentType: "text/html", body: documentBody });
      const id = request.headers()["x-rss-fixture-dispatch"];
      dispatchIds.push(id);
      if (dispatchIds.length === 1) await firstGate;
      const active = await matchActiveArticleRequest(page, request, origin, articles);
      decisions.push(active?.aborted ? "aborted" : active ? "allowed" : "rejected");
      if (active && !active.aborted) return route.fulfill({ json: { content: "synthetic" } });
      return route.abort();
    });
    await page.goto(`${origin}/`);
    await page.evaluate((url) => {
      const controller = new AbortController();
      const fixture = window as typeof window & { dispatchAbort?: AbortController };
      fixture.dispatchAbort = controller;
      void fetch(url, { signal: controller.signal }).catch(() => undefined);
    }, contentUrl);
    await expect.poll(() => dispatchIds.length).toBe(1);
    await page.evaluate(async (url) => {
      (window as typeof window & { dispatchAbort: AbortController }).dispatchAbort.abort();
      // This fetch never dispatches and must not leave a reusable capture.
      const alreadyAborted = new AbortController();
      alreadyAborted.abort();
      await fetch(url, { signal: alreadyAborted.signal }).catch(() => undefined);
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      await fetch(url).catch(() => undefined);
    }, contentUrl);
    releaseFirst();
    await expect.poll(() => decisions.length).toBe(2);
    expect(new Set(dispatchIds).size).toBe(2);
    expect(decisions.sort()).toEqual(["aborted", "rejected"]);
    expect(
      await page.evaluate(() =>
        Object.keys(
          (window as typeof window & { immersiveRequestDispatches: Record<string, unknown> })
            .immersiveRequestDispatches,
        ),
      ),
    ).toEqual([]);
  });

  test("an old document dispatch cannot consume a new document capture after reload", async ({
    page,
  }) => {
    let releaseOld!: () => void;
    const oldGate = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });
    const ids: string[] = [];
    const decisions: string[] = [];
    await installActiveArticleCapture(page);
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (
        request.url() === `${origin}/` &&
        request.method() === "GET" &&
        request.isNavigationRequest() &&
        request.resourceType() === "document" &&
        request.frame() === page.mainFrame()
      )
        return route.fulfill({ contentType: "text/html", body: documentBody });
      const first = ids.length === 0;
      ids.push(request.headers()["x-rss-fixture-dispatch"]);
      if (first) await oldGate;
      const active = await matchActiveArticleRequest(page, request, origin, articles);
      decisions.push(active && !active.aborted ? "allowed" : "rejected");
      if (active && !active.aborted)
        return route.fulfill({ json: { content: "new document body" } });
      return route.abort();
    });
    await page.goto(`${origin}/`);
    await page.evaluate((url) => {
      void fetch(url).catch(() => undefined);
    }, contentUrl);
    await expect.poll(() => ids.length).toBe(1);
    await page.reload();
    await page.evaluate(async (url) => {
      await fetch(url);
    }, contentUrl);
    releaseOld();
    await expect.poll(() => decisions.length).toBe(2);
    expect(ids[0].split(":")[0]).not.toBe(ids[1].split(":")[0]);
    expect(decisions).toEqual(["allowed", "rejected"]);
  });
});
