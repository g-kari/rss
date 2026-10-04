import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Production header + mode hook + CSS, synthetic state only. No login or live content.
const fixtureUrl = "https://rss-nsfw-exit.test/";
let html = "";
const errors = new WeakMap<Page, string[]>();

test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [{ outputFiles }, css] = await Promise.all([
    build({
      absWorkingDir: root,
      stdin: {
        resolveDir: root,
        sourcefile: "synthetic-nsfw-exit.tsx",
        loader: "tsx",
        contents: `
          import { useState } from "react";
          import { createRoot } from "react-dom/client";
          import SidebarHeader from "./src/components/feed-sidebar/SidebarHeader";
          import FeedViewTabs from "./src/components/feed-sidebar/FeedViewTabs";
          import { useNSFWMode } from "./src/hooks/useNSFWMode";
          import { STORAGE_KEYS } from "./src/lib/storage";
          if (localStorage.getItem(STORAGE_KEYS.NSFW_MODE) === null) {
            localStorage.setItem(STORAGE_KEYS.NSFW_MODE, "1");
          }
          function Fixture() {
            const mode = useNSFWMode();
            const [exits, setExits] = useState(0);
            const [activations, setActivations] = useState(0);
            const [inputOpen, setInputOpen] = useState(false);
            const [refreshes, setRefreshes] = useState(0);
            const [view, setView] = useState("articles");
            const [online, setOnline] = useState(true);
            return <>
              <button>前の操作</button>
              <aside aria-label="サイドバー" className="font-sans bg-surface-elevated border-r border-border-default" style={{width: "var(--fixture-width)"}}>
                <SidebarHeader nsfwMode={mode.nsfwMode} inputOpen={inputOpen}
                  refreshing={false} isOnline={online}
                  onActivateNsfw={() => { setActivations(n => n + 1); mode.activateNSFW(); }}
                  onDeactivateNsfw={() => { setExits(n => n + 1); mode.deactivateNSFW(); }}
                  onToggleInput={() => setInputOpen(v => !v)}
                  onRefresh={() => setRefreshes(n => n + 1)} />
                {inputOpen && <input aria-label="合成フィードURL" />}
                <FeedViewTabs activeView={view} onChangeView={setView} />
                <div id="feed-view-panel" role="tabpanel" aria-labelledby={"feed-view-tab-" + view}>Synthetic feed</div>
              </aside>
              <button>次の操作</button>
              <button onClick={mode.onNSFWAnimationComplete}>合成モードを有効化</button>
              <button onClick={() => setOnline(v => !v)}>合成オンライン切替</button>
              <output aria-label="モード">{String(mode.nsfwMode)}</output>
              <output aria-label="有効化演出">{String(mode.showNSFWAnimation)}</output>
              <output aria-label="解除回数">{exits}</output>
              <output aria-label="有効化操作回数">{activations}</output>
              <output aria-label="更新回数">{refreshes}</output>
              <output aria-label="ビュー">{view}</output>
              <div style={{height: 1500}}>Synthetic selected article remains open</div>
            </>;
          }
          createRoot(document.getElementById("root")).render(<Fixture />);
        `,
      },
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
  html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>${css.css}</style><style>:root{--loaded-reddit-sans:system-ui;--loaded-ibm-plex-sans-jp:sans-serif;--fixture-width:220px}body{margin:0}</style><div id="root"></div><script>${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></html>`;
});

test.beforeEach(async ({ page }) => {
  const collected: string[] = [];
  errors.set(page, collected);
  page.on("pageerror", (error) => collected.push(error.message));
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (
      request.url() === fixtureUrl &&
      request.method() === "GET" &&
      request.isNavigationRequest() &&
      request.frame() === page.mainFrame()
    ) {
      await route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    } else {
      collected.push(`unexpected ${request.method()} ${request.url()}`);
      await route.abort();
    }
  });
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

async function checkExit(page: Page, exits: number) {
  await expect(page.getByLabel("モード", { exact: true })).toHaveText("false");
  await expect(page.getByLabel("有効化演出")).toHaveText("false");
  await expect(page.getByLabel("解除回数")).toHaveText(String(exits));
  await expect(page.getByRole("button", { name: "NSFWモード解除", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("rss-nsfw-mode"))).toBe("0");
}

for (const theme of ["light", "dark"] as const) {
  for (const size of [
    { name: "150px minimum", viewport: { width: 1280, height: 800 }, width: 150 },
    { name: "200px default", viewport: { width: 1280, height: 800 }, width: 200 },
    { name: "220px sidebar", viewport: { width: 1280, height: 800 }, width: 220 },
    { name: "320px mobile", viewport: { width: 320, height: 568 }, width: 320 },
  ]) {
    test(`${size.name} ${theme}: named exit fits, native Tab/Enter/Space and navigation`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(size.viewport);
      await page.goto(fixtureUrl);
      await page.evaluate(
        ({ theme, width }) => {
          document.documentElement.dataset.theme = theme;
          document.documentElement.style.setProperty("--fixture-width", `${width}px`);
        },
        { theme, width: size.width },
      );
      const exit = page.getByRole("button", { name: "NSFWモード解除", exact: true });
      await expect(exit).toBeVisible();
      const measurement = await exit.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const aside = button.closest("aside")!;
        const bounds = aside.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(button);
        const text = range.getBoundingClientRect();
        const style = getComputedStyle(button);
        return {
          width: rect.width,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          asideLeft: bounds.left,
          asideRight: bounds.right,
          textLeft: text.left,
          textRight: text.right,
          textTop: text.top,
          textBottom: text.bottom,
          top: rect.top,
          bottom: rect.bottom,
          scrollWidth: button.scrollWidth,
          clientWidth: button.clientWidth,
          asideScrollWidth: aside.scrollWidth,
          asideClientWidth: aside.clientWidth,
          fontSize: parseFloat(style.fontSize),
          lineHeight: parseFloat(style.lineHeight),
        };
      });
      expect(measurement.width).toBeGreaterThanOrEqual(44);
      expect(measurement.height).toBeGreaterThanOrEqual(44);
      expect(measurement.fontSize).toBeGreaterThanOrEqual(12);
      expect(measurement.lineHeight).toBeGreaterThanOrEqual(16);
      expect(measurement.left).toBeGreaterThanOrEqual(measurement.asideLeft);
      expect(measurement.right).toBeLessThanOrEqual(measurement.asideRight);
      expect(measurement.textLeft).toBeGreaterThanOrEqual(measurement.left);
      expect(measurement.textRight).toBeLessThanOrEqual(measurement.right);
      expect(measurement.textTop).toBeGreaterThanOrEqual(measurement.top);
      expect(measurement.textBottom).toBeLessThanOrEqual(measurement.bottom);
      expect(measurement.scrollWidth).toBeLessThanOrEqual(measurement.clientWidth);
      expect(measurement.asideScrollWidth).toBeLessThanOrEqual(measurement.asideClientWidth);
      await testInfo.attach("native-layout.json", {
        body: JSON.stringify(measurement, null, 2),
        contentType: "application/json",
      });
      await page.getByRole("button", { name: "前の操作" }).focus();
      for (const name of ["RSS", "フィードを追加", "フィードを更新", "NSFWモード解除"]) {
        await page.keyboard.press("Tab");
        await expect(page.getByRole("button", { name, exact: true })).toBeFocused();
      }
      expect(await exit.evaluate((button) => getComputedStyle(button).outlineStyle)).not.toBe(
        "none",
      );
      await page.screenshot({ path: testInfo.outputPath("active-focused.png") });
      await page.keyboard.press("Enter");
      await checkExit(page, 1);
      await expect(page.getByRole("group", { name: "サイドバー操作" })).toBeFocused();
      for (let i = 0; i < 6; i++) await page.keyboard.press("Enter");
      await expect(page.getByLabel("有効化操作回数")).toHaveText("0");
      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: "RSS", exact: true })).toBeFocused();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      await expect(page.getByRole("textbox", { name: "合成フィードURL" })).toBeVisible();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Space");
      await expect(page.getByLabel("更新回数")).toHaveText("1");
      const pictures = page.getByRole("tab", { name: "画像", exact: true });
      await pictures.click();
      await expect(pictures).toHaveAttribute("aria-selected", "true");
      await page.getByRole("button", { name: "合成モードを有効化" }).click();
      await exit.focus();
      await page.keyboard.press("Space");
      await checkExit(page, 2);
      await expect(page.getByRole("group", { name: "サイドバー操作" })).toBeFocused();
      await page.screenshot({ path: testInfo.outputPath("mode-off.png") });
      await page.reload();
      await checkExit(page, 0);
      const logo = page.getByRole("button", { name: "RSS", exact: true });
      for (let i = 0; i < 4; i++) await logo.click();
      await expect(page.getByLabel("有効化演出")).toHaveText("false");
      await logo.click();
      await expect(page.getByLabel("有効化演出")).toHaveText("true");
      await expect(page.getByLabel("モード", { exact: true })).toHaveText("false");
    });
  }
}

test.describe("native touch", () => {
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true });
  test("tap exit is immediate and available offline; repeat does not activate", async ({
    page,
  }) => {
    await page.goto(fixtureUrl);
    await page.getByRole("button", { name: "合成オンライン切替" }).tap();
    const exit = page.getByRole("button", { name: "NSFWモード解除", exact: true });
    await expect(exit).toBeEnabled();
    await exit.tap();
    await checkExit(page, 1);
    await page.keyboard.press("Space");
    await expect(page.getByLabel("有効化操作回数")).toHaveText("0");
    await page.reload();
    await checkExit(page, 0);
  });
});

test("native long press still exits and does not send its release click to activation", async ({
  page,
}) => {
  await page.goto(fixtureUrl);
  const logo = page.getByRole("button", { name: "RSS", exact: true });
  const bounds = await logo.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  await expect(page.getByLabel("解除回数")).toHaveText("1");
  await page.mouse.up();
  await checkExit(page, 1);
  await expect(page.getByLabel("有効化操作回数")).toHaveText("0");
  await logo.click();
  await expect(page.getByLabel("有効化操作回数")).toHaveText("1");
});
