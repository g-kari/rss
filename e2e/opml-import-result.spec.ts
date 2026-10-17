import { test, expect, type Page } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describeOpmlImportResult } from "../src/lib/opml-import-result";
import { makeFeed } from "./helpers/feed";
import type { OpmlImportResult } from "../src/types";

// Pure logic only: no page, browser, server, credentials, or real storage fixtures.
test.describe("OPML import result feedback", () => {
  for (const scenario of [
    {
      name: "success",
      counts: { added: 2, skipped: 0, failed: 0 },
      text: "2件インポートしました",
      isError: false,
    },
    {
      name: "ordinary skips are not proof of existing subscriptions",
      counts: { added: 0, skipped: 2, failed: 0 },
      text: "追加はありません（2件スキップ）",
      isError: false,
    },
    {
      name: "legacy response without failed",
      counts: { added: 0, skipped: 1 },
      text: "追加はありません（1件スキップ）",
      isError: false,
    },
    {
      name: "all metadata preparation failed",
      counts: { added: 0, skipped: 0, failed: 2 },
      text: "0件追加、0件スキップ、2件失敗しました",
      isError: true,
    },
    {
      name: "partial metadata preparation failed",
      counts: { added: 1, skipped: 2, failed: 1 },
      text: "1件追加、2件スキップ、1件失敗しました",
      isError: true,
    },
    {
      name: "success with skips",
      counts: { added: 1, skipped: 2, failed: 0 },
      text: "1件インポートしました（2件スキップ）",
      isError: false,
    },
  ]) {
    test(scenario.name, () => {
      expect(describeOpmlImportResult(scenario.counts)).toEqual({
        text: scenario.text,
        isError: scenario.isError,
      });
    });
  }
  test("empty and invalid result counts are not success", () => {
    for (const counts of [
      { added: 0, skipped: 0, failed: 0 },
      { added: -1, skipped: 1, failed: 0 },
      { added: 1, skipped: 0, failed: Number.NaN },
    ]) {
      expect(describeOpmlImportResult(counts).isError).toBe(true);
    }
  });
});

const origin = "https://rss-opml-result.test/";
const file = {
  name: "synthetic.opml",
  mimeType: "text/xml",
  buffer: Buffer.from(
    '<opml version="2.0"><body><outline xmlUrl="https://example.test/a.xml"/></body></opml>',
  ),
};
const accepted = makeFeed({
  id: "accepted-c",
  title: "Synthetic C",
  url: "https://example.test/c.xml",
});
interface ResponsePlan {
  body: OpmlImportResult | { error: string };
  status?: number;
  gate?: Promise<void>;
}
interface Diagnostics {
  errors: string[];
  posts: string[];
  responses: ResponsePlan[];
}
const diagnostics = new WeakMap<Page, Diagnostics>();
type Entry = "sidebar" | "settings";
const section = (page: Page, entry: Entry) =>
  page.getByRole("region", {
    name: entry === "sidebar" ? "サイドバーのインポート" : "設定のインポート",
  });
const input = (page: Page, entry: Entry) =>
  entry === "sidebar"
    ? section(page, entry).locator('input[type="file"]')
    : section(page, entry).locator('[data-setting-id="opml"] input');
const button = (page: Page, entry: Entry) =>
  section(page, entry).getByRole("button", { name: "OPMLインポート", exact: true });
const toast = (page: Page) => page.locator('div[role="status"][aria-live="polite"]');

async function feedback(page: Page, entry: Entry, text: string, isError: boolean) {
  if (entry === "sidebar") {
    const message = page.getByLabel("サイドバーの結果");
    await expect(message).toHaveText(text);
    await expect(message).toHaveClass(isError ? "text-error" : "text-text-muted");
  } else {
    const message = toast(page);
    await expect(message).toContainText(text);
    await expect(
      message.locator(isError ? ".border-l-rose-500" : ".border-l-emerald-500"),
    ).toHaveCount(1);
  }
  await expect(page.getByText("すべて登録済みです", { exact: true })).toHaveCount(0);
  await expect(input(page, entry)).toHaveValue("");
  await expect(button(page, entry)).toBeEnabled();
}

