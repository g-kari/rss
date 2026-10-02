import { test, expect, type Page } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

let html = "";
const imageSources = new Set([
  "https://rss-preview.test/image.svg",
  "https://rss-preview.test/body.svg",
  "https://rss-preview.test/missing-og-body.svg",
  "https://rss-preview.test/broken-og-body.svg",
  "https://rss-preview.test/broken-og-good-body.svg",
  "https://rss-preview.test/broken-og-youtube.svg",
  "https://rss-preview.test/broken-og-placeholder.svg",
  "https://rss-preview.test/broken-body-placeholder.svg",
  "https://i.ytimg.com/vi/missingog01/mqdefault.jpg",
  "https://i.ytimg.com/vi/brokenog001/mqdefault.jpg",
]);
const brokenSources = new Set([
  "https://rss-preview.test/broken-og-body.svg",
  "https://rss-preview.test/broken-og-youtube.svg",
  "https://rss-preview.test/broken-og-placeholder.svg",
  "https://rss-preview.test/broken-body-placeholder.svg",
]);
interface Diagnostics {
  rejected: string[];
  errors: string[];
  images: string[];
}
const diagnostics = new WeakMap<Page, Diagnostics>();

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

test.beforeEach(async ({ page }) => {
  const state: Diagnostics = { rejected: [], errors: [], images: [] };
  diagnostics.set(page, state);
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      request.method() === "GET" &&
      request.isNavigationRequest() &&
      request.frame() === page.mainFrame() &&
      request.resourceType() === "document" &&
      url.origin === "https://rss-preview.test" &&
      url.pathname === "/" &&
      [...url.searchParams.keys()].every((key) => key === "case") &&
      [null, "empty", "dynamic", "thumbnails"].includes(url.searchParams.get("case"))
    )
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    const source = url.searchParams.get("url") || "";
    if (
      request.method() === "GET" &&
      !request.isNavigationRequest() &&
      request.frame() === page.mainFrame() &&
      request.resourceType() === "image" &&
      url.origin === "https://rss-preview.test" &&
      url.pathname === "/api/image-proxy" &&
      [...url.searchParams.keys()].every((key) => key === "url") &&
      imageSources.has(source)
    ) {
      state.images.push(source);
      if (brokenSources.has(source)) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#176774"/></svg>',
      });
    }
    state.rejected.push(`${request.method()} ${url.href}`);
    return route.abort();
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test.afterEach(({ page }) => {
  const state = diagnostics.get(page)!;
  expect(
    state.rejected,
    "No body extraction, OGP, AI, live data, media or mutation requests",
  ).toEqual([]);
  expect(state.errors, "Do not hide production-component exceptions").toEqual([]);
});

