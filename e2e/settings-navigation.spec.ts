import { test, expect, type Locator, type Page } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

let html = "";
interface Diagnostics {
  failures: string[];
  requests: string[];
}
const diagnostics = new WeakMap<Page, Diagnostics>();
const categories = [
  ["reading", "読書・表示"],
  ["gallery", "ギャラリー"],
  ["voice", "読み上げ"],
  ["ai", "AI・翻訳"],
  ["notifications", "通知"],
  ["feeds", "フィード管理"],
  ["storage", "保存・共有"],
  ["import-export", "バックアップ・連携"],
] as const;

test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [{ outputFiles }, css] = await Promise.all([
    build({
      entryPoints: [resolve(root, "e2e/fixtures/settings-navigation.tsx")],
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
  html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>${css.css}</style><style>body{margin:0;font-family:system-ui}</style><div id="root"></div><script>${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></html>`;
});

test.beforeEach(async ({ page }) => {
  const result: Diagnostics = { failures: [], requests: [] };
  diagnostics.set(page, result);
  page.on("pageerror", (error) => result.failures.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") result.failures.push(message.text());
  });
  await page.route("**/*", (route) => {
    const request = route.request();
    const url = request.url();
    if (
      url === "https://rss-preview.test/" &&
      request.isNavigationRequest() &&
      request.method() === "GET"
    )
      return route.fulfill({ contentType: "text/html", body: html });
    result.requests.push(`${request.method()} ${url}`);
    // Only these synthetic, read-only settings endpoints are permitted.
    // Everything else (including token issuance, AI, fulltext, subscriptions,
    // authentication, imports and config writes) is an error and is aborted.
    if (!request.isNavigationRequest() && request.method() === "GET") {
      if (url === "https://rss-preview.test/api/push/config")
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            silentStart: "22:30",
            silentEnd: "07:00",
            timezone: "Asia/Tokyo",
            errorNotificationsEnabled: true,
            recommendationEnabled: false,
            recommendationTime: "09:00",
          }),
        });
      if (url === "https://rss-preview.test/api/clip/token")
        return route.fulfill({ contentType: "application/json", body: '{"token":null}' });
    }
    result.failures.push(`${request.method()} ${url}`);
    return route.abort();
  });
});

test.afterEach(async ({ page }) => {
  expect(diagnostics.get(page)?.failures).toEqual([]);
  expect(await page.evaluate(() => window.settingsActions)).toEqual([]);
});

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "ユーザー設定を開く", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "ユーザー設定", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "閉じる", exact: true })).toBeFocused();
  return dialog;
}

async function noOverflow(page: Page, dialog: Locator) {
  expect(
    await dialog.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const scrollBody = element.lastElementChild!;
      const panel = element.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])');
      return {
        inViewport:
          bounds.left >= 0 &&
          bounds.right <= innerWidth &&
          bounds.top >= 0 &&
          bounds.bottom <= innerHeight,
        dialog: element.scrollWidth <= element.clientWidth,
        body: scrollBody.scrollWidth <= scrollBody.clientWidth,
        panel: !panel || panel.scrollWidth <= panel.clientWidth,
      };
    }),
  ).toEqual({ inViewport: true, dialog: true, body: true, panel: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function chooseCategory(dialog: Locator, id: string, label: string) {
  await dialog.getByRole("tab", { name: label, exact: true }).click();
  await expect(dialog.getByRole("tab", { name: label, exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(dialog.getByRole("tabpanel")).toHaveCount(1);
  await expect(dialog.locator(`#panel-${id}`)).toBeVisible();
}

async function focusIsUnobscured(dialog: Locator) {
  expect(
    await dialog.evaluate((element) => {
      const target = document.activeElement as HTMLElement;
      const bounds = target.getBoundingClientRect();
      const dialogBounds = element.getBoundingClientRect();
      const navigationBottom = element
        .querySelector('[role="tablist"]')!
        .getBoundingClientRect().bottom;
      return (
        bounds.top >= navigationBottom &&
        bounds.bottom <= dialogBounds.bottom &&
        bounds.left >= dialogBounds.left &&
        bounds.right <= dialogBounds.right
      );
    }),
  ).toBe(true);
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  for (const theme of ["light", "dark"]) {
    test.describe(`${viewport.width}px ${theme}`, () => {
      test.use({ viewport, contextOptions: { reducedMotion: "reduce" } });
      test("purpose categories, local search and persistent controls stay usable without writes", async ({
        page,
      }, testInfo) => {
        await page.addInitScript((value) => localStorage.setItem("rss-theme", value), theme);
        await page.goto("https://rss-preview.test/");
        const dialog = await openSettings(page);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(dialog.getByRole("tab")).toHaveCount(categories.length);
        await expect
          .poll(() => diagnostics.get(page)!.requests)
          .toContain("GET https://rss-preview.test/api/push/config");
        const requestsBeforeSearch = diagnostics.get(page)!.requests.length;
        const search = dialog.getByRole("searchbox", { name: "設定を検索", exact: true });
        await search.fill("文字サイズ");
        await expect(search).toBeFocused();
        await expect(dialog.getByRole("status")).toHaveText("1件の設定");
        await dialog.getByRole("button", { name: /^フォントサイズ 読書・表示/ }).click();
        await expect(
          dialog
            .getByRole("radiogroup", { name: "フォントサイズ", exact: true })
            .locator('[aria-checked="true"]'),
        ).toBeFocused();
        await focusIsUnobscured(dialog);
        await expect(search).toHaveValue("");
        await dialog
          .getByRole("radiogroup", { name: "フォントサイズ", exact: true })
          .getByRole("radio", { name: "大", exact: true })
          .click();
        await search.fill("　ＴＴＬ　");
        await expect(dialog.getByRole("status")).toHaveText("1件の設定");
        // Typing neither selects a category nor performs a lookup request.
        await expect(dialog.locator("#tab-reading")).toHaveAttribute("aria-selected", "true");
        await expect(search).toBeFocused();
        expect(diagnostics.get(page)!.requests.length).toBe(requestsBeforeSearch);
        await dialog.getByRole("button", { name: /^記事保持期間 保存・共有/ }).click();
        await expect(dialog.locator("#tab-storage")).toHaveAttribute("aria-selected", "true");
        await expect(
          dialog.locator('[data-setting-id="retention"] [role="radio"][aria-checked="true"]'),
        ).toBeFocused();
        await focusIsUnobscured(dialog);
        await noOverflow(page, dialog);
        await search.fill("存在しない設定あいうえお");
        await expect(dialog.getByRole("status")).toContainText("一致する設定がありません");
        await dialog.getByRole("button", { name: "設定検索をクリア", exact: true }).click();
        await expect(search).toBeFocused();
        await expect(search).toHaveValue("");
        await expect(dialog.getByRole("status")).toHaveCount(0);
        for (const [id, label] of categories) {
          await chooseCategory(dialog, id, label);
          await noOverflow(page, dialog);
          await page.screenshot({ path: testInfo.outputPath(`category-${id}.png`) });
        }
        const singleFile = dialog.getByRole("region", { name: "SingleFile 連携設定", exact: true });
        await expect(
          singleFile.getByRole("button", { name: "保存専用トークンを発行", exact: true }),
        ).toBeEnabled();
        await expect(singleFile.locator("#singlefile-token")).toHaveCount(0);
        await chooseCategory(dialog, "notifications", "通知");
        await expect(dialog.getByLabel("サイレント時間帯 開始時刻", { exact: true })).toHaveValue(
          "22:30",
        );
        await expect(dialog.getByLabel("Push 通知 タイムゾーン", { exact: true })).toHaveValue(
          "Asia/Tokyo",
        );
        // Pass the production 1-second debounce so hydration/category changes
        // cannot conceal delayed config writes.
        await page.waitForTimeout(1200);
        await chooseCategory(dialog, "gallery", "ギャラリー");
        const slider = dialog.getByRole("slider", { name: "最小画像サイズ", exact: true });
        await slider.evaluate((element) => {
          window.settingsRetainedControl = element;
        });
        // Native range inputs are keyboard controls, not fillable text inputs.
        await slider.press("Home");
        for (let step = 0; step < 10; step++) await slider.press("ArrowRight");
        await chooseCategory(dialog, "reading", "読書・表示");
        await expect(dialog.getByRole("radio", { name: "大", exact: true })).toHaveAttribute(
          "aria-checked",
          "true",
        );
        await chooseCategory(dialog, "gallery", "ギャラリー");
        expect(await slider.evaluate((element) => element === window.settingsRetainedControl)).toBe(
          true,
        );
        await expect(slider).toHaveValue("100");
        // Reveal a lower reading control after changing/scrolled gallery content.
        await search.fill("content width");
        await dialog.getByRole("button", { name: /^コンテンツ幅 読書・表示/ }).click();
        await expect(
          dialog
            .getByRole("radiogroup", { name: "コンテンツ幅", exact: true })
            .locator('[aria-checked="true"]'),
        ).toBeFocused();
        await focusIsUnobscured(dialog);
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: "ユーザー設定を開く", exact: true }),
        ).toBeFocused();
        await openSettings(page);
        await expect(dialog.getByRole("radio", { name: "大", exact: true })).toHaveAttribute(
          "aria-checked",
          "true",
        );
        await chooseCategory(dialog, "gallery", "ギャラリー");
        await expect(slider).toHaveValue("100");
        await page.reload();
        await openSettings(page);
        await expect(dialog.getByRole("radio", { name: "大", exact: true })).toHaveAttribute(
          "aria-checked",
          "true",
        );
        await chooseCategory(dialog, "gallery", "ギャラリー");
        await expect(slider).toHaveValue("100");
        expect(diagnostics.get(page)!.requests.every((request) => request.startsWith("GET "))).toBe(
          true,
        );
      });
    });
  }
}

test("category tabs support arrows, wrapping, Home and End with one keyboard stop", async ({
  page,
}) => {
  await page.goto("https://rss-preview.test/");
  const dialog = await openSettings(page);
  const tabs = dialog.getByRole("tab");
  await tabs.first().focus();
  for (const [key, id] of [
    ["ArrowRight", "gallery"],
    ["ArrowLeft", "reading"],
    ["ArrowLeft", "import-export"],
    ["ArrowRight", "reading"],
    ["End", "import-export"],
    ["Home", "reading"],
  ]) {
    await page.keyboard.press(key);
    const selected = dialog.locator(`#tab-${id}`);
    await expect(selected).toBeFocused();
    await expect(selected).toHaveAttribute("aria-selected", "true");
    await expect(dialog.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
    await expect(dialog.locator(`#panel-${id}`)).toBeVisible();
  }
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.closest('[role="tabpanel"]')?.id)).toBe(
    "panel-reading",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ユーザー設定を開く", exact: true })).toBeFocused();
});

test("nested preset dialog owns keyboard focus and Escape returns to its settings trigger", async ({
  page,
}, testInfo) => {
  await page.goto("https://rss-preview.test/");
  const dialog = await openSettings(page);
  const trigger = dialog.getByRole("button", { name: "現在の設定を保存", exact: true });
  await trigger.click();
  const nested = page.getByRole("dialog", { name: "プリセットを保存", exact: true });
  const input = nested.getByRole("textbox", { name: "プリセットを保存", exact: true });
  await expect(input).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(nested.getByRole("button", { name: "キャンセル", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(nested.getByRole("button", { name: "保存", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(input).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(nested.getByRole("button", { name: "保存", exact: true })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("nested-preset-settings.png") });
  await page.keyboard.press("Escape");
  await expect(nested).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ユーザー設定を開く", exact: true })).toBeFocused();
});

test("voice aliases focus actual controls and unavailable engines explain their destination", async ({
  page,
}) => {
  await page.goto("https://rss-preview.test/");
  const dialog = await openSettings(page);
  const search = dialog.getByRole("searchbox", { name: "設定を検索", exact: true });
  await search.fill("ＴＴＳ ＶＯＬＵＭＥ");
  await dialog.getByRole("button", { name: /^読み上げ音量 読み上げ/ }).click();
  await expect(dialog.locator("#tts-volume-slider")).toBeFocused();
  await focusIsUnobscured(dialog);
  await search.fill("TTS engine");
  await dialog.getByRole("button", { name: /^読み上げエンジン 読み上げ/ }).click();
  await expect(dialog.locator("#panel-voice")).toBeFocused();
  await expect(dialog.getByRole("status")).toContainText(
    "現在の設定やこのブラウザの対応状況によって利用できません",
  );
  await expect(dialog.locator("#tts-engine-select")).toHaveCount(0);
});

for (const direction of ["backward", "forward"] as const) {
  test(`focus trap cycles ${direction} around visible controls without hidden panels or file inputs`, async ({
    page,
  }) => {
    await page.goto("https://rss-preview.test/");
    const dialog = await openSettings(page);
    await expect
      .poll(() => diagnostics.get(page)!.requests)
      .toContain("GET https://rss-preview.test/api/push/config");
    for (const [id, label] of categories) {
      await chooseCategory(dialog, id, label);
      if (id === "import-export")
        await expect(
          dialog.getByRole("button", { name: "保存専用トークンを発行", exact: true }),
        ).toBeEnabled();
      await dialog.evaluate((element, travel) => {
        const stops = Array.from(
          element.querySelectorAll<HTMLElement>(
            "button, a[href], input, select, textarea, [tabindex]",
          ),
        ).filter(
          (control) =>
            control.tabIndex >= 0 &&
            !control.matches(":disabled") &&
            control.getClientRects().length > 0 &&
            getComputedStyle(control).visibility !== "hidden",
        );
        window.settingsRetainedControl = stops.at(-1);
        if (travel === "forward") stops.at(-1)!.focus();
      }, direction);
      const close = dialog.getByRole("button", { name: "閉じる", exact: true });
      if (direction === "backward") await close.focus();
      await page.keyboard.press(direction === "backward" ? "Shift+Tab" : "Tab");
      if (direction === "backward") {
        expect(
          await page.evaluate(() => document.activeElement === window.settingsRetainedControl),
        ).toBe(true);
      } else {
        await expect(close).toBeFocused();
      }
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
    }
  });
}

test("unsupported voice and Push results explain availability and keep Tab inside the dialog", async ({
  page,
}) => {
  await page.addInitScript(() => {
    // Model genuine platform absence before the production module checks support.
    for (const property of ["speechSynthesis", "PushManager"]) {
      let owner: object | null = window;
      while (owner && !Object.hasOwn(owner, property))
        owner = Object.getPrototypeOf(owner) as object | null;
      if (owner) Reflect.deleteProperty(owner, property);
    }
  });
  await page.goto("https://rss-preview.test/");
  const dialog = await openSettings(page);
  for (const [query, result, panel, explanation] of [
    [
      "TTS volume",
      /^読み上げ音量 読み上げ/,
      "voice",
      "このブラウザは Web Speech API に対応していない",
    ],
    [
      "silent hours 開始",
      /^開始時刻 通知/,
      "notifications",
      "このブラウザは Push 通知に対応していません",
    ],
  ] as const) {
    await dialog.getByRole("searchbox", { name: "設定を検索", exact: true }).fill(query);
    await dialog.getByRole("button", { name: result }).click();
    await expect(dialog.locator(`#panel-${panel}`)).toBeFocused();
    await expect(dialog.locator(`#panel-${panel}`)).toContainText(explanation);
    await expect(dialog.getByRole("status")).toContainText(
      "現在の設定やこのブラウザの対応状況によって利用できません",
    );
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    expect(await page.evaluate(() => document.activeElement?.closest("[hidden]"))).toBeNull();
  }
  expect(diagnostics.get(page)!.requests).toEqual([]);
});

test("visual instant and reduced-motion modes keep search focus and overflow safe", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { value: 8, configurable: true });
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 8, configurable: true });
    localStorage.setItem("rss-visual-mode", "cinema");
    localStorage.setItem("rss-visual-motion", "off");
  });
  await page.goto("https://rss-preview.test/");
  await expect(page.locator("html")).toHaveAttribute("data-visual-motion", "still");
  const dialog = await openSettings(page);
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    await page.emulateMedia({ reducedMotion });
    await dialog.getByRole("searchbox", { name: "設定を検索", exact: true }).fill("音声");
    await noOverflow(page, dialog);
    await page.screenshot({ path: testInfo.outputPath(`visual-${reducedMotion}.png`) });
    await dialog.getByRole("button", { name: /^読み上げボイス 読み上げ/ }).click();
    await expect(dialog.locator("#tts-voice-select")).toBeFocused();
    await focusIsUnobscured(dialog);
    await noOverflow(page, dialog);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ユーザー設定を開く", exact: true })).toBeFocused();
  await openSettings(page);
});
