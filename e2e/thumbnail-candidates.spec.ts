import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildImageProxyUrl } from "../src/lib/image-proxy-url";

const origin = "https://rss-thumbnail-candidates.test";
const cachedImage = "https://images.example.test/broken-ogp.png";
const feedImage = "https://images.example.test/feed.svg";
const lateImage = "https://images.example.test/late-ogp.png";
const feedSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#6b9080"/></svg>';
let html = "";

test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [{ outputFiles }, css] = await Promise.all([
    build({
      absWorkingDir: root,
      entryPoints: [resolve(root, "e2e/fixtures/thumbnail-candidates.tsx")],
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

async function fixture(page: Page, renderer: string) {
  const imageRequests: string[] = [];
  const ogpRequests: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-10-07T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-07T00:00:01Z"));
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin && url.pathname === "/" && request.isNavigationRequest()) {
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    }
    if (url.origin === origin && url.pathname === "/api/ogp") {
      ogpRequests.push(request.url());
      return route.fulfill({ json: { image: "" } });
    }
    if (url.origin === origin && url.pathname === "/api/image-proxy") {
      const target = url.searchParams.get("url");
      if (target === cachedImage || target === feedImage || target === lateImage) {
        imageRequests.push(target);
        if (target === feedImage) {
          return route.fulfill({ contentType: "image/svg+xml", body: feedSvg });
        }
        // Synthetic decode failure exercises Chromium's real img onError. The live
        // proxy's valid 200 SVG error placeholder is deliberately outside this scope.
        return route.fulfill({ contentType: "image/png", body: "not a decodable image" });
      }
    }
    // No direct-origin images, live APIs, or browser-rendering/paid service calls.
    errors.push(`unexpected ${request.method()} ${request.url()}`);
    return route.abort();
  });
  await page.goto(`${origin}/?renderer=${renderer}`);
  await expect(
    page.getByRole("heading", { name: `Thumbnail candidate fixture: ${renderer}` }),
  ).toBeVisible();
  return { imageRequests, ogpRequests, errors };
}

for (const width of [390, 1280]) {
  for (const renderer of ["list", "card", "magazine"]) {
    test(`${renderer} recovers cached broken OGP to a decoded feed image at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const state = await fixture(page, renderer);
      const image = page.getByRole("article").locator("img");
      await expect(image).toHaveAttribute("src", buildImageProxyUrl(feedImage));
      await expect(image).toBeVisible();
      await expect
        .poll(() =>
          image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0),
        )
        .toBe(true);
      expect(state.imageRequests).toEqual([cachedImage, feedImage]);

      const loadedImage = await image.elementHandle();
      await page.getByRole("button", { name: "Publish late OGP cache entry" }).click();
      await expect(page.getByLabel("Cached image")).toHaveText(lateImage);
      await expect(image).toHaveAttribute("src", buildImageProxyUrl(feedImage));
      expect(await image.evaluate((node, loaded) => node === loaded, loadedImage)).toBe(true);
      await page.clock.runFor(1000);
      expect(state.imageRequests).toEqual([cachedImage, feedImage]);
      expect(state.ogpRequests).toEqual([]);
      expect(state.errors).toEqual([]);
    });
  }
}
