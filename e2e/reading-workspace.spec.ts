import { test, expect, type Page } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { resolve, relative, join } from "node:path";
import { workspaceFonts } from "./helpers/workspace-fonts";

// Actual full App, not a mock layout. The before tree is the immutable PR base from CI.
const root = resolve(import.meta.dirname, "..");
const baseline =
  process.env.RSS_UI_BASELINE_SHA ||
  execFileSync("git", ["rev-parse", "HEAD^"], { cwd: root, encoding: "utf8" }).trim();
if (!/^[0-9a-f]{40}$/.test(baseline))
  throw new Error("RSS_UI_BASELINE_SHA must be an exact commit SHA");
const alternative = process.env.RSS_UI_ALTERNATIVE_SHA;
if (alternative && !/^[0-9a-f]{40}$/.test(alternative))
  throw new Error("RSS_UI_ALTERNATIVE_SHA must be an exact commit SHA");
const html = new Map<string, string>();
const archivedRoots: string[] = [];
let fonts: Awaited<ReturnType<typeof workspaceFonts>>;
const errors = new WeakMap<Page, string[]>();
const external = new WeakMap<Page, string[]>();
const fromTree = (sha: string, path: string) =>
  execFileSync("git", ["show", `${sha}:${relative(root, path)}`], {
    cwd: root,
    encoding: "utf8",
  });

test.beforeAll(async () => {
  if (
    fromTree(baseline, resolve(root, "app/layout.tsx")) !==
    (await readFile(resolve(root, "app/layout.tsx"), "utf8"))
  )
    throw new Error("Before/after font definitions differ; do not reuse current font assets");
  fonts = await workspaceFonts(process.env.RSS_UI_FONT_ASSET_ROOT);
  for (const stage of alternative ? ["before", "after", "alternative"] : ["before", "after"]) {
    const sha = stage === "before" ? baseline : stage === "alternative" ? alternative : undefined;
    let stageRoot = root;
    if (sha) {
      if (
        fromTree(sha, resolve(root, "app/layout.tsx")) !==
        (await readFile(resolve(root, "app/layout.tsx"), "utf8"))
      )
        throw new Error("Compared font definitions differ; same-build reuse is invalid");
      stageRoot = await mkdtemp(join(tmpdir(), "rss-ui-comparison-"));
      archivedRoots.push(stageRoot);
      // Tailwind scans each exact source tree; current classes cannot stand in for old CSS.
      const archive = execFileSync("git", ["archive", sha, "app", "src"], {
        cwd: root,
        maxBuffer: 32 * 1024 * 1024,
      });
      execFileSync("tar", ["-x", "-C", stageRoot], { input: archive });
      await symlink(resolve(root, "node_modules"), join(stageRoot, "node_modules"), "dir");
    }
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
        plugins: sha
          ? [
              {
                name: "exact-before-tree",
                setup(builder) {
                  builder.onLoad({ filter: /\.(tsx?|jsx?)$/ }, ({ path }) => {
                    if (!/^(src|app)\//.test(relative(root, path))) return undefined;
                    return {
                      contents: fromTree(sha, path),
                      loader: path.endsWith("tsx") ? "tsx" : path.endsWith("ts") ? "ts" : "js",
                    };
                  });
                },
              },
            ]
          : [],
      }),
      postcss([tailwind({ base: stageRoot })]).process(
        sha
          ? fromTree(sha, resolve(root, "app/globals.css"))
          : await readFile(resolve(root, "app/globals.css"), "utf8"),
        { from: resolve(stageRoot, "app/globals.css") },
      ),
    ]);
    html.set(
      stage,
      `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>${css.css}</style><style>${fonts.css}</style><div id="root"></div><script>${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></html>`,
    );
  }
});

