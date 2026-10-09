import { test, expect, type Page } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { resolve, relative, join } from "node:path";

// Actual full App, not a mock layout. The before tree is the immutable PR base from CI.
const root = resolve(import.meta.dirname, "..");
const baseline = process.env.RSS_UI_BASELINE_SHA ?? "0fd6874e7d1dde0c6c7c9d3f472c7bb63c31740f";
if (!/^[0-9a-f]{40}$/.test(baseline))
  throw new Error("RSS_UI_BASELINE_SHA must be an exact commit SHA");
const html = new Map<string, string>();
let baselineRoot = "";
const errors = new WeakMap<Page, string[]>();
const external = new WeakMap<Page, string[]>();
const fromBase = (path: string) =>
  execFileSync("git", ["show", `${baseline}:${relative(root, path)}`], {
    cwd: root,
    encoding: "utf8",
  });

test.beforeAll(async () => {
  baselineRoot = await mkdtemp(join(tmpdir(), "rss-ui-baseline-"));
  // Tailwind must scan the old source tree, not infer the old CSS from current classes.
  const archive = execFileSync("git", ["archive", baseline, "app", "src"], { cwd: root });
  execFileSync("tar", ["-x", "-C", baselineRoot], { input: archive });
  await symlink(resolve(root, "node_modules"), join(baselineRoot, "node_modules"), "dir");
  for (const stage of ["before", "after"]) {
    const [{ outputFiles }, css] = await Promise.all([
      build({
        entryPoints: [resolve(root, "e2e/fixtures/reading-workspace.tsx")],
        absWorkingDir: root,
        bundle: true,
        write: false,
        format: "iife",
        jsx: "automatic",
        loader: { ".css": "empty" },
        alias: {
          "next/navigation": resolve(root, "e2e/fixtures/reading-workspace-navigation.ts"),
          fs: resolve(root, "src/lib/empty-module.js"),
          path: resolve(root, "src/lib/empty-module.js"),
        },
        define: { "process.env.NODE_ENV": '"test"' },
        plugins:
          stage === "before"
            ? [
                {
                  name: "exact-before-tree",
                  setup(builder) {
                    builder.onLoad({ filter: /\.(tsx?|jsx?)$/ }, ({ path }) => {
                      if (!/^(src|app)\//.test(relative(root, path))) return undefined;
                      return {
                        contents: fromBase(path),
                        loader: path.endsWith("tsx") ? "tsx" : path.endsWith("ts") ? "ts" : "js",
                      };
                    });
                  },
                },
              ]
            : [],
      }),
      postcss([tailwind({ base: stage === "before" ? baselineRoot : root })]).process(
        stage === "before"
          ? fromBase(resolve(root, "app/globals.css"))
          : await readFile(resolve(root, "app/globals.css"), "utf8"),
        { from: resolve(stage === "before" ? baselineRoot : root, "app/globals.css") },
      ),
    ]);
    html.set(
      stage,
      `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>${css.css}</style><style>:root{--loaded-reddit-sans:system-ui;--loaded-ibm-plex-sans-jp:system-ui}</style><div id="root"></div><script>${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></html>`,
    );
  }
});

test.afterAll(async () => {
  if (baselineRoot) await rm(baselineRoot, { recursive: true, force: true });
});

test.beforeEach(async ({ page }) => {
  const collected: string[] = [],
    requests: string[] = [];
  errors.set(page, collected);
  external.set(page, requests);
  page.on("pageerror", (error) => collected.push(error.message));
  await page.route("**/*", (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (
      url.origin === "https://rss-workspace.test" &&
      url.pathname === "/demo" &&
      request.isNavigationRequest()
    )
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: html.get(url.searchParams.get("stage") ?? "after"),
      });
    // All APIs are served by the local demo handler. Any escaped API is a test failure.
    if (request.resourceType() === "image")
      return route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#7ab6b0"/></svg>',
      });
    requests.push(`${request.method()} ${url.origin}${url.pathname}`);
    return route.abort();
  });
});
test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(external.get(page)).toEqual([]);
});

