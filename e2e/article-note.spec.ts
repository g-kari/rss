import { expect, test, type Page, type Route } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { mergeReadStateUpdate } from "../src/lib/read-state-merge";
import type { ReadState } from "../src/types";
const origin = "https://rss-article-note.test/";
const initial: ReadState = {
  readIds: [],
  bookmarkIds: [],
  readingListIds: [],
  likeIds: [],
  notes: { "synthetic-note": "Original note", unrelated: "Keep me" },
};
let html = "";
const diagnostics = new WeakMap<Page, { errors: string[]; syncs: Record<string, unknown>[] }>();
test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [{ outputFiles }, css] = await Promise.all([
    build({
      absWorkingDir: root,
      entryPoints: [resolve(root, "e2e/fixtures/article-note.tsx")],
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
  html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>${css.css}</style><div id="root"></div><script>${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></html>`;
});
test.beforeEach(async ({ page }) => {
  const state = { errors: [] as string[], syncs: [] as Record<string, unknown>[] };
  diagnostics.set(page, state);
  page.on("pageerror", (error) => state.errors.push(error.message));
  let persisted = structuredClone(initial);
  await page.clock.install();
  await page.route("**/*", async (route: Route) => {
    const request = route.request();
    if (request.url() === origin && request.method() === "GET" && request.isNavigationRequest())
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    if (request.url() === `${origin}api/read-state`) {
      if (request.method() === "GET") return route.fulfill({ json: persisted });
      if (request.method() === "POST") {
        const data = request.postDataJSON();
        state.syncs.push(data);
        persisted = mergeReadStateUpdate(persisted, data);
        return route.fulfill({ json: persisted });
      }
    }
    state.errors.push(`unexpected ${request.method()} ${request.url()}`);
    await route.abort();
  });
  await page.goto(origin);
  await expect(page.getByLabel("保存済みメモ")).toHaveText(JSON.stringify(initial.notes));
  await expect(page.getByLabel("同期状態")).toHaveText("同期済み");
});
test.afterEach(({ page }) => expect(diagnostics.get(page)!.errors).toEqual([]));
const textarea = (page: Page) => page.getByRole("textbox", { name: "この記事へのメモ" });
async function stored(page: Page) {
  await page.clock.runFor(100);
  return page.evaluate(() => localStorage.getItem("rss-notes"));
}
async function noCancelWrites(page: Page, before: string | null) {
  await page.clock.runFor(6000);
  await expect(page.getByLabel("保存済みメモ")).toHaveText(JSON.stringify(initial.notes));
  await expect(page.getByLabel("同期状態")).toHaveText("同期済み");
  expect(await stored(page)).toBe(before);
  expect(diagnostics.get(page)!.syncs).toEqual([]);
}
for (const width of [390, 1280]) {
  test.describe(`${width}px article notes`, () => {
    test.use({ viewport: { width, height: 850 } });
    for (const draft of ["Discarded edit", "", "   ", "Original note"]) {
      test(`Escape cancels ${JSON.stringify(draft)} without persisting or syncing`, async ({
        page,
      }) => {
        const before = await stored(page);
        await textarea(page).fill(draft);
        await textarea(page).press("Escape");
        await expect(textarea(page)).toHaveValue("Original note");
        await expect(textarea(page)).not.toBeFocused();
        await noCancelWrites(page, before);
        await textarea(page).focus();
        await textarea(page).press("Escape");
        await noCancelWrites(page, before);
      });
    }
    test("new draft is dismissed, and reopening can save normally", async ({ page }) => {
      const before = await stored(page);
      await page.getByRole("button", { name: "メモのない記事" }).click();
      await page.getByRole("button", { name: "メモを編集" }).click();
      await textarea(page).fill("Discard new");
      await textarea(page).press("Escape");
      await expect(textarea(page)).toHaveCount(0);
      await noCancelWrites(page, before);
      await page.getByRole("button", { name: "メモを編集" }).click();
      await textarea(page).fill("New note");
      await textarea(page).press("b");
      await expect(page.getByLabel("ショートカット回数")).toHaveText("0");
      await page.getByRole("button", { name: "外へ移動" }).click();
      await page.clock.runFor(6000);
      expect(diagnostics.get(page)!.syncs).toHaveLength(1);
      expect(diagnostics.get(page)!.syncs[0].notes).toEqual({
        ...initial.notes,
        "new-note": "New noteb",
      });
    });
    test("re-edit after Escape supports multiline Enter and ordinary deletion", async ({
      page,
    }) => {
      await textarea(page).fill("Discard edit");
      await textarea(page).press("Escape");
      await textarea(page).fill("First");
      await textarea(page).press("Enter");
      await textarea(page).pressSequentially("Second");
      await expect(textarea(page)).toBeFocused();
      expect(diagnostics.get(page)!.syncs).toEqual([]);
      await page.getByRole("button", { name: "外へ移動" }).click();
      await page.clock.runFor(6000);
      expect(diagnostics.get(page)!.syncs[0].notes).toEqual({
        unrelated: "Keep me",
        "synthetic-note": "First\nSecond",
      });
      await textarea(page).fill("   ");
      await page.getByRole("button", { name: "外へ移動" }).click();
      await page.clock.runFor(6000);
      expect(diagnostics.get(page)!.syncs).toHaveLength(2);
      const deletion = diagnostics.get(page)!.syncs[1];
      expect(deletion.notes).toEqual({ unrelated: "Keep me" });
      expect((deletion.removedIds as { notes: string[] }).notes).toContain("synthetic-note");
      await expect(textarea(page)).toHaveValue("   ");
    });
    test("IME Escape keeps the draft and focus, ordinary Escape then cancels", async ({ page }) => {
      const before = await stored(page);
      await textarea(page).fill("変換中のメモ");
      for (const ime of [{ isComposing: true }, { keyCode: 229 }]) {
        await textarea(page).evaluate(
          (element, init) =>
            element.dispatchEvent(
              new KeyboardEvent("keydown", { key: "Escape", bubbles: true, ...init }),
            ),
          ime,
        );
        await expect(textarea(page)).toBeFocused();
        await expect(textarea(page)).toHaveValue("変換中のメモ");
      }
      await textarea(page).press("Escape");
      await noCancelWrites(page, before);
    });
  });
}