test.afterAll(async () => {
  for (const path of archivedRoots) await rm(path, { recursive: true, force: true });
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
    if (url.origin === "https://rss-workspace.test" && fonts.files.has(url.pathname))
      return route.fulfill({ contentType: "font/woff2", body: fonts.files.get(url.pathname) });
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
  await page.evaluate(() => document.fonts.ready);
  if (fonts.files.size) {
    expect(
      await page.locator("body").evaluate((body) => getComputedStyle(body).fontFamily),
    ).toMatch(/Reddit.*Sans.*IBM.*Plex.*Sans.*JP/i);
    expect(
      await page.evaluate(() => [...document.fonts].some((font) => font.status === "loaded")),
    ).toBe(true);
  }
}

async function textContrast(page: Page) {
  return page
    .getByRole("region", { name: "記事一覧", exact: true })
    .locator("header")
    .evaluate((header) => {
      const luminance = (color: string) => {
        const values = color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
          .map((v) => {
            const channel = v / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
        return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
      };
      return [...header.querySelectorAll("button, input")].map((element) => {
        let parent: Element | null = element,
          background = "";
        while (parent) {
          const value = getComputedStyle(parent).backgroundColor;
          if (value !== "rgba(0, 0, 0, 0)" && value !== "transparent") {
            background = value;
            break;
          }
          parent = parent.parentElement;
        }
        if (!background || background.startsWith("rgba"))
          throw new Error("Contrast surface must be opaque");
        const color = getComputedStyle(
          element,
          element instanceof HTMLInputElement ? "::placeholder" : null,
        ).color;
        const a = luminance(color),
          b = luminance(background);
        return {
          label: element.getAttribute("aria-label") || element.textContent?.trim(),
          color,
          background,
          ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        };
      });
    });
}

for (const width of [1440, 1024, 390, 320])
  for (const theme of ["light", "dark"])
    for (const stage of alternative ? ["before", "after", "alternative"] : ["before", "after"]) {
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
            const contrast = await textContrast(page);
            for (const entry of contrast)
              expect(entry.ratio, JSON.stringify(entry)).toBeGreaterThanOrEqual(4.5);
            await info.attach("measured-control-contrast", {
              body: JSON.stringify(contrast, null, 2),
              contentType: "application/json",
            });
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
            await page.goBack();
            await expect(list).toBeVisible();
            await page.goForward();
            await expect(reader).toBeVisible();
            await reader.getByRole("button", { name: "記事一覧に戻る", exact: true }).click();
            await expect(list).toBeVisible();
            await list.getByRole("button", { name: "フィード一覧に戻る", exact: true }).click();
            await expect(nav).toBeVisible();
          }
          await info.attach("source-provenance", {
            body: JSON.stringify({
              stage,
              baseline,
              alternative,
              current: execFileSync("git", ["rev-parse", "HEAD"], {
                cwd: root,
                encoding: "utf8",
              }).trim(),
              width,
              theme,
              fonts: fonts.provenance,
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
      // On desktop, retain the mounted reader behind the portal to catch native Space theft.
      if (width === 1440)
        await list.getByText("React 19 の新機能と移行ガイド", { exact: true }).first().click();
      const filterTrigger = list.getByRole("button", { name: /^絞り込み/ });
      await filterTrigger.focus();
      await page.keyboard.press("Enter");
      const filters = page.getByRole("dialog", { name: "記事の絞り込み", exact: true });
      await expect(filters).toBeVisible();
      await filters.getByRole("button", { name: "ブックマークフィルター切替 (B)" }).focus();
      await page.keyboard.press("Space");
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
        await button.focus();
        await page.keyboard.press("Space");
        await expect(button).toHaveAttribute("aria-pressed", "true");
      }
      await display.getByRole("button", { name: "リスト表示", exact: true }).click();
      await display.screenshot({ path: info.outputPath("display.png") });
      await page.keyboard.press("Escape");
      await expect(displayTrigger).toBeFocused();
      await list.getByRole("button", { name: "操作", exact: true }).click();
      const actions = page.getByRole("dialog", { name: "記事一覧の操作", exact: true });
      const sort = actions.getByRole("button", { name: /^現在:/ });
      await expect(sort).toContainText("新しい順");
      await sort.focus();
      await page.keyboard.press("Space");
      await expect(sort).toContainText("古い順");
      expect((await sort.boundingBox())!.height).toBeGreaterThanOrEqual(44);
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

test.describe("stress sidebar and enlarged text", () => {
  test.use({ viewport: { width: 1440, height: 900 }, contextOptions: { reducedMotion: "reduce" } });
  test("subscription search stays pinned with a long library and 150px sidebar", async ({
    page,
  }, info) => {
    await page.goto("https://rss-workspace.test/demo?stage=after&theme=dark&sidebar=150&stress=1");
    const nav = page.getByRole("navigation", { name: "フィード一覧" });
    const search = nav.getByRole("textbox", { name: "フィードを検索", exact: true });
    await expect(search).toBeVisible();
    const panel = nav.getByRole("tabpanel");
    await panel.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(search).toBeVisible();
    expect(await search.evaluate((element) => element.closest('[role="tabpanel"]') === null)).toBe(
      true,
    );
    await search.fill("Zenn");
    await expect(nav.getByRole("button", { name: /Zenn/ }).first()).toBeVisible();
    await nav.screenshot({ path: info.outputPath("narrow-sidebar-search.png") });
    await nav.getByRole("button", { name: "検索をクリア", exact: true }).click();
    await nav.getByRole("button", { name: "学びの資料 1", exact: true }).click();
    const list = page.getByRole("region", { name: "記事一覧", exact: true });
    await expect(list.getByRole("heading", { name: "学びの資料", exact: true })).toBeVisible();
    await expect(
      list.getByText("React 19 の新機能と移行ガイド", { exact: true }).first(),
    ).toBeVisible();
    await nav.getByRole("button", { name: "#資料1 1", exact: true }).click();
    await expect(list.getByRole("heading", { name: "タグ: 資料1", exact: true })).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    expect(
      await list
        .locator("header")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await page
      .locator(".reader-visual-shell")
      .screenshot({ path: info.outputPath("enlarged-text.png") });
  });
});