async function open(page: Page, stage: string, theme: string, list = 360, sidebar = 240) {
  await page.goto(
    `https://rss-workspace.test/demo?stage=${stage}&theme=${theme}&list=${list}&sidebar=${sidebar}`,
  );
  await expect(page.getByRole("navigation", { name: "フィード一覧" })).toBeVisible();
  await expect(page.getByRole("button", { name: "すべて", exact: true })).toBeVisible();
}

for (const width of [1440, 1024, 390, 320])
  for (const theme of ["light", "dark"])
    for (const stage of ["before", "after"]) {
      test.describe(`${stage} ${width}px ${theme} full workspace`, () => {
        test.use({
          viewport: { width, height: width < 1024 ? 844 : 900 },
          contextOptions: { reducedMotion: "reduce" },
        });
        test("subscription to list to article and back retains state", async ({ page }, info) => {
          await open(page, stage, theme);
          const nav = page.getByRole("navigation", { name: "フィード一覧" });
          if (stage === "after")
            for (const name of ["読む", "ライブラリ", "購読フィード"])
              await expect(nav.getByRole("heading", { name, exact: true })).toBeVisible();
          await page
            .locator(".reader-visual-shell")
            .screenshot({ path: info.outputPath("navigation.png") });
          await nav.getByRole("button", { name: "すべて", exact: true }).click();
          const list = page.getByRole("region", { name: "記事一覧", exact: true });
          await expect(list).toBeVisible();
          await expect(
            list.getByText("React 19 の新機能と移行ガイド", { exact: true }).first(),
          ).toBeVisible();
          if (stage === "after") {
            await expect(
              list.getByRole("heading", { name: "すべての記事", exact: true }),
            ).toBeVisible();
            expect(
              await list
                .locator("header")
                .evaluate((element) => element.scrollWidth <= element.clientWidth),
            ).toBe(true);
            for (const name of [/^未読フィルター/, /^絞り込み/, /^表示$/]) {
              const button = list.getByRole("button", { name });
              await expect(button).toBeVisible();
              expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
            }
          }
          await page
            .locator(".reader-visual-shell")
            .screenshot({ path: info.outputPath("article-list.png") });
          await list.getByText("React 19 の新機能と移行ガイド", { exact: true }).first().click();
          const reader = page.getByRole("article", { name: "記事本文", exact: true });
          await expect(reader).toBeVisible();
          await expect(
            reader.getByRole("heading", { name: "React 19 の新機能と移行ガイド" }),
          ).toBeVisible();
          if (stage === "after") {
            await expect(
              reader.getByRole("group", { name: "保存・整理", exact: true }),
            ).toBeVisible();
            await expect(
              reader.getByRole("group", { name: "読書補助", exact: true }),
            ).toBeVisible();
            expect(
              await reader.evaluate((element) => element.scrollWidth <= element.clientWidth),
            ).toBe(true);
          }
          await page
            .locator(".reader-visual-shell")
            .screenshot({ path: info.outputPath("article-reader.png") });
          if (width < 1024) {
            await reader.getByRole("button", { name: "記事一覧に戻る", exact: true }).click();
            await expect(list).toBeVisible();
            await list.getByRole("button", { name: "フィード一覧に戻る", exact: true }).click();
            await expect(nav).toBeVisible();
          }
          await info.attach("source-provenance", {
            body: JSON.stringify({
              stage,
              baseline,
              current: execFileSync("git", ["rev-parse", "HEAD"], {
                cwd: root,
                encoding: "utf8",
              }).trim(),
              width,
              theme,
              fonts: "System fallback; production Next font pipeline unchanged",
            }),
            contentType: "application/json",
          });
        });
      });
    }

