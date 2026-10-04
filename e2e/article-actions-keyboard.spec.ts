import { expect, test, type Locator, type Page } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Real article items and production CSS, synthetic state only; all external requests blocked.
const fixtureUrl = "https://rss-article-actions.test/";
const errors = new WeakMap<Page, string[]>();
let html = "";

test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [{ outputFiles }, css] = await Promise.all([
    build({
      absWorkingDir: root,
      stdin: {
        resolveDir: root,
        sourcefile: "synthetic-article-actions.tsx",
        loader: "tsx",
        contents: `
          import { useState, useRef } from "react";
          import { createRoot } from "react-dom/client";
          import { CompactArticleItem, ListArticleItem, CardArticleItem,
            MagazineFeaturedArticleItem, GalleryArticleItem } from "./src/components/article-items";
          import { SelectedArticleCtx } from "./src/contexts/SelectedArticleContext";
          import { makeArticle } from "./e2e/helpers/article";
          import { useArticleViewShortcuts } from "./src/hooks/useArticleViewShortcuts";
          const params = new URLSearchParams(location.hash.slice(1));
          const Item = {compact: CompactArticleItem, list: ListArticleItem, card: CardArticleItem,
            magazine: MagazineFeaturedArticleItem, gallery: GalleryArticleItem}[params.get("layout")];
          const article = makeArticle({id: "keyboard", title: "Keyboard article"});
          const image = "/api/image-proxy?url=synthetic-keyboard-image";
          function Reader({onScroll}) {
            const mainRef = useRef(null);
            useArticleViewShortcuts({article, storedContent: null, fetching: false,
              canFetchManually: false, fetchFullContent: () => {}, aiResult: null, aiLoading: false,
              doRunAi: () => {}, resetAi: () => {}, handleTranslate: () => {}, mainRef,
              autoTranslate: false, autoSummarize: false, autoAiBrowserOnly: false,
              aiPreferenceKey: "synthetic", translatorAvailable: null, summarizerAvailable: null,
              translateResult: null, translateLoading: false});
            return <div tabIndex={0} data-testid="synthetic-reader" ref={element => {
              mainRef.current = element;
              if (element) element.scrollBy = onScroll;
            }}>Connected synthetic reader</div>;
          }
          function Fixture() {
            const [state, setState] = useState({read: false, bookmark: false, later: false,
              reads: 0, bookmarks: 0, laters: 0, selections: 0, images: 0, retries: 0, scrolls: 0});
            const toggle = (field, count) => setState(s => ({...s, [field]: !s[field], [count]: s[count] + 1}));
            const count = field => setState(s => ({...s, [field]: s[field] + 1}));
            const gallery = params.get("mode") === "image" ? {
              forcedImageSrc: image, forcedImageKey: "synthetic", onSelectImage: () => count("images"),
              onHideForcedImage: () => {}, onRetry: () => count("retries")
            } : {};
            return <>
              <button>前の操作</button>
              <main className="font-sans bg-surface-elevated text-text-strong" style={{width: "min(100%, 520px)"}}>
                <SelectedArticleCtx.Provider value={article.id}>
                  <Item article={article} index={0} totalCount={1} isRead={state.read}
                    isBookmarked={state.bookmark} isInReadingList={state.later} hasNote
                    feedName="Synthetic feed" showFeedName query="" thumb={undefined}
                    onSelectArticle={() => count("selections")}
                    onToggleRead={() => toggle("read", "reads")}
                    onToggleBookmark={() => toggle("bookmark", "bookmarks")}
                    onToggleReadingList={() => toggle("later", "laters")} {...gallery} />
                </SelectedArticleCtx.Provider>
              </main>
              <button>次の操作</button>
              <output aria-label="操作結果">{JSON.stringify(state)}</output>
              <Reader onScroll={() => count("scrolls")} />
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
  html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>${css.css}</style><style>:root{--loaded-reddit-sans:system-ui;--loaded-ibm-plex-sans-jp:sans-serif}body{margin:0}</style><div id="root"></div><script>${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></html>`;
});

test.beforeEach(async ({ page }) => {
  const collected: string[] = [];
  errors.set(page, collected);
  page.on("pageerror", (error) => collected.push(error.message));
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (
      request.url().split("#")[0] === fixtureUrl &&
      request.method() === "GET" &&
      request.isNavigationRequest() &&
      request.frame() === page.mainFrame()
    ) {
      await route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    } else if (
      request.url() === fixtureUrl + "api/image-proxy?url=synthetic-keyboard-image" &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="gray"/></svg>',
      });
    } else {
      collected.push(`unexpected ${request.method()} ${request.url()}`);
      await route.abort();
    }
  });
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

async function visibleActions(button: Locator) {
  await expect
    .poll(() =>
      button.evaluate((element) => {
        const style = getComputedStyle(element.parentElement!);
        return { opacity: style.opacity, pointerEvents: style.pointerEvents };
      }),
    )
    .toEqual({ opacity: "1", pointerEvents: "auto" });
}
async function count(page: Page, key: string, expected: number) {
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByRole("status", { name: "操作結果" }).textContent()) ?? "{}")[
          key
        ],
    )
    .toBe(expected);
}

