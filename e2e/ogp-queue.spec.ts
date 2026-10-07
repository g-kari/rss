import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const origin = "https://rss-ogp-queue.test/";
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#6b9080"/></svg>';
let html = "";
test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [{ outputFiles }, css] = await Promise.all([
    build({
      absWorkingDir: root,
      entryPoints: [resolve(root, "e2e/fixtures/ogp-queue.tsx")],
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"test"' },
      plugins: [
        {
          name: "synthetic-authenticated-api",
          setup(builder) {
            builder.onLoad({ filter: /src\/lib\/api-fetch\.ts$/ }, () => ({
              contents: "export const apiFetch = (input, init) => fetch(input, init);",
              loader: "ts",
            }));
          },
        },
      ],
    }),
    postcss([tailwind({ base: root })]).process(
      await readFile(resolve(root, "app/globals.css"), "utf8"),
      { from: resolve(root, "app/globals.css") },
    ),
  ]);
  html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>${css.css}</style><div id="root"></div><script>${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></html>`;
});

async function fixture(page: Page, holdFirst = false) {
  const calls: string[] = [];
  const errors: string[] = [];
  let releaseFirst: () => void = () => {};
  const firstGate = new Promise<void>((resolveGate) => {
    releaseFirst = resolveGate;
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-10-07T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-07T00:00:01Z"));
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.url() === origin && request.isNavigationRequest()) {
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    }
    if (url.origin === new URL(origin).origin && url.pathname === "/api/ogp") {
      const target = url.searchParams.get("url")!;
      calls.push(target);
      if (holdFirst && target === "https://articles.example.test/0") await firstGate;
      // A canceled route may already have been disposed by Chromium.
      return route
        .fulfill({
          json: {
            image: `https://images.example.test/${new URL(target).pathname.slice(1)}.svg`,
            title: "Synthetic preview",
            description: "Synthetic excerpt",
          },
        })
        .catch(() => {});
    }
    if (url.origin === new URL(origin).origin && url.pathname === "/api/image-proxy") {
      return route.fulfill({ contentType: "image/svg+xml", body: svg });
    }
    errors.push(`unexpected ${request.method()} ${request.url()}`);
    return route.abort();
  });
  await page.goto(origin);
  await expect(page.getByRole("heading", { name: "Thumbnail acquisition fixture" })).toBeVisible();
  return { calls, errors, releaseFirst };
}

// Clock advancement does not imply a Node route or React response completed.
async function drain(page: Page, calls: string[], count: number) {
  await expect
    .poll(
      async () => {
        await page.clock.runFor(150);
        return calls.length;
      },
      { intervals: [0] },
    )
    .toBe(count);
}

for (const width of [390, 1280]) {
  test(`automatically resolves every visible thumbnail at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await fixture(page, true);
    const firstImage = page.getByTestId("article-0").locator("img");
    await expect(firstImage).toHaveAttribute("src", /feed\.svg/);
    await expect
      .poll(() =>
        firstImage.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      )
      .toBe(true);
    await drain(page, state.calls, 14);
    await expect(page.getByLabel("Resolved thumbnails")).toHaveText("13");
    state.releaseFirst();
    await expect(page.getByLabel("Resolved thumbnails")).toHaveText("14");
    await expect(firstImage).toHaveAttribute("src", /feed\.svg/);
    expect(new Set(state.calls).size).toBe(14);
    expect(state.errors).toEqual([]);
  });

  test(`repairs replaced and canceled links without late writes at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await fixture(page, true);
    await page.clock.runFor(0);
    await expect.poll(() => state.calls.length).toBe(1);
    await page.getByRole("button", { name: "Replace first link" }).click();
    await drain(page, state.calls, 15);
    await expect(page.getByLabel("Resolved thumbnails")).toHaveText("14");
    expect(state.calls).toContain("https://articles.example.test/replacement");
    state.releaseFirst();
    await page.getByRole("button", { name: "Clear list" }).click();
    await page.getByRole("button", { name: "Return to list" }).click();
    await drain(page, state.calls, 16);
    await expect(page.getByLabel("Resolved thumbnails")).toHaveText("15");
    await page.getByRole("button", { name: "Unmount reader" }).click();
    const persisted = await page.evaluate(() => localStorage.getItem("rss-ogp-cache"));
    await page.clock.runFor(500);
    expect(await page.evaluate(() => localStorage.getItem("rss-ogp-cache"))).toBe(persisted);
    expect(state.calls.length).toBe(16);
    expect(state.errors).toEqual([]);
  });
}
