import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Production FeedItem, portals, both reader/global shortcut hooks and CSS.
// React delegates at document as in the app. All state and requests are synthetic.
const fixtureUrl = "https://rss-feed-menu.test/";
const errors = new WeakMap<Page, string[]>();
let html = "";

test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [{ outputFiles }, css] = await Promise.all([
    build({
      absWorkingDir: root,
      stdin: {
        resolveDir: root,
        sourcefile: "synthetic-feed-menu.tsx",
        loader: "tsx",
        contents: `
          import { useEffect, useRef, useState } from "react";
          import { createRoot } from "react-dom/client";
          import FeedItem from "./src/components/feed-item/FeedItemComponent";
          import { ToastProvider } from "./src/contexts/ToastContext";
          import { useKeyboardNav } from "./src/hooks/useKeyboardNav";
          import { useArticleViewShortcuts } from "./src/hooks/useArticleViewShortcuts";
          import { makeFeed } from "./e2e/helpers/feed";
          import { makeKeyboardNavFixture } from "./e2e/helpers/keyboard-nav-fixture";
          const keyboard = makeKeyboardNavFixture();
          const noop = () => {};
          const toast = {toasts: [], success: noop, error: noop, info: noop, undo: noop, dismiss: noop};
          function Fixture() {
            const [state, setState] = useState({selections: 0, articleSelections: 0,
              selectedArticle: keyboard.selectedArticle.id, pins: 0, reads: 0, retries: 0,
              mutes: 0, views: 0, digests: 0, groups: 0, scrolls: 0, triggerClicks: 0, menuClicks: 0});
            const count = field => setState(s => ({...s, [field]: s[field] + 1}));
            const mainRef = useRef(null);
            useKeyboardNav({...keyboard,
              onSelectFeed: () => count("selections"),
              setSelectedArticle: article => setState(s => ({...s,
                articleSelections: s.articleSelections + 1, selectedArticle: article?.id ?? null}))});
            useArticleViewShortcuts({article: keyboard.selectedArticle, storedContent: null, fetching: false,
              canFetchManually: false, fetchFullContent: noop, aiResult: null, aiLoading: false,
              doRunAi: noop, resetAi: noop, handleTranslate: noop, mainRef,
              autoTranslate: false, autoSummarize: false, autoAiBrowserOnly: false,
              aiPreferenceKey: "synthetic", translatorAvailable: null, summarizerAvailable: null,
              translateResult: null, translateLoading: false});
            useEffect(() => {
              const click = event => {
                const button = event.target.closest("button");
                if (button?.getAttribute("aria-label") === "操作メニューを開く") count("triggerClicks");
                if (button?.getAttribute("role")?.startsWith("menuitem")) count("menuClicks");
              };
              document.addEventListener("click", click, true);
              return () => document.removeEventListener("click", click, true);
            }, []);
            return <html lang="ja"><head><meta charSet="utf-8" />
              <meta name="viewport" content="width=device-width,initial-scale=1" />
              <link rel="icon" href="data:," />
              <style dangerouslySetInnerHTML={{__html: window.fixtureStyles}} />
            </head><body className="font-sans bg-surface-base text-text-strong">
              <button>前の操作</button>
              <aside style={{width: 280}}><ToastProvider value={toast}>
                <FeedItem feed={makeFeed({title: "Keyboard feed"})} count={3}
                  isSelected isPinned={false} animationIndex={0}
                  onSelect={() => count("selections")} onMarkAllRead={() => count("reads")}
                  onDelete={noop} onTogglePin={() => count("pins")} onRename={async () => {}}
                  onRetry={async () => count("retries")} onMute={async () => count("mutes")}
                  onSetView={async () => count("views")} onSetDigestLimit={async () => count("digests")}
                  onSetGroup={async () => count("groups")}
                  groups={[{id: "synthetic-group", name: "Synthetic group", order: 0,
                    createdAt: "2026-10-10T00:00:00Z"}]} />
              </ToastProvider></aside>
              <button>次の操作</button>
              <output aria-label="操作結果">{JSON.stringify(state)}</output>
              <main tabIndex={0} aria-label="記事本文" ref={element => {
                mainRef.current = element;
                if (element) element.scrollBy = () => count("scrolls");
              }}>Connected synthetic reader</main>
            </body></html>;
          }
          createRoot(document).render(<Fixture />);
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
  const styles = `${css.css}\n:root{--loaded-reddit-sans:system-ui;--loaded-ibm-plex-sans-jp:sans-serif}body{margin:0}`;
  html = `<!doctype html><html><head><link rel="icon" href="data:,"></head><body><script>window.fixtureStyles=${JSON.stringify(styles).replaceAll("</script", "<\\/script")};${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></body></html>`;
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

async function unchangedReader(page: Page, selections: number) {
  await count(page, "selections", selections);
  await count(page, "articleSelections", 0);
  await count(page, "scrolls", 0);
  await expect(page.getByRole("status", { name: "操作結果" })).toContainText(
    '"selectedArticle":"synthetic-selected"',
  );
}

for (const theme of ["light", "dark"] as const) {
  for (const key of ["Enter", "Space"] as const) {
    test(`${theme} ${key}: native feed/menu activation with document delegation`, async ({
      page,
    }, testInfo) => {
      await page.goto(fixtureUrl);
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      const row = page.getByRole("button", { name: "Keyboard feed", exact: true });
      const trigger = page.getByRole("button", { name: "操作メニューを開く" });
      const menu = page.getByRole("menu", { name: "フィード操作メニュー" });
      await page.getByRole("button", { name: "前の操作" }).focus();
      await page.mouse.move(1000, 700);
      await page.keyboard.press("Tab");
      await expect(row).toBeFocused();
      await page.keyboard.press(key);
      await unchangedReader(page, 1);
      await page.keyboard.press("Tab");
      await expect(trigger).toBeFocused();
      await expect.poll(() => trigger.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
      await page.keyboard.press(key);
      await expect(menu).toBeVisible();
      await count(page, "triggerClicks", 1);
      await unchangedReader(page, 1);
      await expect(menu.getByRole("menuitem").first()).toBeFocused();
      await testInfo.attach("keyboard-feed-menu", {
        body: await menu.screenshot(),
        contentType: "image/png",
      });
      await page.keyboard.press("Shift+Tab");
      await expect(menu.getByRole("menuitem").last()).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(menu.getByRole("menuitem").first()).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      let clicks = 0;
      for (const [label, field] of [
        ["ピン留め", "pins"],
        ["全て既読", "reads"],
        ["更新", "retries"],
      ]) {
        await trigger.focus();
        await page.keyboard.press(key);
        const item = menu.getByRole("menuitem", { name: label, exact: true });
        await item.focus();
        await page.keyboard.press(key);
        await count(page, field, 1);
        await count(page, "menuClicks", ++clicks);
        await expect(menu).toHaveCount(0);
        await unchangedReader(page, 1);
      }
      for (const [action, name, choice, field] of [
        ["ミュート", "ミュート期間", "1時間", "mutes"],
        ["表示: 記事", "表示カテゴリ", "画像", "views"],
        ["ダイジェスト: デフォルト", "ダイジェスト件数", "5件", "digests"],
        ["グループに移動", "グループに移動", "Synthetic group", "groups"],
      ]) {
        await trigger.focus();
        await page.keyboard.press(key);
        await menu.getByRole("menuitem", { name: action, exact: true }).focus();
        await page.keyboard.press(key);
        await count(page, "menuClicks", ++clicks);
        const submenu = page.getByRole("menu", { name, exact: true });
        await expect(submenu).toBeVisible();
        await submenu
          .getByRole(field === "mutes" ? "menuitem" : "menuitemradio", {
            name: choice,
            exact: true,
          })
          .focus();
        await page.keyboard.press(key);
        await count(page, field, 1);
        await count(page, "menuClicks", ++clicks);
        await expect(submenu).toHaveCount(0);
        await unchangedReader(page, 1);
      }
      // Pointer opening remains independent, and the reader still owns Space.
      await trigger.click();
      await expect(menu).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await unchangedReader(page, 1);
      await page.getByRole("main", { name: "記事本文" }).focus();
      await page.keyboard.press("Space");
      await count(page, "scrolls", 1);
    });
  }
}
