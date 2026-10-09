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
      return [...header.querySelectorAll("button")].map((element) => {
        if (!element.textContent?.includes("未読") && !element.textContent?.includes("絞り込み"))
          return null;
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
    for (const stage of ["before", "after"]) {
      test.describe(`${stage} ${width}px ${theme} full workspace`, () => {
        test.use({
          viewport: { width, height: width < 1024 ? 844 : 900 },
          contextOptions: { reducedMotion: "reduce" },
        });
        test("compact navigation, list and reader preserve the selected design", async ({
          page,
        }, info) => {
          await open(page, stage, theme);
          const nav = page.getByRole("navigation", { name: "フィード一覧" });
          await page
            .locator(".reader-visual-shell")
            .screenshot({ path: info.outputPath("navigation.png") });
          await nav.getByRole("button", { name: "すべて", exact: true }).click();
          const list = page.getByRole("region", { name: "記事一覧", exact: true });
          await expect(
            list.getByText("React 19 の新機能と移行ガイド", { exact: true }).first(),
          ).toBeVisible();
          if (stage === "after") {
            await expect(list.getByRole("heading", { name: /すべての記事/ })).toBeVisible();
            for (const name of [/未読フィルター/, /絞り込み/])
              await expect(list.getByRole("button", { name })).toBeVisible();
            expect(
              await list.locator("header").evaluate((el) => el.scrollWidth <= el.clientWidth),
            ).toBe(true);
            for (const control of await list.locator("header button").all())
              expect(await control.evaluate((el) => getComputedStyle(el).borderRadius)).not.toBe(
                "9999px",
              );
            const contrast = (await textContrast(page)).filter((entry) => entry !== null);
            expect(contrast).toHaveLength(2);
            for (const entry of contrast)
              expect(entry!.ratio, JSON.stringify(entry)).toBeGreaterThanOrEqual(4.5);
            await info.attach("measured-label-contrast", {
              body: JSON.stringify(contrast, null, 2),
              contentType: "application/json",
            });
            await expect(page.getByRole("banner", { name: "サイトの表示モード" })).toHaveCount(0);
            await expect(list.locator("summary").filter({ hasText: "読み方" })).toBeVisible();
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
            const quick = reader.getByRole("button", { name: "読書設定", exact: true });
            const translate = reader.getByRole("button", { name: "AI 翻訳", exact: true });
            await expect(quick).toBeVisible();
            expect((await quick.boundingBox())!.height).toBe(
              (await translate.boundingBox())!.height,
            );
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
    test("native Space, unified modes, filters, layouts and settings are reversible", async ({
      page,
    }, info) => {
      await open(page, "after", "light", width === 1440 ? 420 : 360);
      const nav = page.getByRole("navigation", { name: "フィード一覧" });
      await nav.getByRole("button", { name: "すべて", exact: true }).click();
      const list = page.getByRole("region", { name: "記事一覧", exact: true });
      if (width === 1440)
        await list.getByText("React 19 の新機能と移行ガイド", { exact: true }).first().click();
      const bookmark = list.getByRole("button", { name: "ブックマークフィルター切替 (B)" });
      await bookmark.focus();
      await page.keyboard.press("Space");
      await expect(bookmark).toHaveAttribute("aria-pressed", "true");
      await list.getByRole("button", { name: /絞り込み/ }).click();
      await list.getByLabel("カテゴリでフィルター").selectOption("技術");
      await expect(list.getByLabel("カテゴリでフィルター")).toHaveValue("技術");
      await list.getByRole("button", { name: "すべてのフィルターをクリア" }).click();
      await expect(bookmark).toHaveAttribute("aria-pressed", "false");
      for (const name of [
        "コンパクト表示",
        "リスト表示",
        "カード表示",
        "マガジン表示",
        "ギャラリー表示",
      ]) {
        const button = list.getByRole("button", { name, exact: true });
        await button.focus();
        await page.keyboard.press("Space");
        await expect(button).toHaveAttribute("aria-pressed", "true");
      }
      await list.getByRole("button", { name: "リスト表示", exact: true }).click();
      const modes = list.locator("summary").filter({ hasText: "読み方" });
      await modes.focus();
      await page.keyboard.press("Space");
      const visual = list.getByRole("button", { name: "ビジュアル表示", exact: true });
      await expect(visual).toBeVisible();
      await visual.focus();
      await page.keyboard.press("Space");
      await expect(visual).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator("html")).toHaveAttribute("data-visual-mode", "cinema");
      await page
        .locator(".reader-visual-shell")
        .screenshot({ path: info.outputPath("unified-modes.png") });
      await visual.click();
      await expect(visual).toHaveAttribute("aria-pressed", "false");
      await list.getByRole("button", { name: "ドパガキモード", exact: true }).click();
      const immersive = page.getByRole("dialog", { name: "ドパガキモード", exact: true });
      await expect(immersive).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(immersive).toHaveCount(0);
      await expect(modes).toBeFocused();
      await list
        .getByRole("combobox", { name: "検索", exact: true })
        .fill("絶対に一致しない合成クエリ");
      await expect(list.getByRole("heading", { name: /すべての記事.*0/ })).toBeVisible();
      await page
        .locator(".reader-visual-shell")
        .screenshot({ path: info.outputPath("empty-search.png") });
      await list.getByRole("combobox", { name: "検索", exact: true }).fill("");
      if (width < 1024)
        await list.getByRole("button", { name: "フィード一覧に戻る", exact: true }).click();
      const settingsTrigger = nav.getByRole("button", { name: "ユーザー設定", exact: true });
      await settingsTrigger.focus();
      await page.keyboard.press("Space");
      const settings = page.getByRole("dialog", { name: /ユーザー設定/ });
      await expect(settings).toBeVisible();
      await expect(settings.getByRole("group", { name: "NSFW表示設定" })).toContainText(
        "通常表示中",
      );
      await settings.screenshot({ path: info.outputPath("settings.png") });
      await page.keyboard.press("Escape");
      await expect(settingsTrigger).toBeFocused();
      if (width === 1440) {
        await nav.getByRole("button", { name: "Zenn - React", exact: true }).click();
        const collection = nav.getByRole("button", { name: /^学びの資料/ });
        await collection.click();
        await expect(collection).toHaveAttribute("aria-pressed", "true");
        await expect(
          list.getByRole("heading", { name: /Zenn - React · コレクション: 学びの資料/ }),
        ).toBeVisible();
        await expect(
          list.getByText("React 19 の新機能と移行ガイド", { exact: true }).first(),
        ).toBeVisible();
        await expect(
          list.getByText("Next.js 16 への移行で気をつけたこと", { exact: true }),
        ).toHaveCount(0);
        await collection.click();
        await expect(collection).toHaveAttribute("aria-pressed", "false");
        await expect(list.getByRole("heading", { name: /Zenn - React/ })).not.toContainText(
          "コレクション",
        );
      }
    });
  });

test.describe("NSFW settings relocation full workspace", () => {
  test.use({ viewport: { width: 1440, height: 900 }, contextOptions: { reducedMotion: "reduce" } });
  for (const stage of ["before", "after"])
    test(`${stage}: local mode remains active until an explicit settings action`, async ({
      page,
    }, info) => {
      await page.goto(`https://rss-workspace.test/demo?stage=${stage}&theme=dark&nsfw=1`);
      await page.evaluate(() => document.fonts.ready);
      const nav = page.getByRole("navigation", { name: "フィード一覧" });
      await expect(nav).toBeVisible();
      await nav.getByRole("button", { name: "すべて", exact: true }).click();
      await expect(page.getByRole("region", { name: "記事一覧", exact: true })).toBeVisible();
      const exit = page.getByRole("button", { name: "NSFWモード解除", exact: true });
      if (stage === "before") await expect(exit).toBeVisible();
      else await expect(exit).toHaveCount(0);
      await page
        .locator(".reader-visual-shell")
        .screenshot({ path: info.outputPath("nsfw-navigation.png") });
      if (stage === "after") {
        await nav.getByRole("button", { name: "ユーザー設定", exact: true }).click();
        const settings = page.getByRole("dialog", { name: "ユーザー設定", exact: true });
        await expect(settings.getByRole("group", { name: "NSFW表示設定" })).toContainText(
          "NSFW表示中",
        );
        await settings.screenshot({ path: info.outputPath("nsfw-settings.png") });
        await exit.focus();
        await page.keyboard.press("Space");
        await expect(settings.getByRole("group", { name: "NSFW表示設定" })).toContainText(
          "通常表示中",
        );
        await expect(exit).toHaveCount(0);
        await page.keyboard.press("Escape");
        // This full-App fixture intentionally reseeds ephemeral mode on navigation; persistence is tested by nsfw-mode-exit.spec.
      }
    });
});

for (const touch of [false, true])
  for (const theme of ["light", "dark"])
    test.describe(`minimum list ${touch ? "coarse" : "fine"} ${theme}`, () => {
      test.use({
        viewport: { width: 1440, height: 900 },
        hasTouch: touch,
        contextOptions: { reducedMotion: "reduce" },
      });
      test("all six display controls fit and remain keyboard reachable at 200px", async ({
        page,
      }, info) => {
        await open(page, "after", theme, 200, 150);
        await page
          .getByRole("navigation", { name: "フィード一覧" })
          .getByRole("button", { name: "すべて", exact: true })
          .click();
        const list = page.getByRole("region", { name: "記事一覧", exact: true });
        expect(await page.evaluate(() => matchMedia("(pointer:coarse)").matches)).toBe(touch);
        const bounds = (await list.boundingBox())!;
        expect(bounds.width).toBe(200);
        for (const name of [
          "コンパクト表示",
          "リスト表示",
          "カード表示",
          "マガジン表示",
          "ギャラリー表示",
          "記事一覧フォーカス",
        ]) {
          const button = list.getByRole("button", { name, exact: true });
          await expect(button).toBeVisible();
          const rect = (await button.boundingBox())!;
          expect(rect.x).toBeGreaterThanOrEqual(bounds.x);
          expect(rect.x + rect.width).toBeLessThanOrEqual(bounds.x + bounds.width);
          expect(rect.height).toBeGreaterThanOrEqual(touch ? 44 : 32);
          await button.focus();
          await expect(button).toBeFocused();
          if (name !== "記事一覧フォーカス") {
            await page.keyboard.press("Space");
            await expect(button).toHaveAttribute("aria-pressed", "true");
          }
        }
        await list.screenshot({ path: info.outputPath("minimum-list.png") });
      });
    });
