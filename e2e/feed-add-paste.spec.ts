import { expect, test, type Page, type Route } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const origin = "https://rss-feed-paste.test/";
const firstUrl = "https://example.test/feed.xml";
const nextUrl = "https://other.test/feed.xml";
const options = { cookie: "synthetic_cookie=1", cssSelector: "article a", useRsshub: false };
let html = "";
interface ResponsePlan {
  status?: number;
  gate?: Promise<void>;
}
const diagnostics = new WeakMap<
  Page,
  { errors: string[]; posts: Record<string, unknown>[]; responses: ResponsePlan[] }
>();

test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [{ outputFiles }, css] = await Promise.all([
    build({
      absWorkingDir: root,
      entryPoints: [resolve(root, "e2e/fixtures/feed-add-paste.tsx")],
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"test"' },
      plugins: [
        {
          name: "unrelated-visual-mode",
          setup(builder) {
            builder.onLoad({ filter: /src\/components\/VisualModeBar\.tsx$/ }, () => ({
              contents: "export function VisualModeSwitch() { return null; }",
              loader: "tsx",
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
  html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>${css.css}</style><div id="root"></div><script>${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></html>`;
});

test.beforeEach(async ({ page, context }) => {
  const state = {
    errors: [] as string[],
    posts: [] as Record<string, unknown>[],
    responses: [] as ResponsePlan[],
  };
  diagnostics.set(page, state);
  page.on("pageerror", (error) => state.errors.push(error.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  const time = new Date("2026-10-04T12:00:00Z");
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.valueOf() + 1000));
  await page.route("**/*", async (route: Route) => {
    const request = route.request();
    if (request.url() === origin && request.method() === "GET" && request.isNavigationRequest())
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    if (request.url() === `${origin}api/feeds` && request.method() === "POST") {
      const body = request.postDataJSON();
      state.posts.push(body);
      const response = state.responses.shift() ?? {};
      if (response.gate) await response.gate;
      return route.fulfill({
        status: response.status ?? 200,
        json: response.status
          ? { error: "Synthetic add failed", canRetryWithSelector: true }
          : { id: "synthetic-feed", url: body.url },
      });
    }
    state.errors.push(`unexpected ${request.method()} ${request.url()}`);
    await route.abort();
  });
  await page.goto(origin);
  await page.getByRole("button", { name: "フィードを追加する" }).click();
  await page.clock.runFor(20);
});
test.afterEach(({ page }) => expect(diagnostics.get(page)!.errors).toEqual([]));
const input = (page: Page) => page.getByLabel("フィード URL");
const dialog = (page: Page) => page.getByRole("dialog", { name: "フィードを追加", exact: true });
async function paste(page: Page, value = firstUrl) {
  await page.evaluate((text) => navigator.clipboard.writeText(text), value);
  await input(page).focus();
  await page.keyboard.press("Control+V");
}
async function setOptions(page: Page) {
  await page.getByRole("button", { name: "Cookie を設定（任意）" }).click();
  await page.getByLabel("Cookie", { exact: true }).fill(options.cookie);
  await page.getByRole("button", { name: "CSS セレクタを指定（RSS のないサイト用）" }).click();
  await page.getByLabel("CSS セレクタ", { exact: true }).fill(options.cssSelector);
  await page.getByRole("checkbox").uncheck();
}
async function noPost(page: Page) {
  await page.clock.runFor(100);
  expect(diagnostics.get(page)!.posts).toEqual([]);
}
async function onePost(page: Page, body: Record<string, unknown>) {
  await page.clock.runFor(20);
  await expect(page.getByLabel("追加数")).toHaveText("1");
  expect(diagnostics.get(page)!.posts).toEqual([body]);
  await expect(dialog(page)).toHaveCount(0);
}

for (const width of [390, 1280]) {
  test.describe(`${width}px feed paste lifecycle`, () => {
    test.use({ viewport: { width, height: 850 } });
    test("native clipboard paste posts one committed URL with existing options", async ({
      page,
    }) => {
      await setOptions(page);
      await input(page).fill(nextUrl);
      await paste(page, ` ${firstUrl} `);
      await expect(input(page)).toHaveValue(firstUrl);
      await onePost(page, { url: firstUrl, ...options });
    });
    test("native malformed and partial paste stays local", async ({ page }) => {
      for (const value of [
        "https://",
        "http://",
        "not a URL",
        "ftp://example.test/feed",
        "https://bad host.test",
      ]) {
        await input(page).fill("");
        await paste(page, value);
        await noPost(page);
        await expect(dialog(page)).toBeVisible();
        await expect(input(page)).toHaveAttribute("aria-invalid", "true");
      }
    });
    for (const close of ["cancel", "close", "Escape", "backdrop"] as const) {
      test(`native paste then ${close} cancels before timer and reopening is clean`, async ({
        page,
      }) => {
        await paste(page);
        if (close === "Escape") await input(page).press("Escape");
        else if (close === "backdrop") await page.mouse.click(3, 3);
        else
          await page
            .getByRole("button", {
              name: close === "cancel" ? "キャンセル" : "閉じる",
              exact: true,
            })
            .click();
        await expect(dialog(page)).toHaveCount(0);
        await page.getByRole("button", { name: "フィードを追加する" }).click();
        await noPost(page);
        await expect(input(page)).toHaveValue("");
        await input(page).fill(nextUrl);
        await input(page).press("Enter");
        await onePost(page, { url: nextUrl });
      });
    }
    test("new input and external unmount do not replay queued paste", async ({ page }) => {
      await paste(page);
      await input(page).fill(nextUrl);
      await noPost(page);
      await expect(input(page)).toHaveValue(nextUrl);
      await paste(page);
      await page
        .getByRole("button", { name: "外部から破棄" })
        .evaluate((button: HTMLButtonElement) => button.click());
      await page.getByRole("button", { name: "フィードを追加する" }).click();
      await noPost(page);
      await expect(input(page)).toHaveValue("");
    });
    test("new external draft invalidates the queued URL", async ({ page }) => {
      await paste(page);
      await page
        .getByRole("button", { name: "外部から入力変更" })
        .evaluate((button: HTMLButtonElement) => button.click());
      await noPost(page);
      await expect(input(page)).toHaveValue("https://replacement.test/feed.xml");
    });
    test("repeated native paste sends only the newest URL", async ({ page }) => {
      await paste(page);
      await paste(page, nextUrl);
      await paste(page, nextUrl);
      await onePost(page, { url: nextUrl });
    });
    test("manual Enter consumes queued paste with one request", async ({ page }) => {
      await paste(page);
      await input(page).press("Enter");
      await onePost(page, { url: firstUrl });
    });
    test("adding keeps close lock and prevents duplicate paste or Enter", async ({ page }) => {
      let release!: () => void;
      diagnostics.get(page)!.responses.push({
        gate: new Promise<void>((resolve) => {
          release = resolve;
        }),
      });
      await paste(page);
      await page.clock.runFor(20);
      await expect(input(page)).toBeDisabled();
      await expect(page.getByRole("button", { name: "追加中...", exact: true })).toBeDisabled();
      await page.keyboard.press("Control+V");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "閉じる" }).click();
      await page.mouse.click(3, 3);
      await page.clock.runFor(100);
      expect(diagnostics.get(page)!.posts).toEqual([{ url: firstUrl }]);
      await expect(dialog(page)).toBeVisible();
      await expect(input(page)).toHaveValue(firstUrl);
      await page.screenshot({ path: test.info().outputPath(`feed-add-pending-${width}.png`) });
      release();
      await expect(dialog(page)).toHaveCount(0);
    });
    test("failed paste keeps options and supports manual retry", async ({ page }) => {
      await setOptions(page);
      diagnostics.get(page)!.responses.push({ status: 503 });
      await paste(page);
      await page.clock.runFor(20);
      await expect(page.getByText("Synthetic add failed")).toBeVisible();
      await expect(input(page)).toHaveValue(firstUrl);
      await expect(page.getByLabel("Cookie", { exact: true })).toHaveValue(options.cookie);
      await expect(page.getByLabel("CSS セレクタ", { exact: true })).toHaveValue(
        options.cssSelector,
      );
      await page.clock.runFor(100);
      expect(diagnostics.get(page)!.posts).toEqual([{ url: firstUrl, ...options }]);
      await page.screenshot({ path: test.info().outputPath(`feed-add-error-${width}.png`) });
      await input(page).press("Enter");
      await expect(page.getByLabel("追加数")).toHaveText("1");
      expect(diagnostics.get(page)!.posts).toEqual([
        { url: firstUrl, ...options },
        { url: firstUrl, ...options },
      ]);
    });
    for (const submit of ["Enter", "Add"]) {
      test(`ordinary input waits for ${submit}`, async ({ page }) => {
        await input(page).fill(firstUrl);
        await noPost(page);
        if (submit === "Enter") await input(page).press("Enter");
        else await page.getByRole("button", { name: "追加", exact: true }).click();
        await onePost(page, { url: firstUrl });
      });
    }
    test("composition cancels queued paste and both IME Enter flags prevent submission", async ({
      page,
    }) => {
      await paste(page);
      await input(page).evaluate((element) =>
        element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })),
      );
      for (const flags of [{ isComposing: true }, { keyCode: 229 }]) {
        expect(
          await input(page).evaluate(
            (element, init) =>
              element.dispatchEvent(
                new KeyboardEvent("keydown", {
                  key: "Enter",
                  bubbles: true,
                  cancelable: true,
                  ...init,
                }),
              ),
            flags,
          ),
        ).toBe(false);
      }
      await noPost(page);
      await expect(dialog(page)).toBeVisible();
      await input(page).evaluate((element) =>
        element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })),
      );
      await input(page).press("Enter");
      await onePost(page, { url: firstUrl });
    });
  });
}
