import { test, expect, type Page } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  READER_MOTION_DOCUMENT_URL,
  serveReaderMotionFixture,
} from "./helpers/reader-motion-request";

let html = "";
const errors = new WeakMap<Page, string[]>();
test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [{ outputFiles }, css] = await Promise.all([
    build({
      entryPoints: [resolve(root, "e2e/fixtures/reader-motion.tsx")],
      absWorkingDir: root,
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      // The fixture has no math/code blocks; production runtime CSS stays outside this in-memory bundle.
      loader: { ".css": "empty" },
      define: { "process.env.NODE_ENV": '"test"' },
    }),
    postcss([tailwind({ base: root })]).process(
      await readFile(resolve(root, "app/globals.css"), "utf8"),
      { from: resolve(root, "app/globals.css") },
    ),
  ]);
  html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>${css.css}</style><style>body{margin:0;font-family:system-ui}.fixture-controls{height:96px;display:flex;align-content:center;flex-wrap:wrap;gap:4px;overflow:auto;padding:6px}.fixture-controls button,.fixture-controls select{min-height:36px;border:1px solid #aaa;border-radius:6px;padding:4px 8px}.reader-visual-shell{height:calc(100dvh - 96px)}</style><div id="root"></div><script>${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></html>`;
});
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { value: 8, configurable: true });
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 8, configurable: true });
    Object.defineProperty(navigator, "connection", {
      value: Object.assign(new EventTarget(), { saveData: false }),
      configurable: true,
    });
  });
  const collected: string[] = [];
  errors.set(page, collected);
  page.on("pageerror", (error) => collected.push(error.message));
  await page.route("**/*", (route) => {
    const request = route.request();
    return serveReaderMotionFixture(
      {
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        isNavigation: request.isNavigationRequest(),
        isMainFrame: request.frame() === page.mainFrame(),
      },
      route,
      html,
      collected,
    );
  });
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));
async function open(page: Page) {
  await page.goto(READER_MOTION_DOCUMENT_URL);
  await expect(page.getByRole("button", { name: "Change feed", exact: true })).toBeVisible();
}
async function settled(page: Page) {
  // Let the post-commit arrival frame start before checking its settled state.
  await page.waitForTimeout(32);
  await expect(page.locator('[data-reader-animating="true"]')).toHaveCount(0);
}
async function clearEvents(page: Page) {
  await page.evaluate(() => {
    (window as Window & { readerMotionEvents: string[] }).readerMotionEvents = [];
  });
}
async function events(page: Page) {
  return page.evaluate(
    () => (window as Window & { readerMotionEvents: string[] }).readerMotionEvents,
  );
}
async function previewAnimation(page: Page) {
  return page.locator('[data-reader-arrival="body"] .article-content').evaluate((body) => {
    // Match both DOM shapes created by production link-preview insertion.
    const image = document.createElement("img");
    image.className = "ogp-link-preview-image";
    const wrapper = document.createElement("div");
    wrapper.className = "ogp-link-preview-image";
    const nested = document.createElement("img");
    wrapper.appendChild(nested);
    body.appendChild(image);
    body.appendChild(wrapper);
    const animations = [image, nested].map((target) => getComputedStyle(target).animationName);
    image.remove();
    wrapper.remove();
    return animations;
  });
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
]) {
  test.describe(`${viewport.width}px ordinary reader motion`, () => {
    test.use({ viewport });
    test("long RSS excerpts expose the manual source action in the ordinary reader", async ({
      page,
    }) => {
      await open(page);
      await page.getByRole("button", { name: "Next article", exact: true }).click();
      const reader = page.getByRole("article", { name: "記事本文", exact: true });
      const fetchButton = reader.getByRole("button", { name: "全文を取得", exact: true });
      await expect(fetchButton).toBeEnabled();
      await fetchButton.scrollIntoViewIfNeeded();
      await expect(fetchButton).toBeInViewport();
      await expect(reader.getByRole("link", { name: "元記事を開く", exact: true })).toBeVisible();
      expect(await events(page)).toEqual([]);
    });
    test("simple mode is instant and preserves real article/list state across mode changes", async ({
      page,
    }, testInfo) => {
      await open(page);
      await page.getByRole("button", { name: "Next article", exact: true }).click();
      await expect(page.locator('[data-reader-arrival="title"]')).toHaveText(/^Article 1 /);
      await expect(page.locator('[data-reader-arrival="title"]')).toBeVisible();
      expect(await events(page)).toEqual([]);
      expect(await previewAnimation(page)).toEqual(["none", "none"]);
      const article = page.locator('[data-reader-motion="article"]');
      const note = page.getByRole("textbox", { name: "この記事へのメモ" });
      await note.fill("edited draft");
      await article.evaluate((el) => {
        (window as Window & { retainedArticle?: Element }).retainedArticle = el;
        el.scrollTop = 300;
      });
      const before = await article.evaluate((el) => el.scrollTop);
      await page.getByRole("button", { name: "ビジュアル表示", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-visual-motion", "full");
      expect(await previewAnimation(page)).toEqual([
        "article-content-fade-in",
        "article-content-fade-in",
      ]);
      await expect(note).toHaveValue("edited draft");
      expect(await article.evaluate((el) => el === window.retainedArticle)).toBe(true);
      expect(await article.evaluate((el) => el.scrollTop)).toBe(before);
      await page.getByRole("button", { name: "通常表示に戻す", exact: true }).click();
      await expect(note).toHaveValue("edited draft");
      expect(await article.evaluate((el) => el.scrollTop)).toBe(before);
      expect(
        await page
          .locator('[data-pane="view"]')
          .evaluate((el) => getComputedStyle(el).transitionDuration),
      ).toBe("0s");
      await page.getByRole("button", { name: "Show list", exact: true }).click();
      const list = page.locator('[data-reader-motion="list"]');
      const rowHeight = await list
        .locator('[data-reader-placement="virtual"]')
        .first()
        .evaluate((el) => el.getBoundingClientRect().height);
      await list.evaluate((el) => {
        el.scrollTop = 260;
      });
      await page.getByRole("button", { name: "ビジュアル表示", exact: true }).click();
      expect(await list.evaluate((el) => el.scrollTop)).toBe(260);
      expect(
        await list
          .locator('[data-reader-placement="virtual"]')
          .first()
          .evaluate((el) => el.getBoundingClientRect().height),
      ).toBe(rowHeight);
      await page.getByRole("button", { name: "Open settings", exact: true }).click();
      await page.getByRole("textbox", { name: "Text size" }).fill("22");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "Open settings", exact: true })).toBeFocused();
      expect(await list.evaluate((el) => el.scrollTop)).toBe(260);
      await page.screenshot({ path: testInfo.outputPath("reader-preserved.png") });
    });
    test("visual transitions are bounded, interruptible and retain placement", async ({
      page,
    }, testInfo) => {
      await open(page);
      await page.getByRole("button", { name: "ビジュアル表示", exact: true }).click();
      await page.getByRole("button", { name: "Change feed", exact: true }).click();
      await expect.poll(async () => (await events(page)).length).toBeGreaterThan(0);
      expect(
        (await events(page)).filter((id) => id.startsWith("article-title-")).length,
      ).toBeLessThanOrEqual(8);
      await page.screenshot({ path: testInfo.outputPath("list-arriving.png") });
      await settled(page);
      await clearEvents(page);
      await page.getByRole("button", { name: "Next article", exact: true }).click();
      await expect.poll(async () => (await events(page)).includes("title")).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("article-arriving.png") });
      await page.getByRole("button", { name: "動き ON", exact: true }).click();
      await settled(page);
      expect(await previewAnimation(page)).toEqual(["none", "none"]);
      await expect(page.locator('[data-reader-arrival="title"]')).toHaveCSS("opacity", "1");
      await expect(page.locator('[data-reader-arrival="title"]')).toHaveCSS("transform", "none");
      await page.getByRole("button", { name: "動き OFF", exact: true }).click();
      await clearEvents(page);
      for (let i = 0; i < 4; i++)
        await page.getByRole("button", { name: "Next article", exact: true }).click();
      await expect(page.getByTestId("selected")).toHaveText("Selected 5");
      await settled(page);
      await page.getByRole("button", { name: "Show list", exact: true }).click();
      for (const layout of ["compact", "list", "card", "magazine", "gallery"]) {
        await page.getByLabel("Test layout").selectOption(layout);
        await settled(page);
        if (layout === "gallery") {
          await expect(page.locator('[data-reader-placement="gallery"]').first()).toBeAttached();
        } else {
          await expect(page.locator('[data-reader-placement="virtual"]').first()).toBeAttached();
          expect(
            await page
              .locator('[data-reader-placement="virtual"]')
              .first()
              .evaluate((el) => el.style.transform),
          ).toMatch(/^translateY\(/);
        }
      }
      await page.getByRole("button", { name: "Resize columns", exact: true }).click();
      expect(
        await page
          .locator('[data-layout="root"]')
          .evaluate((el) => getComputedStyle(el).transitionDuration),
      ).toBe("0s");
      await page.getByRole("button", { name: "Theme", exact: true }).click();
      await page.screenshot({ path: testInfo.outputPath("reader-settled-dark.png") });
      expect(await page.locator("body").evaluate((el) => el.scrollWidth <= innerWidth)).toBe(true);
    });
  });
}
for (const policy of ["reduced", "weak", "save-data"]) {
  test(`static ${policy} policy suppresses decoration while reading still changes`, async ({
    page,
  }) => {
    if (policy === "reduced") await page.emulateMedia({ reducedMotion: "reduce" });
    else
      await page.addInitScript((hint) => {
        if (hint === "weak")
          Object.defineProperty(navigator, "deviceMemory", { value: 4, configurable: true });
        else
          Object.defineProperty(navigator, "connection", {
            value: Object.assign(new EventTarget(), { saveData: true }),
            configurable: true,
          });
      }, policy);
    await open(page);
    await page.getByRole("button", { name: "ビジュアル表示", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-visual-motion", "still");
    await page.getByRole("button", { name: "Change feed", exact: true }).click();
    await page.getByRole("button", { name: "Next article", exact: true }).click();
    await expect(page.getByTestId("selected")).toHaveText("Selected 1");
    expect(await events(page)).toEqual([]);
    expect(await previewAnimation(page)).toEqual(["none", "none"]);
  });
}
