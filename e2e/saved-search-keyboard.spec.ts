import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Actual SearchBar, history and saved-search hooks; all data stays on this synthetic origin.
const fixtureUrl = "https://rss-saved-search.test/";
let html = "";
const errors = new WeakMap<Page, string[]>();

test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [{ outputFiles }, css] = await Promise.all([
    build({
      absWorkingDir: root,
      stdin: {
        resolveDir: root,
        sourcefile: "synthetic-saved-search.tsx",
        loader: "tsx",
        contents: `
          import { useRef, useState } from "react";
          import { createRoot } from "react-dom/client";
          import SearchBar from "./src/components/article-list-header/SearchBar";
          import { ArticleFilterProvider } from "./src/contexts/ArticleFilterContext";
          import { useKeyboardNav } from "./src/hooks/useKeyboardNav";
          import { makeArticle } from "./e2e/helpers/article";
          function Fixture() {
            const [rawQuery, updateQuery] = useState("");
            const [mounted, setMounted] = useState(true);
            const searchRef = useRef(null);
            const articles = ["current", "next"].map((id) => makeArticle({ id, title: id }));
            const [selected, setSelected] = useState(articles[0]);
            const [readIds, setReadIds] = useState(new Set());
            const [actions, setActions] = useState(0);
            const action = () => setActions((value) => value + 1);
            useKeyboardNav({
              filteredArticles: articles, feeds: [], pinnedFeedIds: new Set(),
              selectedFeedId: null, selectedArticle: selected, readIds,
              readBeforeTimestamp: null, readingListIds: new Set(), likeIds: new Set(),
              setSelectedArticle: setSelected, onSelectFeed: action,
              markRead: (id) => setReadIds((ids) => new Set([...ids, id])),
              markBulkRead: action, markAllRead: action, toggleBookmark: action,
              toggleRead: action, toggleReadingList: action, toggleLike: action,
              showToast: () => {}, fontSize: "medium", onChangeFontSize: action,
              fontFamily: "sans", onChangeFontFamily: action, layout: "list",
              onChangeLayout: action, unreadOnly: false, toggleUnreadOnly: action,
              bookmarkOnly: false, toggleBookmarkOnly: action, readingListOnly: false,
              toggleReadingListOnly: action, likeOnly: false, toggleLikeOnly: action,
              noteOnly: false, toggleNoteOnly: action, resetAllFilters: action,
              digestMode: false, toggleDigestMode: action, toggleSortOrder: () => "newest",
              cycleDateRange: () => "all", cycleReadingTimeRange: () => "all",
              readingTimeRange: "all", searchRef, refreshFeeds: async () => {},
              retryFeed: async () => {}, snoozeArticle: action, onShowSnoozeMenu: action,
              onShowFeedSwitcher: action, onShowReadingStats: action,
              confirm: async () => true, autoMode: false, toggleAutoMode: action,
              ttsSupported: false, cycleTtsRate: () => 1,
            });
            return <section className="fixture-controls">
              {mounted && <ArticleFilterProvider value={{ rawQuery, updateQuery, searchRef }}>
                <SearchBar />
              </ArticleFilterProvider>}
              <button onClick={() => updateQuery("title:newer")}>外から検索を変更</button>
              <button onClick={() => setMounted((value) => !value)}>検索を表示・非表示</button>
              <button>次の操作</button>
              <output aria-label="現在の検索">{rawQuery}</output>
              <output aria-label="選択中の記事">{selected.id}</output>
              <output aria-label="既読の記事">{[...readIds].join(",")}</output>
              <output aria-label="背景の操作回数">{actions}</output>
              <main aria-label="記事本文" tabIndex={0} style={{ height: 120, overflow: "auto" }}>
                <div style={{ height: 2000 }}>Synthetic article content</div>
              </main>
            </section>;
          }
          // Match Next App Router's document-level React event delegation.
          createRoot(document).render(<html lang="ja"><head>
            <meta charSet="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
            <link rel="icon" href="data:," /><style>{globalThis.fixtureCSS}</style>
          </head><body><Fixture /></body></html>);
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
  const styles = `${css.css}.fixture-controls{max-width:380px;margin:32px auto}.fixture-controls>button{display:block;margin-top:80px}`;
  html = `<!doctype html><html lang="ja"><meta charset="utf-8"><script>globalThis.fixtureCSS=${JSON.stringify(styles).replaceAll("</script", "<\\/script")};${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></html>`;
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
  await page.goto(fixtureUrl);
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(page.url()).toBe(fixtureUrl);
  await expect(page.getByLabel("選択中の記事")).toHaveText("current");
  await expect(page.getByLabel("既読の記事")).toBeEmpty();
  await expect(page.getByLabel("背景の操作回数")).toHaveText("0");
  expect(await page.getByRole("main", { name: "記事本文" }).evaluate((el) => el.scrollTop)).toBe(0);
});

async function saved(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("rss-saved-searches") ?? "[]"));
}
async function openWithPointer(page: Page, query = "title:original") {
  await page.getByRole("combobox").fill(query);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByLabel("検索を保存するための名前")).toBeFocused();
}

for (const key of ["Enter", "Space"]) {
  test(`keyboard ${key} opens Save and submits from its button after Tab`, async ({ page }) => {
    const search = page.getByRole("combobox");
    await search.fill("title:keyboard");
    await search.press("Tab");
    await expect(page.getByRole("button", { name: "保存", exact: true })).toBeFocused();
    await page.keyboard.press(key);
    const name = page.getByLabel("検索を保存するための名前");
    await expect(name).toBeFocused();
    await name.fill("Keyboard");
    await name.press("Tab");
    const submit = page.getByRole("button", { name: "保存", exact: true });
    await expect(submit).toBeFocused();
    expect(await saved(page)).toEqual([]);
    await page.keyboard.press(key);
    await expect(name).toHaveCount(0);
    await expect(search).toBeFocused();
    expect(await saved(page)).toMatchObject([{ name: "Keyboard", query: "title:keyboard" }]);
  });
}

test("Tab from the naming input preserves the editor until Save is activated", async ({ page }) => {
  await openWithPointer(page);
  const name = page.getByLabel("検索を保存するための名前");
  await name.fill("Tabbed");
  await name.press("Tab");
  await expect(page.getByRole("button", { name: "保存", exact: true })).toBeFocused();
  await expect(name).toBeVisible();
  expect(await saved(page)).toEqual([]);
});

test("Enter in the name saves once, closes, then reuses the persisted query with arrows", async ({
  page,
}) => {
  await openWithPointer(page);
  const name = page.getByLabel("検索を保存するための名前");
  await name.fill("Reusable");
  await name.press("Enter");
  await expect(name).toHaveCount(0);
  await expect(page.getByRole("combobox")).toBeFocused();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  expect(await saved(page)).toMatchObject([{ name: "Reusable", query: "title:original" }]);
  await page.reload();
  const search = page.getByRole("combobox");
  await search.focus();
  await expect(page.getByRole("option", { name: "Reusable" })).toBeVisible();
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(search).toHaveValue("title:original");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  expect(await saved(page)).toHaveLength(1);
});

test("Escape from the Save button cancels without clearing the query and can reopen", async ({
  page,
}) => {
  await openWithPointer(page);
  await page.getByLabel("検索を保存するための名前").press("Tab");
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("検索を保存するための名前")).toHaveCount(0);
  const search = page.getByRole("combobox");
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("title:original");
  expect(await saved(page)).toEqual([]);
  await search.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("検索を保存するための名前")).toBeFocused();
});

test("Cancel and outside focus dismiss without saving or stealing the destination focus", async ({
  page,
}) => {
  await openWithPointer(page);
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(page.getByRole("combobox")).toBeFocused();
  expect(await saved(page)).toEqual([]);
  await openWithPointer(page);
  const next = page.getByRole("button", { name: "次の操作", exact: true });
  await next.click();
  await expect(next).toBeFocused();
  await expect(page.getByLabel("検索を保存するための名前")).toHaveCount(0);
  expect(await saved(page)).toEqual([]);
});

test("blank names stay editable and never create saved entries", async ({ page }) => {
  await openWithPointer(page);
  const name = page.getByLabel("検索を保存するための名前");
  await name.fill("   ");
  await expect(page.getByRole("button", { name: "保存", exact: true })).toBeDisabled();
  await name.press("Enter");
  await expect(name).toBeFocused();
  expect(await saved(page)).toEqual([]);
  await name.fill("Valid");
  await name.press("Enter");
  expect(await saved(page)).toMatchObject([{ name: "Valid" }]);
});

test("pointer cancellation before release does not open or submit Save", async ({ page }) => {
  await page.getByRole("combobox").fill("title:pointer");
  let box = (await page.getByRole("button", { name: "保存", exact: true }).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await expect(page.getByLabel("検索を保存するための名前")).toHaveCount(0);
  expect(await saved(page)).toEqual([]);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByLabel("検索を保存するための名前").fill("Pointer");
  box = (await page.getByRole("button", { name: "保存", exact: true }).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect(await saved(page)).toEqual([]);
  await page.mouse.move(1, 1);
  await page.mouse.up();
  expect(await saved(page)).toEqual([]);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  expect(await saved(page)).toMatchObject([{ name: "Pointer", query: "title:pointer" }]);
});

test("repeated saves replace the same name while retaining the newest query", async ({ page }) => {
  for (const query of ["title:first", "title:second"]) {
    await openWithPointer(page, query);
    await page.getByLabel("検索を保存するための名前").fill("Same name");
    await page.getByRole("button", { name: "保存", exact: true }).click();
  }
  expect(await saved(page)).toMatchObject([{ name: "Same name", query: "title:second" }]);
  expect(await saved(page)).toHaveLength(1);
  await page.reload();
  await page.getByRole("combobox").focus();
  await page.getByRole("option", { name: "Same name" }).click();
  await expect(page.getByRole("combobox")).toHaveValue("title:second");
});

test("returning to search cancels the old editor before a newer search is saved", async ({
  page,
}) => {
  await openWithPointer(page);
  await page.getByLabel("検索を保存するための名前").fill("Discarded");
  await page.getByRole("combobox").fill("title:newer");
  await expect(page.getByLabel("検索を保存するための名前")).toHaveCount(0);
  expect(await saved(page)).toEqual([]);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByLabel("検索を保存するための名前")).toHaveValue("title:newer");
  await page.getByLabel("検索を保存するための名前").press("Enter");
  expect(await saved(page)).toMatchObject([{ name: "title:newer", query: "title:newer" }]);
});

test("unmounting an interrupted editor never saves it or restores it on remount", async ({
  page,
}) => {
  await openWithPointer(page);
  await page.getByLabel("検索を保存するための名前").fill("Abandoned");
  const toggle = page.getByRole("button", { name: "検索を表示・非表示" });
  await toggle.click();
  await toggle.click();
  await expect(page.getByLabel("検索を保存するための名前")).toHaveCount(0);
  expect(await saved(page)).toEqual([]);
  await expect(toggle).toBeFocused();
});

test.describe("mobile touch", () => {
  test.use({ hasTouch: true });
  test("saves and reuses a search without navigation", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("combobox").fill("title:mobile");
    await page.getByRole("button", { name: "保存", exact: true }).tap();
    const name = page.getByLabel("検索を保存するための名前");
    await expect(name).toBeFocused();
    await name.fill("Mobile");
    await page.screenshot({ path: testInfo.outputPath("mobile-save-editor.png") });
    await page.getByRole("button", { name: "保存", exact: true }).tap();
    expect(await saved(page)).toMatchObject([{ name: "Mobile", query: "title:mobile" }]);
    await page.getByRole("combobox").blur();
    await page.getByRole("combobox").focus();
    await page.getByRole("option", { name: "Mobile" }).tap();
    await expect(page.getByRole("combobox")).toHaveValue("title:mobile");
  });
});

test("IME confirmation leaves the form open without saving", async ({ page }) => {
  await openWithPointer(page);
  const name = page.getByLabel("検索を保存するための名前");
  await name.fill("日本語");
  for (const key of ["Enter", "Escape"]) {
    await name.dispatchEvent("keydown", { key, isComposing: true });
    await expect(name).toBeFocused();
    expect(await saved(page)).toEqual([]);
  }
  await name.press("Enter");
  expect(await saved(page)).toMatchObject([{ name: "日本語" }]);
});

for (const key of ["Enter", "Space"]) {
  test(`keyboard ${key} activates Cancel without the reader Space shortcut`, async ({ page }) => {
    await openWithPointer(page);
    await page.getByLabel("検索を保存するための名前").press("Tab");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "キャンセル", exact: true })).toBeFocused();
    await page.keyboard.press(key);
    await expect(page.getByLabel("検索を保存するための名前")).toHaveCount(0);
    await expect(page.getByRole("combobox")).toBeFocused();
    expect(await saved(page)).toEqual([]);
  });
}

test("reader Space shortcut remains available after the save editor is closed", async ({
  page,
}) => {
  await openWithPointer(page);
  await page.getByLabel("検索を保存するための名前").press("Escape");
  const reader = page.getByRole("main", { name: "記事本文" });
  await reader.focus();
  await reader.press("Space");
  await expect.poll(() => reader.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await reader.evaluate((el) => el.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => reader.evaluate((el) => el.scrollTop)).toBe(0);
});