for (const width of [1440, 320])
  test.describe(`${width}px complete workspace controls`, () => {
    test.use({ viewport: { width, height: 900 }, contextOptions: { reducedMotion: "reduce" } });
    test("filter, display, collection actions and settings have reversible keyboard paths", async ({
      page,
    }, info) => {
      await open(page, "after", "light", width === 1440 ? 420 : 360);
      const nav = page.getByRole("navigation", { name: "フィード一覧" });
      await nav.getByRole("button", { name: "すべて", exact: true }).click();
      const list = page.getByRole("region", { name: "記事一覧", exact: true });
      const filterTrigger = list.getByRole("button", { name: /^絞り込み/ });
      await filterTrigger.focus();
      await page.keyboard.press("Enter");
      const filters = page.getByRole("dialog", { name: "記事の絞り込み", exact: true });
      await expect(filters).toBeVisible();
      await filters.getByRole("button", { name: "ブックマークフィルター切替 (B)" }).click();
      await expect(
        filters.getByRole("button", { name: "ブックマークフィルター切替 (B)" }),
      ).toHaveAttribute("aria-pressed", "true");
      await filters.getByLabel("カテゴリでフィルター").selectOption("技術");
      await filters.screenshot({ path: info.outputPath("filters.png") });
      await page.keyboard.press("Escape");
      await expect(filterTrigger).toBeFocused();
      await expect(list.getByLabel("有効な絞り込み条件")).toContainText("ブックマーク");
      await expect(list.getByLabel("有効な絞り込み条件")).toContainText("技術");
      await filterTrigger.click();
      await filters.getByRole("button", { name: "すべてのフィルターをクリア" }).click();
      await page.keyboard.press("Escape");
      await expect(list.getByLabel("有効な絞り込み条件")).toHaveCount(0);
      const displayTrigger = list.getByRole("button", { name: "表示", exact: true });
      await displayTrigger.click();
      const display = page.getByRole("dialog", { name: "記事一覧の表示", exact: true });
      for (const name of [
        "コンパクト表示",
        "リスト表示",
        "カード表示",
        "マガジン表示",
        "ギャラリー表示",
      ]) {
        const button = display.getByRole("button", { name, exact: true });
        await button.click();
        await expect(button).toHaveAttribute("aria-pressed", "true");
      }
      await display.getByRole("button", { name: "リスト表示", exact: true }).click();
      await display.screenshot({ path: info.outputPath("display.png") });
      await page.keyboard.press("Escape");
      await expect(displayTrigger).toBeFocused();
      await list.getByRole("button", { name: "操作", exact: true }).click();
      const actions = page.getByRole("dialog", { name: "記事一覧の操作", exact: true });
      await actions.getByRole("button", { name: /^現在:/ }).click();
      const mark = actions.getByRole("button", { name: "全て既読にする", exact: true });
      await mark.click();
      await expect(
        actions.getByRole("button", { name: "全記事を既読にする（確認）" }),
      ).toBeVisible();
      // Cancel the confirmation, never mutate even synthetic state just to take a screenshot.
      await page.keyboard.press("Escape");
      await list
        .getByRole("combobox", { name: "検索", exact: true })
        .fill("絶対に一致しない合成クエリ");
      await expect(
        list.getByText(/一致する記事がありません|条件に一致する記事|見つかりません/).first(),
      ).toBeVisible();
      await page
        .locator(".reader-visual-shell")
        .screenshot({ path: info.outputPath("empty-search.png") });
      await list.getByRole("combobox", { name: "検索", exact: true }).fill("");
      if (width < 1024)
        await list.getByRole("button", { name: "フィード一覧に戻る", exact: true }).click();
      await nav.getByRole("button", { name: "その他のメニュー", exact: true }).click();
      await page.getByRole("menuitem", { name: /ユーザー設定/ }).click();
      const settings = page.getByRole("dialog", { name: /ユーザー設定/ });
      await expect(settings).toBeVisible();
      await settings.screenshot({ path: info.outputPath("settings.png") });
      await page.keyboard.press("Escape");
      await expect(
        nav.getByRole("button", { name: "その他のメニュー", exact: true }),
      ).toBeFocused();
    });
  });