const position = (page: Page) => page.locator(".immersive-navigation [role=status]");
const next = (page: Page) => page.getByRole("button", { name: "次の記事", exact: true });
async function ids(page: Page, name = "read-ids"): Promise<string[]> {
  return JSON.parse((await page.getByTestId(name).textContent()) || "[]") as string[];
}
async function setArticleCount(page: Page, count: number) {
  await page.evaluate((value) => {
    const fixture = window as typeof window & {
      immersiveFixture: { setArticleCount: (count: number) => void };
    };
    fixture.immersiveFixture.setArticleCount(value);
  }, count);
}
async function setVisible(page: Page, visible: boolean) {
  await page.evaluate((value) => {
    Object.defineProperty(document, "visibilityState", {
      value: value ? "visible" : "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, visible);
}
async function open(page: Page, fixtureCase?: string) {
  await page.goto(`https://rss-preview.test/${fixtureCase ? `?case=${fixtureCase}` : ""}`);
  await freezeClock(page);
  await page.getByRole("button", { name: "ドパガキモードを開く" }).click();
}
async function freezeClock(page: Page) {
  await page.clock.install({ time: new Date("2026-10-02T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-02T00:01:00Z"));
}
async function painted(page: Page) {
  // Read acknowledgement is deliberately later than a queued/prefetched render.
  await page.clock.runFor(80);
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test.describe(`${viewport.width}px continuous loaded articles`, () => {
    test.use({ viewport });
    test("replenishes 10→20→23 without a batch action and reads only the painted current card", async ({
      page,
    }, info) => {
      await open(page);
      await expect(position(page)).toHaveText("1 / 10件");
      await painted(page);
      expect(await ids(page)).toEqual(["0"]);
      expect((await ids(page, "session-served-ids")).length).toBe(10);
      await expect(page.getByRole("heading", { name: /^記事 1：/ })).toBeVisible();
      const displayed: string[] = ["0"];
      for (let index = 1; index < 23; index++) {
        await next(page).click();
        await painted(page);
        const total = index < 8 ? 10 : index < 18 ? 20 : 23;
        await expect(position(page)).toHaveText(`${index + 1} / ${total}件`);
        await expect(
          page.getByRole("heading", { name: new RegExp(`^記事 ${index + 1}：`) }),
        ).toBeVisible();
        displayed.push(String(index));
        expect(await ids(page)).toEqual(displayed);
        await expect(page.getByRole("button", { name: "次の10件を見る" })).toHaveCount(0);
      }
      await page.screenshot({ path: info.outputPath("continuous-article-23.png") });
      await next(page).click();
      await expect(
        page.getByRole("heading", { name: "読み込み済みの記事はここまで" }),
      ).toBeVisible();
      await expect(next(page)).toBeDisabled();
      await page.clock.runFor(60_000);
      expect(await ids(page, "read-events")).toEqual(displayed);
      await page.getByRole("button", { name: "前の記事", exact: true }).click();
      await painted(page);
      await expect(position(page)).toHaveText("23 / 23件");
      expect(await ids(page, "read-events")).toEqual(displayed);
      await page.keyboard.press("Escape");
      const trigger = page.getByRole("button", { name: "ドパガキモードを開く" });
      await expect(trigger).toBeFocused();
      await trigger.click();
      await painted(page);
      await expect(page.getByRole("article")).toHaveCount(0);
      await expect(next(page)).toBeDisabled();
      expect(await ids(page, "read-events")).toEqual(displayed);
    });
  });
}

test("rapid Next/Back, hidden navigation and reopening never read an unpainted or prefetched card", async ({
  page,
}) => {
  await open(page);
  await painted(page);
  expect(await ids(page)).toEqual(["0"]);
  for (let index = 0; index < 3; index++) await next(page).click();
  await page.getByRole("button", { name: "前の記事", exact: true }).click();
  await expect(position(page)).toHaveText("3 / 10件");
  await painted(page);
  expect(await ids(page)).toEqual(["0", "2"]);
  await setVisible(page, false);
  await next(page).click();
  await page.getByRole("combobox", { name: "再生速度" }).selectOption("2");
  await page.getByRole("button", { name: "自動再生を再開" }).click();
  await page.clock.runFor(60_000);
  await expect(position(page)).toHaveText("4 / 10件");
  expect(await ids(page, "read-events")).toEqual(["0", "2"]);
  await page.keyboard.press("Escape");
  await setVisible(page, true);
  await page.getByRole("button", { name: "ドパガキモードを開く" }).click();
  await expect(page.getByRole("heading", { name: /^記事 4：/ })).toBeVisible();
  await painted(page);
  expect(await ids(page)).toEqual(["0", "2", "3"]);
  expect(await ids(page, "read-events")).toEqual(["0", "2", "3"]);
  await expect(page.getByRole("combobox", { name: "再生速度" })).toHaveValue("2");
});

test("an initially hidden mode marks nothing until its current card is visible", async ({
  page,
}) => {
  await page.goto("https://rss-preview.test/");
  await freezeClock(page);
  await setVisible(page, false);
  await page.getByRole("button", { name: "ドパガキモードを開く" }).click();
  await next(page).click();
  await page.clock.runFor(60_000);
  expect(await ids(page, "read-events")).toEqual([]);
  await expect(position(page)).toHaveText("2 / 10件");
  await setVisible(page, true);
  await painted(page);
  expect(await ids(page, "read-events")).toEqual(["1"]);
  await expect(page.getByRole("heading", { name: /^記事 2：/ })).toBeVisible();
});

test("pause and speed survive replenishment; hidden time does not advance; autoplay reaches exhaustion", async ({
  page,
}) => {
  await open(page);
  for (let index = 0; index < 8; index++) await next(page).click();
  await painted(page);
  await expect(position(page)).toHaveText("9 / 20件");
  await page.getByRole("combobox", { name: "再生速度" }).selectOption("2");
  await page.clock.runFor(60_000);
  await expect(position(page)).toHaveText("9 / 20件");
  await expect(page.getByRole("button", { name: "自動再生を再開" })).toBeEnabled();
  await setVisible(page, false);
  await page.getByRole("button", { name: "自動再生を再開" }).click();
  const readBefore = await ids(page);
  await page.clock.runFor(60_000);
  await expect(position(page)).toHaveText("9 / 20件");
  expect(await ids(page)).toEqual(readBefore);
  await setVisible(page, true);
  // Step each 20-second article at speed 2, allowing React to commit between timer completions.
  for (let index = 9; index <= 23; index++) {
    await page.clock.runFor(10_000);
    if (index < 23) {
      await expect(position(page)).toHaveText(`${index + 1} / ${index < 18 ? 20 : 23}件`);
      await painted(page);
    }
  }
  await expect(page.getByRole("heading", { name: "読み込み済みの記事はここまで" })).toBeVisible();
  await expect(next(page)).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "再生速度" })).toHaveValue("2");
  const events = await ids(page, "read-events");
  expect(events).toEqual(Array.from({ length: 15 }, (_, index) => String(index + 8)));
  await page.clock.runFor(60_000);
  expect(await ids(page, "read-events")).toEqual(events);
});

test("empty and exhausted queues accept newly loaded articles without closing or replaying served cards", async ({
  page,
}) => {
  await open(page, "empty");
  await expect(page.getByRole("heading", { name: "いま紹介できる記事はありません" })).toBeVisible();
  await expect(next(page)).toBeDisabled();
  expect(await ids(page, "read-events")).toEqual([]);
  await setArticleCount(page, 2);
  await painted(page);
  await expect(position(page)).toHaveText("1 / 2件");
  await expect(page.getByRole("heading", { name: /^記事 1：/ })).toBeVisible();
  expect(await ids(page)).toEqual(["0"]);
  await next(page).click();
  await painted(page);
  await next(page).click();
  await expect(page.getByRole("heading", { name: "読み込み済みの記事はここまで" })).toBeVisible();
  await setArticleCount(page, 5);
  await painted(page);
  await expect(position(page)).toHaveText("3 / 5件");
  await expect(page.getByRole("heading", { name: /^記事 3：/ })).toBeVisible();
  expect(await ids(page)).toEqual(["0", "1", "2"]);
  expect(await ids(page, "session-served-ids")).toEqual(["0", "1", "2", "3", "4"]);
  await next(page).click();
  await painted(page);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "ドパガキモードを開く" }).click();
  await painted(page);
  await expect(page.getByRole("heading", { name: /^記事 5：/ })).toBeVisible();
  expect(await ids(page, "read-events")).toEqual(["0", "1", "2", "3", "4"]);
});

