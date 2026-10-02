import { test, expect, type Page } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

let html = "";
const failures = new WeakMap<Page, string[]>();
test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [{ outputFiles }, css] = await Promise.all([
    build({
      entryPoints: [resolve(root, "e2e/fixtures/json-restore.tsx")],
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
  html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>${css.css}</style><style>body{margin:0;font-family:system-ui}</style><div id="root"></div><script>${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></html>`;
});

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  failures.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/*", (route) => {
    if (
      route.request().url() === "https://rss-preview.test/" &&
      route.request().isNavigationRequest() &&
      route.request().method() === "GET"
    )
      return route.fulfill({ contentType: "text/html", body: html });
    errors.push(`${route.request().method()} ${route.request().url()}`);
    return route.abort();
  });
});
test.afterEach(async ({ page }) => expect(failures.get(page)).toEqual([]));

async function open(page: Page) {
  await page.goto("https://rss-preview.test/");
  await page.getByRole("button", { name: "バックアップを開く", exact: true }).click();
  return page.getByRole("dialog", { name: "バックアップ・連携" });
}
async function file(page: Page, label: string, data: unknown, name = "backup.json") {
  await page.getByLabel(label, { exact: true }).setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
}
const notes = {
  notes: [
    { url: "https://example.test/one", note: "新しいメモ" },
    { url: "https://example.test/two", note: "置換メモ" },
    { url: "https://example.test/three", note: "同じメモ" },
    { url: "https://example.test/missing", note: "未読込" },
  ],
};

for (const [name, viewport, theme] of [
  ["mobile-light", { width: 390, height: 844 }, "light"],
  ["tablet-dark", { width: 768, height: 1024 }, "dark"],
  ["desktop-light", { width: 1440, height: 900 }, "light"],
] as const) {
  test(`reviews note conflicts, cancels and applies without overflow: ${name}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    const dialog = await open(page);
    await page.evaluate(
      (value) => document.documentElement.setAttribute("data-theme", value),
      theme,
    );
    await file(page, "メモ JSON ファイル", notes, `${"長い名前".repeat(25)}.json`);
    const preview = page.getByRole("region", { name: "JSON 復元プレビュー" });
    await expect(preview).toBeVisible();
    await expect(preview.getByRole("heading")).toBeFocused();
    await expect(
      preview.getByText("新しいメモ: 1件 / 異なる既存メモ: 1件 / 同じメモ: 1件"),
    ).toBeVisible();
    await expect(preview.getByText("読み込み済みの記事にない URL: 1件")).toBeVisible();
    expect(await page.evaluate(() => window.restoreActions)).toEqual([]);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await preview.screenshot({ path: info.outputPath(`${name}.png`) });
    await preview.getByRole("button", { name: "取込をキャンセル" }).click();
    await expect(page.getByRole("button", { name: "メモ JSON 取込" })).toBeFocused();
    expect(await page.evaluate(() => window.restoreActions)).toEqual([]);
    await file(page, "メモ JSON ファイル", notes);
    await preview.getByRole("button", { name: "メモを復元 (1件)" }).click();
    expect(await page.evaluate(() => window.restoreActions)).toEqual(["note:one:新しいメモ"]);
    await file(page, "メモ JSON ファイル", notes);
    await expect(preview.getByRole("button", { name: "メモを復元 (0件)" })).toBeDisabled();
    await preview.getByRole("checkbox", { name: "異なる既存メモも置き換える" }).check();
    await preview.getByRole("button", { name: "メモを復元 (1件)" }).click();
    expect(await page.evaluate(() => window.restoreActions)).toEqual([
      "note:one:新しいメモ",
      "note:two:置換メモ",
    ]);
  });
}

test("rechecks current bookmark membership and makes repeat imports add-only", async ({ page }) => {
  await open(page);
  const backup = {
    label: "ブックマーク",
    articles: [
      { url: "https://example.test/one" },
      { url: "https://example.test/two" },
      { url: "https://example.test/one" },
    ],
  };
  await file(page, "記事状態 JSON ファイル", backup);
  await page.evaluate(() => window.registerRestoreBookmark());
  await expect(page.getByText("追加候補: 1件 / 登録済み: 1件")).toBeVisible();
  await page.getByRole("button", { name: "ブックマークに追加 (1件)" }).click();
  expect(await page.evaluate(() => window.restoreActions)).toEqual(["bookmark:two"]);
  await file(page, "記事状態 JSON ファイル", backup);
  await expect(page.getByRole("button", { name: "ブックマークに追加 (0件)" })).toBeDisabled();
  expect(await page.evaluate(() => window.restoreActions)).toEqual(["bookmark:two"]);
});

test("shows the selected collection and skips current members and unloaded URLs", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("combobox", { name: "コレクション JSON の取り込み先" })
    .selectOption("collection");
  const backup = {
    label: "元の名前",
    articles: [
      { url: "https://example.test/one" },
      { url: "https://example.test/three" },
      { url: "https://example.test/missing" },
    ],
  };
  await file(page, "コレクション JSON ファイル", backup);
  await expect(page.getByText("取り込み先: 復元先コレクション")).toBeVisible();
  await expect(page.getByText("追加候補: 1件 / 登録済み: 1件")).toBeVisible();
  expect(await page.evaluate(() => window.restoreActions)).toEqual([]);
  await page.getByRole("button", { name: "コレクションに追加 (1件)" }).click();
  expect(await page.evaluate(() => window.restoreActions)).toEqual(["collection:collection:one"]);
  await file(page, "コレクション JSON ファイル", backup);
  await expect(page.getByRole("button", { name: "コレクションに追加 (0件)" })).toBeDisabled();
});

test("category change, Escape and reopen discard pending restoration without writes", async ({
  page,
}) => {
  await open(page);
  await file(page, "メモ JSON ファイル", notes);
  await page.getByRole("button", { name: "別カテゴリへ" }).click();
  await page.getByRole("button", { name: "バックアップに戻る" }).click();
  await expect(page.getByRole("region", { name: "JSON 復元プレビュー" })).toHaveCount(0);
  await file(page, "メモ JSON ファイル", notes);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "バックアップを開く", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "バックアップを開く", exact: true }).click();
  await expect(page.getByRole("region", { name: "JSON 復元プレビュー" })).toHaveCount(0);
  expect(await page.evaluate(() => window.restoreActions)).toEqual([]);
});

