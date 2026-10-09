import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Real FeedViewTabs + production CSS. System font fallback, synthetic state, no live requests.
const fixtureUrl = "https://rss-feed-view-tabs.test/";
let html = "";
const errors = new WeakMap<Page, string[]>();

test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [{ outputFiles }, css] = await Promise.all([
    build({
      absWorkingDir: root,
      stdin: {
        resolveDir: root,
        sourcefile: "synthetic-feed-view-tabs.tsx",
        loader: "tsx",
        contents: `
          import { useState } from "react";
          import { createRoot } from "react-dom/client";
          import FeedViewTabs from "./src/components/feed-sidebar/FeedViewTabs";
          function Fixture() {
            const [view, setView] = useState("articles");
            const [changes, setChanges] = useState(0);
            const [drop, setDrop] = useState("");
            const [drops, setDrops] = useState(0);
            const [dragEffect, setDragEffect] = useState("");
            return <>
              <button>前の操作</button>
              <aside aria-label="サイドバー" className="font-sans bg-surface-elevated border-r border-border-default overflow-hidden" style={{width: "var(--fixture-width)"}}>
                <FeedViewTabs activeView={view} onChangeView={next => {
                  setView(next); setChanges(value => value + 1);
                }} onDropFeedOnView={(id, next) => {
                  setDrop(id + ":" + next); setDrops(value => value + 1);
                }} />
                <div id="feed-view-panel" role="tabpanel" aria-labelledby={"feed-view-tab-" + view}>Synthetic feeds</div>
              </aside>
              <button>次の操作</button>
              <div draggable data-testid="feed-source" style={{width: 140, height: 44}}
                onDragStart={event => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/x-rss-feed-id", "feed-1");
                }} onDragEnd={event => setDragEffect(event.dataTransfer.dropEffect)}>Synthetic feed</div>
              <div draggable data-testid="irrelevant-source" style={{width: 140, height: 44}}
                onDragStart={event => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", "irrelevant");
                }} onDragEnd={event => setDragEffect(event.dataTransfer.dropEffect)}>Unrelated data</div>
              <output aria-label="ドラッグ結果">{dragEffect}</output>
              <output aria-label="ビュー変更回数">{changes}</output>
              <output aria-label="ドロップ回数">{drops}</output>
              <output aria-label="ドロップ先">{drop}</output>
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

for (const theme of ["light", "dark"] as const) {
  for (const size of [
    { name: "150px minimum sidebar", viewport: { width: 1280, height: 800 }, width: 150 },
    { name: "200px default sidebar", viewport: { width: 1280, height: 800 }, width: 200 },
    { name: "220px sidebar", viewport: { width: 1280, height: 800 }, width: 220 },
    { name: "320px mobile", viewport: { width: 320, height: 568 }, width: 320 },
  ]) {
    test(`${size.name} ${theme}: readable labels, native keyboard and drag/drop`, async ({
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
      const list = page.getByRole("tablist", { name: "フィードビュー" });
      const tabs = list.getByRole("tab");
      await expect(tabs).toHaveCount(4);
      const measurements = await tabs.evaluateAll((elements) =>
        elements.map((tab) => {
          const label = tab.querySelector("span")!;
          const icon = tab.querySelector("svg")!;
          const rect = tab.getBoundingClientRect();
          const labelRect = label.getBoundingClientRect();
          const iconRect = icon.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(label);
          const textRect = range.getBoundingClientRect();
          const style = getComputedStyle(label);
          return {
            label: label.textContent,
            fontSize: parseFloat(style.fontSize),
            lineHeight: parseFloat(style.lineHeight),
            width: rect.width,
            height: rect.height,
            left: rect.left,
            right: rect.right,
            labelLeft: labelRect.left,
            labelRight: labelRect.right,
            labelTop: labelRect.top,
            labelBottom: labelRect.bottom,
            textLeft: textRect.left,
            textRight: textRect.right,
            top: rect.top,
            bottom: rect.bottom,
            iconLeft: iconRect.left,
            iconRight: iconRect.right,
            iconTop: iconRect.top,
            iconBottom: iconRect.bottom,
            iconWidth: iconRect.width,
            iconHeight: iconRect.height,
            clientWidth: tab.clientWidth,
            scrollWidth: tab.scrollWidth,
            labelClientWidth: label.clientWidth,
            labelScrollWidth: label.scrollWidth,
            whiteSpace: style.whiteSpace,
            textOverflow: style.textOverflow,
          };
        }),
      );
      expect(measurements.map(({ label }) => label)).toEqual(["記事", "画像", "動画", "SNS"]);
      const listRect = await list.boundingBox();
      expect(listRect).not.toBeNull();
      for (const [index, item] of measurements.entries()) {
        expect(item.fontSize).toBeGreaterThanOrEqual(12);
        expect(item.lineHeight).toBeGreaterThanOrEqual(16);
        // At the existing 150px resize minimum, tabs wrap rather than shrink targets.
        expect(item.width).toBeGreaterThanOrEqual(44);
        expect(item.height).toBeGreaterThanOrEqual(44);
        expect(item.labelTop).toBeGreaterThanOrEqual(item.iconBottom);
        expect(item.iconWidth).toBe(12);
        expect(item.iconHeight).toBe(12);
        expect(item.iconLeft).toBeGreaterThanOrEqual(item.left);
        expect(item.iconRight).toBeLessThanOrEqual(item.right);
        expect(item.iconTop).toBeGreaterThanOrEqual(item.top);
        expect(item.textLeft).toBeGreaterThanOrEqual(item.labelLeft);
        expect(item.textRight).toBeLessThanOrEqual(item.labelRight);
        expect(item.labelLeft).toBeGreaterThanOrEqual(item.left);
        expect(item.labelRight).toBeLessThanOrEqual(item.right);
        expect(item.labelTop).toBeGreaterThanOrEqual(item.top);
        expect(item.labelBottom).toBeLessThanOrEqual(item.bottom);
        expect(item.scrollWidth).toBeLessThanOrEqual(item.clientWidth);
        expect(item.labelScrollWidth).toBeLessThanOrEqual(item.labelClientWidth);
        expect(item.right).toBeLessThanOrEqual(listRect!.x + listRect!.width);
        expect(item.left).toBeGreaterThanOrEqual(listRect!.x);
        if (index > 0) {
          const previous = measurements[index - 1];
          if (Math.abs(item.top - previous.top) < 1)
            expect(item.left).toBeGreaterThanOrEqual(previous.right);
          else expect(item.top).toBeGreaterThanOrEqual(previous.bottom);
        }
        await expect(tabs.nth(index)).toBeVisible();
      }
      expect(
        await page
          .getByRole("complementary", { name: "サイドバー" })
          .evaluate((sidebar) => sidebar.scrollWidth <= sidebar.clientWidth),
      ).toBe(true);
      await testInfo.attach("native-label-measurements", {
        body: JSON.stringify(measurements, null, 2),
        contentType: "application/json",
      });
      await expect(tabs.nth(0)).toHaveAttribute("tabindex", "0");
      for (let index = 1; index < 4; index++)
        await expect(tabs.nth(index)).toHaveAttribute("tabindex", "-1");
      // Theme changes use the same existing200ms transition as selection.
      // Observe all exact settled colors and the underline together.
      await expect
        .poll(() =>
          tabs.nth(0).evaluate((tab) => {
            const style = getComputedStyle(tab);
            const line = getComputedStyle(tab, "::before");
            return {
              color: style.color,
              background: style.backgroundColor,
              lineWidth: line.borderBottomWidth,
              lineColor: line.borderBottomColor,
            };
          }),
        )
        .toEqual(
          theme === "light"
            ? {
                color: "rgb(15, 118, 110)",
                background: "rgb(240, 253, 250)",
                lineWidth: "3px",
                lineColor: "rgb(15, 118, 110)",
              }
            : {
                color: "rgb(94, 234, 212)",
                background: "rgb(16, 44, 43)",
                lineWidth: "3px",
                lineColor: "rgb(94, 234, 212)",
              },
        );
      await page.getByRole("button", { name: "前の操作" }).focus();
      await page.keyboard.press("Tab");
      await expect(tabs.nth(0)).toBeFocused();
      expect(await tabs.nth(0).evaluate((tab) => tab.matches(":focus-visible"))).toBe(true);
      // Existing transition-all animates the ring from transparent0px over200ms.
      // Wait for the actual CSS target instead of snapshotting the first transition frame.
      await expect(tabs.nth(0)).toHaveCSS("box-shadow", /\b2px\b/);
      await expect(tabs.nth(0)).toHaveCSS(
        "box-shadow",
        theme === "light" ? /rgb\(41, 37, 36\)/ : /rgb\(228, 228, 231\)/,
      );
      await testInfo.attach("keyboard-focus-ring", {
        body: await list.screenshot(),
        contentType: "image/png",
      });
      for (const [key, index, count] of [
        ["ArrowRight", 1, 1],
        ["End", 3, 2],
        ["ArrowRight", 0, 3],
        ["ArrowLeft", 3, 4],
        ["Home", 0, 5],
      ] as const) {
        await page.keyboard.press(key);
        await expect(tabs.nth(index)).toBeFocused();
        await expect(tabs.nth(index)).toHaveAttribute("aria-selected", "true");
        await expect(list.locator('[tabindex="0"]')).toHaveCount(1);
        await expect(page.getByLabel("ビュー変更回数")).toHaveText(String(count));
      }
      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: "次の操作" })).toBeFocused();
      await tabs.nth(2).click();
      await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
      await expect(page.getByLabel("ビュー変更回数")).toHaveText("6");
      await tabs.nth(1).evaluate((tab) => {
        const data = new DataTransfer();
        data.setData("application/x-rss-feed-id", "feed-1");
        const enter = new DragEvent("dragenter", {
          bubbles: true,
          cancelable: true,
          dataTransfer: data,
        });
        tab.dispatchEvent(enter);
      });
      await expect(tabs.nth(1)).toHaveClass(/ring-inset/);
      // Use a real HTML5 drag session: constructor DataTransfer does not carry
      // the browser's final drag operation after synthetic drop dispatch.
      await page.getByTestId("feed-source").dragTo(tabs.nth(1));
      await expect(page.getByLabel("ドラッグ結果")).toHaveText("move");
      await expect(page.getByLabel("ドロップ回数")).toHaveText("1");
      await expect(page.getByLabel("ドロップ先")).toHaveText("feed-1:pictures");
      await expect(tabs.nth(1)).not.toHaveClass(/ring-inset/);
      const refused = await tabs.nth(3).evaluate((tab) => {
        const data = new DataTransfer();
        data.setData("text/plain", "irrelevant");
        const over = new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer: data,
        });
        tab.dispatchEvent(over);
        tab.dispatchEvent(
          new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data }),
        );
        return over.defaultPrevented;
      });
      expect(refused).toBe(false);
      await page.getByTestId("irrelevant-source").dragTo(tabs.nth(3));
      await expect(page.getByLabel("ドラッグ結果")).toHaveText("none");
      await expect(tabs.nth(3)).not.toHaveClass(/ring-inset/);
      await expect(page.getByLabel("ドロップ回数")).toHaveText("1");
      await expect(page.getByLabel("ビュー変更回数")).toHaveText("6");
      await testInfo.attach("sidebar-tabs", {
        body: await list.screenshot(),
        contentType: "image/png",
      });
    });
  }
}