test("missing/broken OGP uses loaded body or YouTube then placeholder, with bounded image attempts", async ({
  page,
}, info) => {
  await open(page, "thumbnails");
  const current = page.locator('.immersive-slide[aria-hidden="false"] .cinematic-image');
  const expected = [
    "https://rss-preview.test/missing-og-body.svg",
    "https://rss-preview.test/broken-og-good-body.svg",
    "https://i.ytimg.com/vi/missingog01/mqdefault.jpg",
    "https://i.ytimg.com/vi/brokenog001/mqdefault.jpg",
  ];
  await expect(current.locator("img")).toHaveAttribute(
    "src",
    `/api/image-proxy?url=${encodeURIComponent(expected[0])}`,
  );
  await painted(page);
  expect(await ids(page)).toEqual(["0"]);
  // The neighbor can load an image without being shown/read. Its failed OGP survives reopening.
  await expect(
    page.locator(".immersive-slide").nth(1).locator(".cinematic-image img"),
  ).toHaveAttribute("src", `/api/image-proxy?url=${encodeURIComponent(expected[1])}`);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "ドパガキモードを開く" }).click();
  await expect(page.getByRole("heading", { name: /^記事 2：/ })).toBeVisible();
  for (let index = 1; index < expected.length; index++) {
    if (index > 1) await next(page).click();
    await expect(current.locator("img")).toHaveAttribute(
      "src",
      `/api/image-proxy?url=${encodeURIComponent(expected[index])}`,
    );
    await expect
      .poll(() =>
        current.locator("img").evaluate((element) => (element as HTMLImageElement).naturalWidth),
      )
      .toBe(800);
    await painted(page);
  }
  for (let index = 4; index < 6; index++) {
    await next(page).click();
    await expect(current.locator("img")).toHaveCount(0);
    await expect(current.locator("span > svg")).toHaveCount(1);
    await painted(page);
  }
  await page.screenshot({ path: info.outputPath("thumbnail-placeholder.png") });
  const failedBefore = diagnostics.get(page)!.images.filter((source) => brokenSources.has(source));
  for (const source of brokenSources)
    expect(failedBefore.filter((value) => value === source)).toHaveLength(1);
  // Previous/reopen reuse the session's failed-source knowledge instead of retry loops.
  await page.getByRole("button", { name: "前の記事", exact: true }).click();
  await page.getByRole("button", { name: "前の記事", exact: true }).click();
  await expect(current.locator("img")).toHaveAttribute(
    "src",
    `/api/image-proxy?url=${encodeURIComponent(expected[3])}`,
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "ドパガキモードを開く" }).click();
  await painted(page);
  await expect(next(page)).toBeDisabled();
  expect(diagnostics.get(page)!.images.filter((source) => brokenSources.has(source))).toEqual(
    failedBefore,
  );
});
