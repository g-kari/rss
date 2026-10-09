import { test, expect, type Locator, type Page } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  READER_MOTION_DOCUMENT_URL,
  serveReaderMotionFixture,
} from "./helpers/reader-motion-request";

// Real ArticleView, pane layout, motion and production CSS; exact synthetic resources only.
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
  await page.emulateMedia({ reducedMotion: "reduce" });
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

async function setTitle(page: Page, title: string) {
  await page.evaluate((value) => window.setReaderTestTitle!(value), title);
}

async function open(page: Page, dark = false) {
  await page.goto(READER_MOTION_DOCUMENT_URL);
  if (dark) await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.getByRole("button", { name: "Next article", exact: true }).click();
  const heading = page.locator('h1[data-reader-arrival="title"]');
  await expect(heading).toBeVisible();
  return heading;
}

async function metrics(heading: Locator) {
  return heading.evaluate((element) => {
    const style = getComputedStyle(element);
    const container = element.closest(".reader-typography")!;
    const rootSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const width = container.getBoundingClientRect().width;
    return {
      fontSize: parseFloat(style.fontSize),
      expectedSize: rootSize * (width >= 40 * rootSize ? 2 : width >= 35 * rootSize ? 1.75 : 1.5),
      fontWeight: style.fontWeight,
      lineHeight: parseFloat(style.lineHeight),
      height: element.getBoundingClientRect().height,
      width,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      wrap: style.overflowWrap,
      clamp: style.webkitLineClamp,
      color: style.color,
    };
  });
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
  { width: 1600, height: 900 },
]) {
  for (const dark of [false, true]) {
    test.describe(`${viewport.width}px ${dark ? "dark" : "light"} Reader title`, () => {
      test.use({ viewport });
      test("scales by usable pane width and wraps long titles within the retained reserve", async ({
        page,
      }) => {
        const heading = await open(page, dark);
        const ordinary = await metrics(heading);
        expect(ordinary.fontSize).toBeCloseTo(ordinary.expectedSize, 2);
        expect(ordinary.fontWeight).toBe("500");
        expect(ordinary.wrap).toBe("anywhere");
        expect(ordinary.clamp).toBe("3");
        expect(ordinary.height).toBeCloseTo(ordinary.lineHeight * 3, 0);
        expect(ordinary.color).toBe(dark ? "rgb(228, 228, 231)" : "rgb(41, 37, 36)");
        for (const title of [
          "日本語とEnglishの長い記事タイトル".repeat(12),
          "UnbrokenEnglishTitle".repeat(30),
        ]) {
          await setTitle(page, title);
          const long = await metrics(heading);
          expect(long.scrollWidth).toBeLessThanOrEqual(long.clientWidth + 1);
          expect(long.height).toBeCloseTo(ordinary.height, 0);
          expect(long.fontSize).toBeCloseTo(long.expectedSize, 2);
        }
        await page.getByRole("button", { name: "Next article", exact: true }).click();
        await expect(heading).toHaveText("Article 2 余白と色をつなぐ読書");
        await expect(
          page.getByRole("textbox", { name: "この記事へのメモ", exact: true }),
        ).toHaveValue("Saved note");
        await page.screenshot({ path: test.info().outputPath("synthetic-reader-title.png") });
      });
    });
  }
}

test.describe("Reader title container boundaries", () => {
  test.use({ viewport: { width: 1600, height: 900 } });
  test("uses inclusive local thresholds and respects enlarged default text", async ({ page }) => {
    const heading = await open(page);
    for (const rootSize of [16, 32]) {
      for (const width of [35 * rootSize - 1, 35 * rootSize, 40 * rootSize - 1, 40 * rootSize]) {
        await heading.evaluate(
          (element, dimensions) => {
            document.documentElement.style.fontSize = `${dimensions.rootSize}px`;
            (element.closest(".reader-typography") as HTMLElement).style.width =
              `${dimensions.width}px`;
          },
          { rootSize, width },
        );
        const current = await metrics(heading);
        expect(current.fontSize).toBeCloseTo(current.expectedSize, 2);
        expect(current.height).toBeCloseTo(current.lineHeight * 3, 0);
      }
    }
  });
});

test.describe("Resized desktop Reader", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test("retains the reader DOM, note and reading position across pane-width reflow", async ({
    page,
  }) => {
    const heading = await open(page);
    const before = await metrics(heading);
    const initialScroll = await heading.evaluate((element) => {
      const scroller = element.closest("article")!;
      scroller.scrollTop = 600;
      (window as Window & { retainedTitle?: Element }).retainedTitle = element;
      window.readerMotionEvents = [];
      return scroller.scrollTop;
    });
    expect(initialScroll).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Resize columns", exact: true }).click();
    await expect.poll(async () => (await metrics(heading)).width).not.toBe(before.width);
    const after = await metrics(heading);
    expect(after.fontSize).toBeCloseTo(after.expectedSize, 2);
    const state = await heading.evaluate((element) => ({
      same: (window as Window & { retainedTitle?: Element }).retainedTitle === element,
      scroll: element.closest("article")!.scrollTop,
      events: window.readerMotionEvents,
    }));
    expect(state.same).toBe(true);
    expect(state.scroll).toBeGreaterThan(0);
    expect(Math.abs(state.scroll - initialScroll)).toBeLessThan(100);
    expect(state.events).toEqual([]);
    await expect(page.getByRole("textbox", { name: "この記事へのメモ", exact: true })).toHaveValue(
      "Saved note",
    );
  });
});

test.describe("Enlarged mobile text", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("keeps a doubled root-font title inside the actual narrow reader", async ({ page }) => {
    const heading = await open(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
    });
    await setTitle(page, "UnbrokenEnglishTitle".repeat(30));
    const enlarged = await metrics(heading);
    expect(enlarged.fontSize).toBe(48);
    expect(enlarged.fontSize).toBeCloseTo(enlarged.expectedSize, 2);
    expect(enlarged.scrollWidth).toBeLessThanOrEqual(enlarged.clientWidth + 1);
    expect(enlarged.height).toBeCloseTo(enlarged.lineHeight * 3, 0);
  });
});
