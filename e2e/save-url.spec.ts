import { expect, test, type Page, type Route } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const origin = "https://rss-save-url.test/";
const article = {
  id: "synthetic-saved",
  feedHash: "__saved__",
  title: "Synthetic saved article",
  link: "https://example.test/read",
  guid: "saved",
  summary: "",
  publishedAt: "2026-10-04T00:00:00Z",
  createdAt: "2026-10-04T00:00:00Z",
};
const initial = {
  readIds: ["existing-read"],
  bookmarkIds: [] as string[],
  readingListIds: [] as string[],
  likeIds: ["existing-like"],
  notes: { "existing-note": "Keep note" },
  tagIds: { "existing-tag": ["Keep tag"] },
};
let html = "";
type SaveResponse = { status?: number; body?: string; abort?: boolean; gate?: Promise<void> };
const diagnostics = new WeakMap<
  Page,
  {
    errors: string[];
    saves: string[];
    syncs: Record<string, unknown>[];
    responses: SaveResponse[];
    syncFailures: number;
  }
>();
test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [{ outputFiles }, css] = await Promise.all([
    build({
      absWorkingDir: root,
      entryPoints: [resolve(root, "e2e/fixtures/save-url.tsx")],
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
  const state = {
    errors: [] as string[],
    saves: [] as string[],
    syncs: [] as Record<string, unknown>[],
    responses: [] as SaveResponse[],
    syncFailures: 0,
  };
  diagnostics.set(page, state);
  page.on("pageerror", (error) => state.errors.push(error.message));
  let persisted = structuredClone(initial);
  await page.route("**/*", async (route: Route) => {
    const request = route.request();
    if (request.url() === origin && request.method() === "GET" && request.isNavigationRequest())
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    if (request.url() === `${origin}api/articles/save` && request.method() === "POST") {
      state.saves.push(request.postData()!);
      const response = state.responses.shift() ?? {};
      if (response.gate) await response.gate;
      if (response.abort) return route.abort("internetdisconnected");
      return route.fulfill({
        status: response.status ?? 200,
        contentType: "application/json",
        body: response.body ?? JSON.stringify(article),
        headers: { "Retry-After": "5" },
      });
    }
    if (request.url() === `${origin}api/read-state`) {
      if (request.method() === "GET") return route.fulfill({ json: persisted });
      if (request.method() === "POST") {
        const data = request.postDataJSON();
        state.syncs.push(data);
        if (state.syncFailures > 0) {
          state.syncFailures--;
          return route.fulfill({ status: 503, json: { error: "Synthetic sync failure" } });
        }
        persisted = { ...persisted, ...data };
        return route.fulfill({ json: persisted });
      }
    }
    state.errors.push(`unexpected ${request.method()} ${request.url()}`);
    await route.abort();
  });
  await page.goto(origin);
});
test.afterEach(({ page }) => expect(diagnostics.get(page)!.errors).toEqual([]));
async function open(page: Page, url = article.link) {
  await page.getByRole("button", { name: "URL を保存", exact: true }).click();
  const input = page.getByRole("textbox", { name: "保存する URL" });
  await expect(input).toBeFocused();
  await input.fill(url);
  return input;
}
for (const failure of [
  { status: 429, body: '{"error":"Synthetic throttle"}' },
  { status: 422, body: '{"error":"Synthetic saved limit"}' },
  { status: 200, body: "null" },
  { status: 200, body: "not json" },
  { abort: true },
]) {
  test(`mobile: ${JSON.stringify(failure)} keeps input and supports keyboard retry`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    const state = diagnostics.get(page)!;
    state.responses.push(failure);
    const input = await open(page);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "ブックマーク", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(input).toHaveValue(article.link);
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("成功通知数")).toHaveText("0");
    expect(state.syncs).toHaveLength(0);
    await expect(page.getByLabel("グローバルエラー通知数")).toHaveText("0");
    const bounds = await page.getByRole("dialog").boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByLabel("ブックマーク状態")).toHaveText("true");
    await expect(page.getByLabel("成功通知数")).toHaveText("1");
    await expect(page.getByRole("button", { name: "URL を保存", exact: true })).toBeFocused();
    expect(state.saves.map((body) => JSON.parse(body).url)).toEqual([article.link, article.link]);
  });
}
for (const mode of ["ブックマーク", "後で読む"]) {
  test(`${mode}: same URL twice remains added, sync failure recovers and ordinary toggle removes`, async ({
    page,
  }) => {
    const state = diagnostics.get(page)!;
    state.syncFailures = 1;
    await open(page);
    await page.getByRole("button", { name: mode, exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(() => state.syncs.length).toBe(1);
    await expect(page.getByLabel("同期状態")).toHaveText("同期待ち");
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect.poll(() => state.syncs.length).toBe(2);
    await expect(page.getByLabel("同期状態")).toHaveText("同期済み");
    expect(state.syncs[1]).toEqual(state.syncs[0]);
    await open(page);
    await page.getByRole("button", { name: mode, exact: true }).click();
    await expect(page.getByLabel(`${mode}状態`)).toHaveText("true");
    await expect(page.getByLabel("記事数")).toHaveText("1");
    await expect(page.getByLabel("成功通知数")).toHaveText("2");
    await expect.poll(() => state.syncs.length).toBe(3);
    const key = mode === "ブックマーク" ? "bookmarkIds" : "readingListIds";
    expect(state.syncs[2][key]).toEqual([article.id]);
    const removed = state.syncs[2].removedIds as Record<string, string[]>;
    expect(removed?.[key] ?? []).not.toContain(article.id);
    expect(state.syncs[2]).toMatchObject({
      readIds: ["existing-read"],
      likeIds: ["existing-like"],
      notes: initial.notes,
      tagIds: initial.tagIds,
    });
    await page.getByRole("button", { name: `通常${mode}切替` }).click();
    await expect(page.getByLabel(`${mode}状態`)).toHaveText("false");
    await expect.poll(() => state.syncs.length).toBe(4);
    expect((state.syncs[3].removedIds as Record<string, string[]>)[key]).toContain(article.id);
  });
}
for (const action of ["キャンセル", "閉じる", "Escape"]) {
  for (const failed of [false, true]) {
    test(`${action} during pending save ignores old ${failed ? "failure" : "success"} in reopened form`, async ({
      page,
    }) => {
      const state = diagnostics.get(page)!;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      state.responses.push({
        gate,
        ...(failed ? { status: 422, body: '{"error":"Old failure"}' } : {}),
      });
      await open(page);
      await page.getByRole("button", { name: "ブックマーク", exact: true }).click();
      await expect.poll(() => state.saves.length).toBe(1);
      if (action === "Escape") await page.keyboard.press("Escape");
      else await page.getByRole("button", { name: action, exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const input = await open(page, "https://example.test/new");
      const response = page.waitForResponse(`${origin}api/articles/save`);
      release();
      await (await response).finished();
      await expect(input).toHaveValue("https://example.test/new");
      await expect(input).toBeEnabled();
      await expect(page.getByRole("dialog")).toHaveCount(1);
      await expect(page.getByRole("alert")).toHaveCount(0);
      await page.getByRole("button", { name: "後で読む", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(state.saves.map((body) => JSON.parse(body).url)).toEqual([
        article.link,
        "https://example.test/new",
      ]);
    });
  }
}
test.describe("native touch", () => {
  test.use({ hasTouch: true, viewport: { width: 320, height: 740 } });
  test("touch retry keeps all controls reachable", async ({ page }) => {
    diagnostics.get(page)!.responses.push({ status: 422, body: '{"error":"Synthetic limit"}' });
    await page.getByRole("button", { name: "URL を保存", exact: true }).tap();
    const input = page.getByRole("textbox", { name: "保存する URL" });
    await input.fill(article.link);
    await page.getByRole("button", { name: "後で読む", exact: true }).tap();
    await expect(page.getByRole("alert")).toHaveText("Synthetic limit");
    await expect(input).toHaveValue(article.link);
    for (const name of ["ブックマーク", "後で読む", "キャンセル"]) {
      const bounds = await page.getByRole("button", { name, exact: true }).boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
    }
    await page.getByRole("button", { name: "後で読む", exact: true }).tap();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByLabel("後で読む状態")).toHaveText("true");
  });
});
