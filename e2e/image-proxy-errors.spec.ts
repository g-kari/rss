import { expect, test, type Locator, type Page } from "@playwright/test";
import { build } from "esbuild";
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { buildImageProxyUrl } from "../src/lib/image-proxy-url";

const origin = "https://rss-image-proxy-errors.test";
const missing = "https://publisher.test/missing.svg";
const blocked = "https://publisher.test/blocked.svg";
const network = "https://publisher.test/network.svg";
const good = "https://publisher.test/good.svg";
const late = "https://publisher.test/late.svg";
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#6b9080"/></svg>';
let html = "";
let routeBundle = "";

test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [browser, server] = await Promise.all([
    build({
      absWorkingDir: root,
      entryPoints: [resolve(root, "e2e/fixtures/image-proxy-errors.tsx")],
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"test"' },
    }),
    build({
      absWorkingDir: root,
      entryPoints: [resolve(root, "app/api/image-proxy/route.ts")],
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      external: ["next/server"],
      plugins: [
        {
          name: "synthetic-session-and-cache-only",
          setup(builder) {
            builder.onLoad({ filter: /src\/lib\/server-auth\.ts$/ }, () => ({
              contents:
                "export const withBinarySession = (_request, handler) => handler({ ctx: { waitUntil() {} } });",
              loader: "ts",
            }));
            builder.onLoad({ filter: /src\/lib\/cache-helper\.ts$/ }, () => ({
              contents: `
                export const buildCacheKey = async (origin, type, url) =>
                  new Request(origin + '/fixture-cache?type=' + type + '&url=' + encodeURIComponent(url));
                export const matchCfCache = async () => null;
                export const cachePutAsync = () => {};
                export const deleteCfCache = async () => {};
              `,
              loader: "ts",
            }));
          },
        },
      ],
    }),
  ]);
  routeBundle = server.outputFiles![0].text;
  html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>body{font-family:sans-serif;margin:24px}.thumbnail-image{display:block;width:120px;height:80px;object-fit:cover}output{display:block;margin-top:16px}</style><div id="root"></div><script>${browser.outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></html>`;
});

interface ProxyReply {
  target: string;
  mode: string | null;
  status: number;
  reason: string | null;
  cacheControl: string | null;
  contentType: string | null;
  body: string;
}

/** Actual GET + binary handler + MIME/SVG validation; only session/cache and upstream are synthetic. */
function syntheticRoute() {
  const upstreamRequests: string[] = [];
  const unexpectedUpstream: string[] = [];
  const diagnostics: string[] = [];
  const module: { exports: { GET?: (request: Request) => Promise<Response> } } = { exports: {} };
  const require = createRequire(import.meta.url);
  runInNewContext(
    routeBundle,
    {
      module,
      exports: module.exports,
      require: (name: string) => {
        if (name !== "next/server") throw new Error(`Unexpected route dependency: ${name}`);
        return require(name);
      },
      Request,
      Response,
      Headers,
      Buffer,
      Error,
      TypeError,
      URL,
      TextEncoder,
      TextDecoder,
      Uint8Array,
      ArrayBuffer,
      AbortController,
      setTimeout,
      clearTimeout,
      console: { error: (...parts: unknown[]) => diagnostics.push(parts.map(String).join(" ")) },
      fetch: async (input: string) => {
        upstreamRequests.push(input);
        if (input === missing) return new Response(null, { status: 404 });
        if (input === blocked) return new Response(null, { status: 403 });
        if (input === network) throw new TypeError("Synthetic upstream transport failure");
        if (input === good) {
          return new Response(svg, { headers: { "Content-Type": "image/svg+xml" } });
        }
        unexpectedUpstream.push(input);
        throw new Error(`Unexpected upstream fixture request: ${input}`);
      },
    },
    { filename: "synthetic-image-proxy-route.cjs" },
  );
  if (!module.exports.GET) throw new Error("GET was not exported from the real route bundle");
  return { GET: module.exports.GET, upstreamRequests, unexpectedUpstream, diagnostics };
}

async function fixture(page: Page, scenario: string) {
  const imageRequests: string[] = [];
  const replies: ProxyReply[] = [];
  const errors: string[] = [];
  const server = syntheticRoute();
  const entry = `${origin}/?scenario=${scenario}`;
  page.on("pageerror", (error) => errors.push(error.message));
  // Keep real-time clock installation running; no fixed future pause target can expire on slow CI.
  // runFor below still advances the installed clock to check the absence of retry timers.
  await page.clock.install({ time: new Date("2026-10-08T00:00:00Z") });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const mainFrameGet = request.method() === "GET" && request.frame() === page.mainFrame();
    if (
      mainFrameGet &&
      request.resourceType() === "document" &&
      request.isNavigationRequest() &&
      request.url() === entry
    ) {
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    }
    if (
      mainFrameGet &&
      request.resourceType() === "image" &&
      !request.isNavigationRequest() &&
      url.origin === origin &&
      url.pathname === "/api/image-proxy"
    ) {
      const target = url.searchParams.get("url");
      const canonical = new URL(buildImageProxyUrl(target), origin);
      const strict = new URL(canonical);
      strict.searchParams.set("error", "empty");
      if (
        [missing, blocked, network, good].includes(target ?? "") &&
        [canonical.href, strict.href].includes(request.url())
      ) {
        imageRequests.push(request.url());
        // Reproduce the legacy route contract even after the thumbnail opts in.
        // The real GET still emits its original loadable SVG when opt-in is absent.
        if (scenario === "legacy") url.searchParams.delete("error");
        // Chromium's intercepted request can omit network-only Fetch Metadata headers.
        // This synthetic adapter supplies only missing metadata after the exact same-origin,
        // main-frame image checks above; production's fail-closed guard is tested separately.
        const headers = new Headers(await request.allHeaders());
        for (const [name, value] of Object.entries({
          "Sec-Fetch-Site": "same-origin",
          "Sec-Fetch-Mode": "no-cors",
          "Sec-Fetch-Dest": "image",
        })) {
          if (!headers.has(name)) headers.set(name, value);
        }
        const response = await server.GET(new Request(url, { headers }));
        const body = Buffer.from(await response.arrayBuffer());
        replies.push({
          target: target!,
          mode: url.searchParams.get("error"),
          status: response.status,
          reason: response.headers.get("X-Image-Proxy-Error"),
          cacheControl: response.headers.get("Cache-Control"),
          contentType: response.headers.get("Content-Type"),
          body: body.toString("utf8"),
        });
        return route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body,
        });
      }
    }
    // Abort every other route: direct-origin, OGP, live APIs, and new upstream candidates.
    errors.push(`unexpected ${request.method()} ${request.url()}`);
    return route.abort();
  });
  await page.goto(entry);
  await expect(
    page.getByRole("heading", { name: `Image proxy error fixture: ${scenario}` }),
  ).toBeVisible();
  return { imageRequests, replies, errors, ...server };
}

async function decoded(image: Locator) {
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0),
    )
    .toBe(true);
}

function expectNoExtraRequests(state: Awaited<ReturnType<typeof fixture>>) {
  expect(state.errors).toEqual([]);
  expect(state.unexpectedUpstream).toEqual([]);
  expect(state.imageRequests.map((request) => new URL(request).searchParams.get("url"))).toEqual(
    state.upstreamRequests,
  );
}

function proxyRequest(target: string, strict = false) {
  const url = new URL(buildImageProxyUrl(target), origin);
  if (strict) url.searchParams.set("error", "empty");
  return new Request(url, {
    headers: {
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-Mode": "no-cors",
      "Sec-Fetch-Dest": "image",
    },
  });
}

test("isolated actual GET legacy failure contract is a loadable SVG 200", async () => {
  const server = syntheticRoute();
  const response = await server.GET(proxyRequest(missing));
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
  expect(response.headers.get("X-Image-Proxy-Error")).toBe("not_found");
  expect(await response.text()).toContain("<svg");
  expect(server.upstreamRequests).toEqual([missing]);
  expect(server.unexpectedUpstream).toEqual([]);
});

test("isolated actual GET strict error and valid SVG contracts", async () => {
  const server = syntheticRoute();
  for (const [target, reason] of [
    [missing, "not_found"],
    [blocked, "bot_blocked"],
    [network, "network"],
  ]) {
    const response = await server.GET(proxyRequest(target, true));
    expect(response.status).toBe(502);
    expect(response.body).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Image-Proxy-Error")).toBe(reason);
  }
  const success = await server.GET(proxyRequest(good, true));
  expect(success.status).toBe(200);
  expect(success.headers.get("Content-Type")).toBe("image/svg+xml");
  expect(success.headers.get("X-Image-Proxy-Error")).toBeNull();
  expect(success.headers.get("Content-Security-Policy")).toBe("default-src 'none'; sandbox");
  expect(await success.text()).toContain("<rect");
  expect(server.upstreamRequests).toEqual([missing, blocked, network, good]);
  expect(server.unexpectedUpstream).toEqual([]);
});

test("isolated actual GET rejects missing, cross-site, and navigation metadata before fetch", async () => {
  const server = syntheticRoute();
  const metadataCases: HeadersInit[] = [
    {},
    { "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "no-cors" },
    { "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "navigate" },
  ];
  for (const headers of metadataCases) {
    const response = await server.GET(new Request(proxyRequest(good, true), { headers }));
    expect(response.status).toBe(403);
  }
  expect(server.upstreamRequests).toEqual([]);
  expect(server.unexpectedUpstream).toEqual([]);
});

for (const width of [390, 1280]) {
  test(`legacy SVG 200 error loads successfully and stops fallback at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await fixture(page, "legacy");
    const image = page.getByTestId("thumbnail").locator("img");
    await decoded(image);
    expect(new URL((await image.getAttribute("src"))!, origin).searchParams.get("url")).toBe(
      missing,
    );
    await expect(page.getByLabel("Failed canonical sources")).toHaveText("[]");
    await page.clock.runFor(1000);
    expect(state.upstreamRequests).toEqual([missing]);
    expect(state.replies).toEqual([
      expect.objectContaining({
        target: missing,
        mode: null,
        status: 200,
        reason: "not_found",
        contentType: "image/svg+xml",
      }),
    ]);
    expect(state.replies[0].body).toContain("<svg");
    expectNoExtraRequests(state);
  });

  test(`empty 502 tries each supplied candidate once and keeps the loaded SVG at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await fixture(page, "recover");
    const image = page.getByTestId("thumbnail").locator("img");
    await expect(image).toHaveAttribute("src", /good\.svg/);
    await decoded(image);
    expect(state.replies).toEqual([
      expect.objectContaining({
        target: missing,
        mode: "empty",
        status: 502,
        reason: "not_found",
        cacheControl: "no-store",
        body: "",
      }),
      expect.objectContaining({
        target: good,
        mode: "empty",
        status: 200,
        reason: null,
        contentType: "image/svg+xml",
      }),
    ]);
    await expect(page.getByLabel("Failed canonical sources")).toHaveText(
      JSON.stringify([buildImageProxyUrl(missing)]),
    );
    const loaded = await image.elementHandle();
    await page.getByRole("button", { name: "Publish late candidate" }).click();
    await expect(page.getByLabel("Late candidate")).toHaveText(late);
    expect(await image.evaluate((element, previous) => element === previous, loaded)).toBe(true);
    await page.clock.runFor(1000);
    expect(state.upstreamRequests).toEqual([missing, good]);
    expectNoExtraRequests(state);
  });

  test(`all supplied failures end in the local placeholder without retries at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await fixture(page, "exhaust");
    const thumbnail = page.getByTestId("thumbnail");
    await expect(thumbnail.locator("img")).toHaveCount(0);
    await expect(thumbnail.locator("span[aria-hidden='true'] > svg")).toBeVisible();
    await expect(page.getByLabel("Failed canonical sources")).toHaveText(
      JSON.stringify([missing, blocked, network].map(buildImageProxyUrl)),
    );
    await page.clock.runFor(5000);
    expect(state.upstreamRequests).toEqual([missing, blocked, network]);
    expect(
      state.replies.map((reply) => [reply.mode, reply.status, reply.reason, reply.body]),
    ).toEqual([
      ["empty", 502, "not_found", ""],
      ["empty", 502, "bot_blocked", ""],
      ["empty", 502, "network", ""],
    ]);
    expectNoExtraRequests(state);
  });

  test(`valid SVG 200 remains a successful first candidate at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await fixture(page, "valid");
    await decoded(page.getByTestId("thumbnail").locator("img"));
    await expect(page.getByLabel("Failed canonical sources")).toHaveText("[]");
    await page.clock.runFor(1000);
    expect(state.upstreamRequests).toEqual([good]);
    expect(state.replies[0]).toEqual(
      expect.objectContaining({ target: good, mode: "empty", status: 200, reason: null }),
    );
    expect(state.replies[0].body).toContain("<rect");
    expectNoExtraRequests(state);
  });

  test(`canonical shared failedSources skip an already failed candidate at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await fixture(page, "known-failure");
    const image = page.getByTestId("thumbnail").locator("img");
    await expect(image).toHaveAttribute("src", /good\.svg/);
    await decoded(image);
    await expect(page.getByLabel("Failed canonical sources")).toHaveText("[]");
    await page.clock.runFor(1000);
    expect(state.upstreamRequests).toEqual([good]);
    expect(state.replies[0].mode).toBe("empty");
    expectNoExtraRequests(state);
  });
}