test.describe("OPML browser entry points", () => {
  let html = "";
  test.beforeAll(async () => {
    const root = resolve(import.meta.dirname, "..");
    const [{ outputFiles }, css] = await Promise.all([
      build({
        absWorkingDir: root,
        entryPoints: [resolve(root, "e2e/fixtures/opml-import-result.tsx")],
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
    const state: Diagnostics = { errors: [], posts: [], responses: [] };
    diagnostics.set(page, state);
    page.on("pageerror", (error) => state.errors.push(error.message));
    const now = new Date("2026-10-17T12:00:00Z");
    await page.clock.install({ time: now });
    await page.clock.pauseAt(new Date(now.valueOf() + 60_000));
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (request.url() === origin && request.method() === "GET" && request.isNavigationRequest())
        return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
      if (request.url() === `${origin}api/clip/token` && request.method() === "GET")
        return route.fulfill({ json: { token: null } });
      if (request.url() === `${origin}api/feeds/import` && request.method() === "POST") {
        state.posts.push(request.postData() ?? "");
        expect(request.headers()["content-type"]).toBe("text/xml");
        const response = state.responses.shift();
        if (!response) {
          state.errors.push("unexpected OPML import POST");
          return route.abort();
        }
        if (response.gate) await response.gate;
        return route.fulfill({ status: response.status ?? 200, json: response.body });
      }
      state.errors.push(`unexpected ${request.method()} ${request.url()}`);
      await route.abort();
    });
    await page.goto(origin);
  });
  test.afterEach(({ page }) => {
    const state = diagnostics.get(page)!;
    expect(state.errors).toEqual([]);
    expect(state.responses).toEqual([]);
    expect(state.posts.every((body) => body === file.buffer.toString())).toBe(true);
  });

  for (const width of [1280, 390]) {
    for (const entry of ["sidebar", "settings"] as const) {
      test.describe(`${width}px ${entry}`, () => {
        test.use({ viewport: { width, height: 844 } });
        test("metadata failure clears busy state and the same file can be selected again", async ({
          page,
        }, testInfo) => {
          const state = diagnostics.get(page)!;
          let release: () => void = () => {};
          const gate = new Promise<void>((resolveGate) => {
            release = resolveGate;
          });
          state.responses.push({ body: { added: 0, skipped: 0, failed: 1, feeds: [] }, gate });
          await input(page, entry).setInputFiles(file);
          await expect(button(page, entry)).toBeDisabled();
          await expect.poll(() => state.posts.length).toBe(1);
          release();
          await feedback(page, entry, "0件追加、0件スキップ、1件失敗しました", true);
          await expect(page.getByLabel("現在の購読")).toHaveText("existing-b");
          await expect(page.getByLabel("追加callback回数")).toHaveText("0");
          await page.screenshot({ path: testInfo.outputPath("opml-failed.png") });
          if (entry === "settings") await toast(page).getByLabel("閉じる").click();
          state.responses.push({ body: { added: 1, skipped: 0, failed: 0, feeds: [accepted] } });
          await input(page, entry).setInputFiles(file);
          await feedback(page, entry, "1件インポートしました", false);
          expect(state.posts).toHaveLength(2);
          await expect(page.getByLabel("追加callback回数")).toHaveText(
            entry === "sidebar" ? "1" : "0",
          );
          await expect(page.getByLabel("現在の購読")).toHaveText(
            entry === "sidebar" ? "existing-b,accepted-c" : "existing-b",
          );
        });
        test("partial success reports failures and preserves existing subscriptions", async ({
          page,
        }, testInfo) => {
          const state = diagnostics.get(page)!;
          state.responses.push({ body: { added: 1, skipped: 1, failed: 1, feeds: [accepted] } });
          await input(page, entry).setInputFiles(file);
          await feedback(page, entry, "1件追加、1件スキップ、1件失敗しました", true);
          await expect(page.getByLabel("追加callback回数")).toHaveText(
            entry === "sidebar" ? "1" : "0",
          );
          await expect(page.getByLabel("現在の購読")).toHaveText(
            entry === "sidebar" ? "existing-b,accepted-c" : "existing-b",
          );
          await page.screenshot({ path: testInfo.outputPath("opml-partial.png") });
        });
        test("ordinary duplicate skips do not claim every feed was registered", async ({
          page,
        }) => {
          diagnostics
            .get(page)!
            .responses.push({ body: { added: 0, skipped: 2, failed: 0, feeds: [] } });
          await input(page, entry).setInputFiles(file);
          await feedback(page, entry, "追加はありません（2件スキップ）", false);
          await expect(page.getByLabel("追加callback回数")).toHaveText("0");
          await expect(page.getByLabel("現在の購読")).toHaveText("existing-b");
        });
        test("an older successful server response without failed is still usable", async ({
          page,
        }) => {
          diagnostics.get(page)!.responses.push({ body: { added: 0, skipped: 1, feeds: [] } });
          await input(page, entry).setInputFiles(file);
          await feedback(page, entry, "追加はありません（1件スキップ）", false);
          await expect(page.getByLabel("追加callback回数")).toHaveText("0");
        });
        test("HTTP cooldown feedback stays an error and leaves the file input reusable", async ({
          page,
        }) => {
          diagnostics
            .get(page)!
            .responses.push({ status: 429, body: { error: "Synthetic cooldown" } });
          await input(page, entry).setInputFiles(file);
          await feedback(page, entry, "Synthetic cooldown", true);
          await expect(page.getByLabel("追加callback回数")).toHaveText("0");
          await expect(page.getByLabel("現在の購読")).toHaveText("existing-b");
        });
      });
    }
  }
});