for (const theme of ["light", "dark"] as const) {
  for (const layout of ["compact", "list", "card", "magazine", "gallery"] as const) {
    test(`${layout} ${theme}: native Tab, Enter and Space activate only visible actions`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`${fixtureUrl}#layout=${layout}`);
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      const before = page.getByRole("button", { name: "前の操作" });
      const row = page.getByRole("article");
      const buttons = row.getByRole("button");
      const read = buttons.nth(0);
      await before.focus();
      await page.mouse.move(1000, 700);
      await expect
        .poll(() => read.evaluate((el) => getComputedStyle(el.parentElement!).opacity))
        .toBe("0");
      await page.keyboard.press("Tab");
      await expect(row).toBeFocused();
      await visibleActions(read);
      await page.keyboard.press("Enter");
      await count(page, "selections", 1);
      const keys = [
        "reads",
        "bookmarks",
        ...(layout === "card" || layout === "magazine" ? ["laters"] : []),
      ];
      for (const [index, key] of keys.entries()) {
        await page.keyboard.press("Tab");
        const button = buttons.nth(index);
        await expect(button).toBeFocused();
        await visibleActions(button);
        expect(await button.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
        await page.keyboard.press("Enter");
        await count(page, key, 1);
        await page.keyboard.press("Space");
        await count(page, key, 2);
        await count(page, "selections", 1);
        await count(page, "scrolls", 0);
      }
      await testInfo.attach("focused-article-actions", {
        body: await row.screenshot(),
        contentType: "image/png",
      });
      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: "次の操作" })).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(buttons.last()).toBeFocused();
      await visibleActions(read);
      await before.focus();
      await expect
        .poll(() => read.evaluate((el) => getComputedStyle(el.parentElement!).opacity))
        .toBe("0");
      await row.hover();
      await visibleActions(read);
      await read.click();
      await count(page, "reads", 3);
      await count(page, "selections", 1);
      await count(page, "scrolls", 0);
      await page.getByTestId("synthetic-reader").focus();
      await page.keyboard.press("Space");
      await count(page, "scrolls", 1);
    });

    test(`${layout} ${theme}: touch actions stay visible and tap once`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      const collected: string[] = [];
      page.on("pageerror", (error) => collected.push(error.message));
      await page.route("**/*", async (route) => {
        if (
          route.request().url().split("#")[0] === fixtureUrl &&
          route.request().method() === "GET"
        )
          await route.fulfill({ contentType: "text/html", body: html });
        else {
          collected.push(route.request().url());
          await route.abort();
        }
      });
      try {
        await page.goto(`${fixtureUrl}#layout=${layout}`);
        await page.evaluate((t) => {
          document.documentElement.dataset.theme = t;
        }, theme);
        const read = page.getByRole("button", { name: "既読にする" });
        await visibleActions(read);
        const box = await read.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
        await read.tap();
        await count(page, "reads", 1);
        await count(page, "selections", 0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        expect(collected).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
  test(`gallery ${theme}: retry/save keys do not open a forced image`, async ({ page }) => {
    await page.goto(`${fixtureUrl}#layout=gallery&mode=image`);
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    const row = page.getByRole("article");
    await row.focus();
    await page.keyboard.press("Enter");
    await count(page, "images", 1);
    const retry = row.getByRole("button", { name: "画像を展開" });
    await retry.focus();
    await expect
      .poll(() => retry.evaluate((el) => getComputedStyle(el.parentElement!).opacity))
      .toBe("1");
    await page.keyboard.press("Enter");
    await count(page, "retries", 1);
    await page.keyboard.press("Space");
    await count(page, "retries", 2);
    await row.getByRole("button", { name: "ブックマーク" }).focus();
    await page.keyboard.press("Enter");
    await count(page, "bookmarks", 1);
    await count(page, "images", 1);
    await count(page, "selections", 0);
    await count(page, "scrolls", 0);
  });
}