test("rechecks collection capacity without truncating the requested batch", async ({ page }) => {
  await open(page);
  await page
    .getByRole("combobox", { name: "コレクション JSON の取り込み先" })
    .selectOption("collection");
  await file(page, "コレクション JSON ファイル", {
    label: "元",
    articles: [{ url: "https://example.test/one" }, { url: "https://example.test/two" }],
  });
  await page.evaluate(() => window.fillRestoreCollection(999));
  await expect(page.getByRole("alert")).toContainText("空き1件に対して追加候補2件");
  await expect(page.getByRole("button", { name: "コレクションに追加 (2件)" })).toBeDisabled();
  expect(await page.evaluate(() => window.restoreActions)).toEqual([]);
  await page.evaluate(() => window.fillRestoreCollection(998));
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "コレクションに追加 (2件)" }).click();
  expect(await page.evaluate(() => window.restoreActions)).toEqual([
    "collection:collection:one,two",
  ]);
});

test("does not queue an import whose known notes snapshot exceeds the sync request bound", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => window.enlargeRestoreNotes());
  await file(page, "メモ JSON ファイル", {
    notes: [{ url: "https://example.test/one", note: "新規" }],
  });
  await expect(page.getByRole("alert")).toContainText("同期データの上限（512K文字）を超えています");
  await expect(page.getByRole("button", { name: "メモを復元 (1件)" })).toBeDisabled();
  expect(await page.evaluate(() => window.restoreActions)).toEqual([]);
});
