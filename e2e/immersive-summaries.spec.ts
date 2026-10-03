import { test, expect, type Locator, type Page, type Route } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AI_MODELS, DEFAULT_AI_MODEL, type WorkersAiModelId } from "../src/lib/ai-models";
import {
  MAX_SUMMARY_CACHE_URLS,
  type CachedSummary,
  type SummaryCacheResponse,
  type SummaryMetadata,
} from "../src/lib/ai-summary-contract";
import type { SummaryFixtureControls } from "./fixtures/immersive-summaries";

const origin = "https://rss-summary.test";
const articleUrl = (index: number) => `https://example.com/summary-fixture/${index}`;
const knownUrls = new Set(Array.from({ length: 23 }, (_, index) => articleUrl(index)));
const modelB: WorkersAiModelId = "@cf/google/gemma-4-26b-a4b-it";
const cachedText = (url: string, model = DEFAULT_AI_MODEL) =>
  `保存済み要約 ${Number(url.split("/").at(-1)) + 1}。${model === modelB ? "別モデルの" : "選択モデルの"}保存済み結果を表示します。新しい要約処理は行いません。`;
const feedText = (index: number) => `フィード説明 ${index + 1}`;
const summaryDialog = (page: Page) => page.getByRole("dialog", { name: "保存済みのAI要約" });
const summaryButton = (page: Page) =>
  page.getByRole("button", { name: "保存済みAI要約を確認", exact: true });
const position = (page: Page) => page.locator(".immersive-navigation [role=status]");
const activeSlide = (page: Page) => page.locator(".immersive-slide:not([inert])");
const transcript = (page: Page) => activeSlide(page).locator(".cinematic-transcript");
const next = (page: Page) => page.getByRole("button", { name: "次の記事", exact: true });
const previous = (page: Page) => page.getByRole("button", { name: "前の記事", exact: true });
const progress = (page: Page) => activeSlide(page).locator(".cinematic-progress span");

interface CacheRequest {
  urls: string[];
  model: WorkersAiModelId;
}
interface PendingCache {
  route: Route;
  request: CacheRequest;
}
interface Diagnostics {
  rejected: string[];
  errors: string[];
  requests: CacheRequest[];
  pending: PendingCache[];
  behavior: "hit" | "mixed" | "error" | "deferred";
  allowedContent: Set<string>;
  content: string[];
  ogp: string[];
  makeHit: (url: string, model: WorkersAiModelId) => CachedSummary;
}
interface SpeechState {
  spoken: string[];
  cancels: number;
  pauses: number;
  resumes: number;
  browserAiCalls: number;
}
const diagnostics = new WeakMap<Page, Diagnostics>();
let html = "";

function metadata(model: WorkersAiModelId, values: Partial<SummaryMetadata> = {}): SummaryMetadata {
  return {
    version: 1,
    model,
    promptVersion: "summary-fixture-v1",
    bodyHash: "a".repeat(64),
    generatedAt: "2026-10-01T12:00:00Z",
    inputCharacters: 2400,
    inputTruncated: false,
    completeness: "unknown",
    usage: { inputTokens: 100, outputTokens: 40 },
    ...values,
  };
}
function makeHit(url: string, model: WorkersAiModelId): CachedSummary {
  return { url, result: cachedText(url, model), metadata: metadata(model) };
}
function response(state: Diagnostics, request: CacheRequest): SummaryCacheResponse {
  return {
    model: request.model,
    summaries: request.urls
      .filter(
        (url) => state.behavior !== "mixed" || (url !== articleUrl(1) && url !== articleUrl(2)),
      )
      .map((url) => state.makeHit(url, request.model)),
  };
}
async function release(page: Page, predicate: (request: CacheRequest) => boolean = () => true) {
  const state = diagnostics.get(page)!;
  const ready = state.pending.filter(({ request }) => predicate(request));
  state.pending = state.pending.filter(({ request }) => !predicate(request));
  expect(
    ready.length,
    "A deferred request must exist before its response is released",
  ).toBeGreaterThan(0);
  await Promise.all(
    ready.map(({ route, request }) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(response(state, request)),
      }),
    ),
  );
}

test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [{ outputFiles }, css] = await Promise.all([
    build({
      entryPoints: [resolve(root, "e2e/fixtures/immersive-summaries.tsx")],
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
  html = `<!doctype html><html lang="ja"><meta charset="utf-8"><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css.css}</style><style>body{font-family:system-ui,sans-serif}</style><div id="root"></div><script>${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></html>`;
});

test.beforeEach(async ({ page }) => {
  const state: Diagnostics = {
    rejected: [],
    errors: [],
    requests: [],
    pending: [],
    behavior: "hit",
    allowedContent: new Set(),
    content: [],
    ogp: [],
    makeHit,
  };
  diagnostics.set(page, state);
  page.on("pageerror", (error) => state.errors.push(error.message));
  // This allowlist is intentionally fail-closed. Cache reads are the only permitted AI endpoint.
  await page.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const mainFrame = request.frame() === page.mainFrame();
    const allowedCases = [
      null,
      "browser",
      "auto",
      "no-settings",
      "no-account",
      "no-auth",
      "unusable-auth",
      "wrong-user",
      "long-fallback",
    ];
    if (
      request.method() === "GET" &&
      request.isNavigationRequest() &&
      mainFrame &&
      request.resourceType() === "document" &&
      url.origin === origin &&
      url.pathname === "/" &&
      [...url.searchParams.keys()].every((key) => key === "case" || key === "theme") &&
      allowedCases.includes(url.searchParams.get("case")) &&
      [null, "light", "dark"].includes(url.searchParams.get("theme"))
    )
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    if (
      request.method() === "POST" &&
      !request.isNavigationRequest() &&
      mainFrame &&
      ["fetch", "xhr"].includes(request.resourceType()) &&
      url.origin === origin &&
      url.pathname === "/api/ai/summaries/cache" &&
      !url.search
    ) {
      let body: unknown;
      try {
        body = request.postDataJSON();
      } catch {
        state.rejected.push(`Malformed cache JSON: ${request.postData()}`);
        return route.abort();
      }
      const candidate = body as Partial<CacheRequest> | null;
      if (
        !candidate ||
        Object.keys(candidate).sort().join(",") !== "model,urls" ||
        !AI_MODELS.some(({ id }) => id === candidate.model) ||
        !Array.isArray(candidate.urls) ||
        candidate.urls.length === 0 ||
        candidate.urls.length > MAX_SUMMARY_CACHE_URLS ||
        new Set(candidate.urls).size !== candidate.urls.length ||
        candidate.urls.some((value) => !knownUrls.has(value))
      ) {
        state.rejected.push(
          `Invalid bounded/model-explicit cache request: ${JSON.stringify(body)}`,
        );
        return route.abort();
      }
      const cacheRequest = candidate as CacheRequest;
      state.requests.push(cacheRequest);
      if (state.behavior === "deferred") {
        state.pending.push({ route, request: cacheRequest });
        return;
      }
      if (state.behavior === "error")
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: '{"error":"synthetic cache unavailable"}',
        });
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(response(state, cacheRequest)),
      });
    }
    if (
      state.allowedContent.has(url.searchParams.get("url") || "") &&
      request.method() === "GET" &&
      !request.isNavigationRequest() &&
      mainFrame &&
      ["fetch", "xhr"].includes(request.resourceType()) &&
      url.origin === origin &&
      (url.pathname === "/api/content" || url.pathname === "/api/ogp") &&
      [...url.searchParams.keys()].length === 1 &&
      url.searchParams.has("url") &&
      knownUrls.has(url.searchParams.get("url")!)
    ) {
      if (url.pathname === "/api/ogp") {
        const article = url.searchParams.get("url")!;
        if (state.ogp.includes(article)) {
          state.rejected.push(`Repeated explicit-body OGP: ${article}`);
          return route.abort();
        }
        state.ogp.push(article);
        return route.fulfill({ contentType: "application/json", body: "{}" });
      }
      state.content.push(url.searchParams.get("url")!);
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          content: "<p>明示操作で取得した本文です。合成記事だけを表示します。</p>",
        }),
      });
    }
    state.rejected.push(`${request.method()} ${url.href}`);
    return route.abort();
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { value: 2, configurable: true });
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 2, configurable: true });
    const counters: SpeechState = {
      spoken: [],
      cancels: 0,
      pauses: 0,
      resumes: 0,
      browserAiCalls: 0,
    };
    let current: SpeechSynthesisUtterance | null = null;
    const browserAi = {
      availability() {
        counters.browserAiCalls++;
        return Promise.resolve("available");
      },
      create() {
        counters.browserAiCalls++;
        return Promise.reject(new Error("Browser AI is prohibited in cache-only fixtures"));
      },
    };
    for (const api of ["Summarizer", "Translator", "LanguageModel"])
      Object.defineProperty(window, api, { value: browserAi, configurable: true });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: () => [
          {
            name: "Synthetic local Japanese",
            lang: "ja-JP",
            voiceURI: "synthetic-ja",
            localService: true,
          },
        ],
        addEventListener() {},
        removeEventListener() {},
        cancel() {
          counters.cancels++;
          current = null;
        },
        pause() {
          counters.pauses++;
        },
        resume() {
          counters.resumes++;
        },
        speak(utterance: SpeechSynthesisUtterance) {
          counters.spoken.push(utterance.text);
          current = utterance;
          utterance.onstart?.(new Event("start") as SpeechSynthesisEvent);
        },
      },
    });
    class SyntheticUtterance {
      text: string;
      constructor(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: SyntheticUtterance,
      configurable: true,
    });
    (
      window as unknown as {
        summarySpeech: { counters: SpeechState; complete: () => void };
      }
    ).summarySpeech = {
      counters,
      complete() {
        while (current) {
          const utterance = current;
          current = null;
          utterance.onend?.(new Event("end") as SpeechSynthesisEvent);
        }
      },
    };
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test.afterEach(async ({ page }) => {
  const state = diagnostics.get(page)!;
  expect(
    state.rejected,
    "No generation, translation, browser AI, auth mutation, media or external requests; content/OGP require explicit matching body action",
  ).toEqual([]);
  expect(state.errors, "Production-component JavaScript exceptions must remain visible").toEqual(
    [],
  );
  expect(
    (await speechState(page)).browserAiCalls,
    "Cache-only UI must never probe/create browser AI",
  ).toBe(0);
});

async function open(page: Page, fixtureCase?: string, theme = "dark") {
  const parameters = new URLSearchParams({ theme });
  if (fixtureCase) parameters.set("case", fixtureCase);
  await page.goto(`${origin}/?${parameters}`);
  await expect(page.getByRole("button", { name: "ドパガキモードを開く" })).toBeVisible();
  await page.clock.install({ time: new Date("2026-10-02T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-02T00:01:00Z"));
  await page.getByRole("button", { name: "ドパガキモードを開く" }).click();
  await committedArticle(page, 0);
}
async function committedArticle(page: Page, index: number, total?: number) {
  await expect(
    page.getByRole("heading", { name: new RegExp(`^要約テスト記事 ${index + 1}：`) }),
  ).toBeVisible();
  await expect(position(page)).toHaveText(
    total ? `${index + 1} / ${total}件` : new RegExp(`^${index + 1} / \\d+件$`),
  );
  // The active heading/status are committed before acknowledging the two-frame read write.
  await page.clock.runFor(80);
}
async function ids(page: Page, name = "read-events"): Promise<string[]> {
  return JSON.parse((await page.getByTestId(name).textContent()) || "[]") as string[];
}
async function speechState(page: Page): Promise<SpeechState> {
  return page.evaluate(
    () =>
      (window as unknown as { summarySpeech: { counters: SpeechState } }).summarySpeech.counters,
  );
}
async function control<K extends keyof SummaryFixtureControls>(
  page: Page,
  key: K,
  value: Parameters<SummaryFixtureControls[K]>[0],
) {
  await page.evaluate(
    ({ key, value }) => {
      const fixture = (window as unknown as { summaryFixture: SummaryFixtureControls })
        .summaryFixture;
      (fixture[key] as (argument: typeof value) => void)(value);
    },
    { key, value },
  );
}
async function setVisible(page: Page, visible: boolean) {
  await page.evaluate((value) => {
    Object.defineProperty(document, "visibilityState", {
      value: value ? "visible" : "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, visible);
}
async function inspect(page: Page) {
  await summaryButton(page).click();
  await expect(summaryDialog(page)).toBeVisible();
}
async function closeSummary(page: Page) {
  await page.keyboard.press("Escape");
  await expect(summaryDialog(page)).toHaveCount(0);
  await expect(position(page)).toBeVisible();
  await page.clock.runFor(40);
  await expect(summaryButton(page)).toBeFocused();
}
async function progressPercent(page: Page) {
  return progress(page).evaluate((element) =>
    Number.parseFloat((element as HTMLElement).style.width),
  );
}
async function visibleControlGeometry(page: Page, selector: string) {
  const viewport = page.viewportSize()!;
  const controls = page.locator(selector);
  const boxes: { name: string; x: number; y: number; width: number; height: number }[] = [];
  for (let index = 0; index < (await controls.count()); index++) {
    const button = controls.nth(index);
    if (!(await button.isVisible())) continue;
    const box = await button.boundingBox();
    expect(box, (await button.textContent()) || selector).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(box!.height).toBeGreaterThanOrEqual(40);
    boxes.push({ name: (await button.textContent()) || selector, ...box! });
  }
  for (let first = 0; first < boxes.length; first++) {
    for (let second = first + 1; second < boxes.length; second++) {
      const a = boxes[first];
      const b = boxes[second];
      const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      expect(width > 1 && height > 1, `${a.name} must not overlap ${b.name}`).toBe(false);
    }
  }
}
async function captionReadability(page: Page) {
  const caption = activeSlide(page).locator(".cinematic-caption-scroll");
  const dimensions = await caption.evaluate((element) => {
    const text = element.querySelector(".cinematic-caption")!;
    const styles = getComputedStyle(text);
    return {
      width: element.clientWidth,
      height: element.clientHeight,
      scrollHeight: element.scrollHeight,
      fontSize: Number.parseFloat(styles.fontSize),
      lineHeight: Number.parseFloat(styles.lineHeight),
    };
  });
  expect(
    dimensions.width,
    "Readable caption width must survive the action rail",
  ).toBeGreaterThanOrEqual(160);
  expect(dimensions.fontSize).toBeGreaterThanOrEqual(22);
  expect(dimensions.lineHeight).toBeGreaterThanOrEqual(dimensions.fontSize * 1.25);
  expect(
    dimensions.height,
    "Provenance and static notices must leave two readable caption lines",
  ).toBeGreaterThanOrEqual(Math.min(dimensions.scrollHeight, dimensions.lineHeight * 2) - 1);
  await caption.focus();
  await expect(caption).toBeFocused();
  await page.keyboard.press("PageDown");
  await expect(position(page)).toHaveText("2 / 10件");
}
async function requireHit(dialog: Locator, index: number, text = cachedText(articleUrl(index))) {
  await expect(dialog).toContainText(text);
  await expect(dialog.getByTestId("summary-availability")).toHaveText("保存済みのAI要約");
  await expect(
    dialog.getByRole("button", { name: "ショートをAI要約にする", exact: true }),
  ).toBeVisible();
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  for (const theme of ["light", "dark"]) {
    test.describe(`${viewport.width}px ${theme} saved summaries`, () => {
      test.use({ viewport });
      test("cache explanation separates model policy, unknown runtime and billing without requests", async ({
        page,
      }, info) => {
        const state = diagnostics.get(page)!;
        state.behavior = "mixed";
        await open(page, undefined, theme);
        await next(page).click();
        await committedArticle(page, 1, 10);
        await inspect(page);
        const dialog = summaryDialog(page);
        await expect(dialog.getByTestId("summary-availability")).toContainText("ありません");
        const help = dialog.getByRole("button", { name: "保存済み要約と自動事前要約について" });
        await expect(help).toHaveAttribute("aria-expanded", "false");
        const requestCount = state.requests.length;
        await help.click();
        await expect(help).toHaveAttribute("aria-expanded", "true");
        const explanation = dialog.getByTestId("summary-cache-explanation");
        await expect(explanation).toContainText(
          "選択中モデルは自動事前要約の対象モデルと異なります",
        );
        await expect(explanation).toContainText("別モデルの保存状態は調べていません");
        await expect(explanation).toContainText(
          "稼働状態・停止理由・残り予約枠・実際の請求額は、この画面では確認できません",
        );
        await expect(explanation).toContainText("生成成功件数やCloudflareの請求額とは異なります");
        await expect(dialog).not.toContainText(
          /稼働中|予算に到達しました|38件|0\.996170|ai-cache\//,
        );
        await explanation.locator("p").last().scrollIntoViewIfNeeded();
        expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true,
        );
        await page.screenshot({
          path: info.outputPath(`summary-cache-explanation-${viewport.width}-${theme}.png`),
        });
        await help.click();
        await expect(help).toBeFocused();
        await expect(help).toHaveAttribute("aria-expanded", "false");
        await expect(explanation).toHaveCount(0);
        expect(state.requests).toHaveLength(requestCount);
        await page.keyboard.press("Tab");
        await expect(
          dialog.getByRole("button", { name: "ショート表示に戻る", exact: true }),
        ).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(help).toBeFocused();
        await closeSummary(page);
        await inspect(page);
        await expect(help).toHaveAttribute("aria-expanded", "false");
        await closeSummary(page);
        await control(page, "setModel", modelB);
        await inspect(page);
        await help.click();
        await expect(explanation).toContainText("選択中モデルは自動事前要約の対象モデルです");
        await expect(explanation).not.toContainText("対象モデルと異なります");
        await expect(dialog.getByTestId("summary-source")).toContainText("Gemma 4");
        await closeSummary(page);
        expect(state.content).toEqual([]);
        expect(state.ogp).toEqual([]);
      });

      test("prefetched hit becomes a labeled short only on activation; dialog controls and focus remain usable", async ({
        page,
      }, info) => {
        await open(page, undefined, theme);
        await inspect(page);
        await requireHit(summaryDialog(page), 0);
        await expect(summaryDialog(page)).toContainText("Llama 3.1 8B");
        await expect(summaryDialog(page).getByTestId("summary-source")).toBeVisible();
        await closeSummary(page);
        // A hit arriving after the first activation does not replace its frozen explanation.
        await expect(transcript(page)).toContainText(feedText(0));
        await expect(transcript(page)).not.toContainText("保存済み要約 1");
        await next(page).click();
        await committedArticle(page, 1, 10);
        await expect(transcript(page)).toContainText(cachedText(articleUrl(1)));
        await expect(activeSlide(page).locator(".cinematic-caption-navigation")).toContainText(
          "保存済みのAI要約",
        );
        await expect(activeSlide(page).getByTestId("caption-summary-provenance")).toBeVisible();
        await captionReadability(page);
        expect(await ids(page)).toEqual(["0", "1"]);
        await visibleControlGeometry(
          page,
          ".immersive-toolbar button, .immersive-toolbar select, .immersive-footer button",
        );
        await page.getByRole("combobox", { name: "再生速度" }).selectOption("1.5");
        await inspect(page);
        await requireHit(summaryDialog(page), 1);
        await expect(
          summaryDialog(page).getByRole("button", { name: "ショートをAI要約にする", exact: true }),
        ).toBeDisabled();
        const dialog = summaryDialog(page);
        await expect(dialog.getByTestId("summary-source")).toBeVisible();
        await expect(dialog.getByRole("heading")).toBeFocused();
        await expect(dialog).toContainText("本文全体の取得状況不明");
        await dialog.getByRole("button", { name: "ショート表示に戻る", exact: true }).focus();
        await page.keyboard.press("Tab");
        expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
          true,
        );
        await page.screenshot({
          path: info.outputPath(`saved-summary-${viewport.width}-${theme}.png`),
        });
        await closeSummary(page);
        await expect(page.getByRole("combobox", { name: "再生速度" })).toHaveValue("1.5");
        await expect(page.getByRole("button", { name: "自動再生を再開" })).toBeVisible();
        await expect(position(page)).toHaveText("2 / 10件");
      });
    });
  }
}

for (const theme of ["light", "dark"]) {
  test.describe(`320px ${theme} long shortened presentations`, () => {
    test.use({ viewport: { width: 320, height: 568 } });
    test("long cached-summary preview keeps two readable caption lines alongside provenance and shortening notices", async ({
      page,
    }, info) => {
      const longSummary = Array.from(
        { length: 100 },
        (_, paragraph) => `保存済みの長い要約の段落 ${paragraph + 1} を安全に表示します。`,
      ).join("\n\n");
      const state = diagnostics.get(page)!;
      state.makeHit = (url, model) => ({ ...makeHit(url, model), result: longSummary });
      await open(page, undefined, theme);
      await inspect(page);
      await expect(summaryDialog(page)).toContainText("保存済みの長い要約の段落 100");
      await closeSummary(page);
      await next(page).click();
      await committedArticle(page, 1, 10);
      await expect(transcript(page)).toContainText("保存済みの長い要約の段落 1");
      await expect(transcript(page)).not.toContainText("保存済みの長い要約の段落 100");
      await expect(activeSlide(page).getByTestId("caption-summary-provenance")).toContainText(
        "入力の打ち切りなし",
      );
      await expect(
        activeSlide(page).getByText("表示は要約の抜粋です。続きは要約表示で確認できます。", {
          exact: true,
        }),
      ).toBeVisible();
      await page.screenshot({ path: info.outputPath(`long-cached-summary-320-${theme}.png`) });
      await visibleControlGeometry(
        page,
        ".immersive-toolbar button, .immersive-toolbar select, .immersive-footer button",
      );
      await captionReadability(page);
      const information = activeSlide(page).getByRole("region", {
        name: "記事の表示情報をスクロール",
      });
      await information.focus();
      await expect(information).toBeFocused();
      await page.keyboard.press("PageDown");
      await page.clock.runFor(80);
      await expect(position(page)).toHaveText("2 / 10件");
      await expect(information).toContainText("本文全体の取得状況不明");
      expect(await ids(page)).toEqual(["0", "1"]);
      expect(state.content).toEqual([]);
    });
    test("long feed/body fallback keeps two readable caption lines alongside its shortening and reduced-motion notices", async ({
      page,
    }, info) => {
      const state = diagnostics.get(page)!;
      state.behavior = "mixed";
      await open(page, "long-fallback", theme);
      await inspect(page);
      await requireHit(summaryDialog(page), 0);
      await closeSummary(page);
      await next(page).click();
      await committedArticle(page, 1, 10);
      await expect(transcript(page)).toContainText(feedText(1));
      await expect(transcript(page)).not.toContainText("読み込み済みの説明の段落 100");
      await expect(activeSlide(page).getByTestId("caption-summary-provenance")).toHaveCount(0);
      await expect(
        activeSlide(page).getByText("表示は説明・本文の抜粋です。本文から続きを確認できます。", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(activeSlide(page)).not.toContainText("表示は要約の抜粋です");
      await page.screenshot({ path: info.outputPath(`long-feed-fallback-320-${theme}.png`) });
      await visibleControlGeometry(
        page,
        ".immersive-toolbar button, .immersive-toolbar select, .immersive-footer button",
      );
      await captionReadability(page);
      expect(await ids(page)).toEqual(["0", "1"]);
      expect(state.content).toEqual([]);
    });
  });
}

test("model boundary resets an automatically selected prefetched presentation once; a later hit preserves its new clock and manual caption", async ({
  page,
}) => {
  const state = diagnostics.get(page)!;
  await open(page);
  await inspect(page);
  await requireHit(summaryDialog(page), 0);
  await closeSummary(page);
  await next(page).click();
  await committedArticle(page, 1, 10);
  await expect(transcript(page)).toContainText(cachedText(articleUrl(1)));
  // This hit was selected only by activation, so its presentation revision remains zero.
  const caption = activeSlide(page).locator(".cinematic-caption");
  const captionPosition = activeSlide(page).locator(".cinematic-caption-navigation span");
  await page.getByRole("button", { name: "自動再生を再開" }).click();
  await expect(page.getByRole("button", { name: "自動再生を一時停止" })).toBeVisible();
  await page.clock.runFor(1500);
  expect(await progressPercent(page)).toBeGreaterThan(0);
  await activeSlide(page).getByRole("button", { name: "次の説明", exact: true }).click();
  await expect(page.getByRole("button", { name: "自動再生を再開" })).toBeVisible();
  await expect(caption).toContainText("保存済み要約 2");
  await expect(captionPosition).toContainText(/2 \/ \d+$/);

  state.behavior = "deferred";
  await control(page, "setModel", modelB);
  await expect(page.getByTestId("fixture-model")).toHaveText(modelB);
  await expect(transcript(page)).toContainText(feedText(1));
  await expect(transcript(page)).not.toContainText("保存済み要約 2");
  await expect(caption).toContainText("要約テスト記事 2：");
  await expect(captionPosition).toContainText(/1 \/ \d+$/);
  await expect(activeSlide(page).getByTestId("caption-summary-provenance")).toHaveCount(0);
  expect(
    await progressPercent(page),
    "A context boundary must reset the old zero-revision clock",
  ).toBe(0);
  await expect.poll(() => state.pending.length).toBeGreaterThan(0);

  // Establish nonzero fallback progress and a manually selected fallback caption before
  // the new-model cache response arrives, so an unintended second reset is observable.
  await page.getByRole("button", { name: "自動再生を再開" }).click();
  await expect(page.getByRole("button", { name: "自動再生を一時停止" })).toBeVisible();
  await page.clock.runFor(1500);
  await activeSlide(page).getByRole("button", { name: "次の説明", exact: true }).click();
  await expect(page.getByRole("button", { name: "自動再生を再開" })).toBeVisible();
  await expect(caption).toContainText(feedText(1));
  await expect(captionPosition).toContainText(/2 \/ \d+$/);
  const fallbackProgress = await progressPercent(page);
  const fallbackCaption = await caption.textContent();
  const fallbackPosition = await captionPosition.textContent();
  expect(fallbackProgress).toBeGreaterThan(0);
  await release(page);
  await inspect(page);
  await requireHit(summaryDialog(page), 1, cachedText(articleUrl(1), modelB));
  await closeSummary(page);
  await expect(transcript(page)).toContainText(feedText(1));
  await expect(transcript(page)).not.toContainText("保存済み要約 2");
  await expect(caption).toHaveText(fallbackCaption!);
  await expect(captionPosition).toHaveText(fallbackPosition!);
  expect(
    await progressPercent(page),
    "A late hit must not remount/reset the new fallback presentation",
  ).toBe(fallbackProgress);
  await expect(position(page)).toHaveText("2 / 10件");
  expect(await ids(page)).toEqual(["0", "1"]);
  expect(state.content).toEqual([]);
});

test("late hit during synthetic local TTS and clock playback changes only availability, never text/progress/narration", async ({
  page,
}) => {
  const state = diagnostics.get(page)!;
  state.behavior = "deferred";
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await open(page);
  await expect.poll(() => state.pending.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "ナレーションを開始" }).click();
  await expect.poll(async () => (await speechState(page)).spoken.length).toBeGreaterThan(0);
  await page.clock.runFor(1500);
  const before = await speechState(page);
  const beforeProgress = await progressPercent(page);
  const beforeTranscript = await transcript(page).textContent();
  expect(beforeProgress).toBeGreaterThan(0);
  await release(page);
  await inspect(page);
  await requireHit(summaryDialog(page), 0);
  await closeSummary(page);
  await expect(transcript(page)).toHaveText(beforeTranscript!);
  const after = await speechState(page);
  expect(after.spoken).toEqual(before.spoken);
  expect(after.cancels).toBe(before.cancels);
  expect(await progressPercent(page)).toBeGreaterThanOrEqual(beforeProgress);
  await page.clock.runFor(1000);
  expect(await progressPercent(page)).toBeGreaterThan(beforeProgress);
  await expect(position(page)).toHaveText("1 / 10件");
  expect(state.content).toEqual([]);
});

test("late paused hit is inspectable without adoption; explicit source switches pause and reset once", async ({
  page,
}) => {
  const state = diagnostics.get(page)!;
  state.behavior = "deferred";
  await open(page);
  await page.getByRole("button", { name: "自動再生を再開" }).click();
  await page.clock.runFor(1500);
  await page.getByRole("button", { name: "自動再生を一時停止" }).click();
  const beforeProgress = await progressPercent(page);
  await expect.poll(() => state.pending.length).toBeGreaterThan(0);
  await release(page);
  await inspect(page);
  await requireHit(summaryDialog(page), 0);
  await closeSummary(page);
  await expect(transcript(page)).toContainText(feedText(0));
  expect(await progressPercent(page)).toBe(beforeProgress);
  await inspect(page);
  await summaryDialog(page)
    .getByRole("button", { name: "ショートをAI要約にする", exact: true })
    .click();
  await expect(summaryDialog(page)).toHaveCount(0);
  await expect(transcript(page)).toContainText(cachedText(articleUrl(0)));
  await expect(page.getByRole("button", { name: "自動再生を再開" })).toBeVisible();
  expect(await progressPercent(page)).toBe(0);
  await page.clock.runFor(8000);
  expect(await progressPercent(page)).toBe(0);
  await inspect(page);
  await summaryDialog(page)
    .getByRole("button", { name: "ショートを説明にする", exact: true })
    .click();
  await expect(summaryDialog(page)).toHaveCount(0);
  await expect(transcript(page)).toContainText(feedText(0));
  await expect(transcript(page)).not.toContainText("保存済み要約 1");
  expect(await progressPercent(page)).toBe(0);
  expect(await ids(page)).toEqual(["0"]);
  expect(state.requests).toHaveLength(1);
});

test("body reader interruption keeps a late hit separate and restores queue, speed and focus", async ({
  page,
}) => {
  const state = diagnostics.get(page)!;
  state.behavior = "deferred";
  await open(page);
  await page.getByRole("combobox", { name: "再生速度" }).selectOption("2");
  const here = page.getByRole("button", { name: "ここで読む", exact: true });
  state.allowedContent.add(articleUrl(0));
  await here.click();
  const body = page.getByRole("dialog", { name: "ここで記事の本文を読む" });
  await expect(body).toBeVisible();
  await expect(body).toContainText("明示操作で取得した本文です");
  await expect.poll(() => state.pending.length).toBeGreaterThan(0);
  await release(page);
  await page.clock.runFor(8000);
  await expect(position(page)).toHaveText("1 / 10件");
  await page.keyboard.press("Escape");
  await expect(body).toHaveCount(0);
  state.allowedContent.delete(articleUrl(0));
  await expect(position(page)).toBeVisible();
  await page.clock.runFor(40);
  await expect(here).toBeFocused();
  await expect(transcript(page)).toContainText(feedText(0));
  await expect(transcript(page)).not.toContainText("保存済み要約 1");
  await expect(page.getByRole("combobox", { name: "再生速度" })).toHaveValue("2");
  await inspect(page);
  await requireHit(summaryDialog(page), 0);
  await closeSummary(page);
  expect(state.content).toEqual([articleUrl(0)]);
  expect(state.ogp).toEqual([articleUrl(0)]);
  expect(await ids(page)).toEqual(["0"]);
});

test("mixed hit/miss cache inspection offers an explicit cache-only retry and body fallback", async ({
  page,
}) => {
  const state = diagnostics.get(page)!;
  state.behavior = "mixed";
  await open(page);
  await inspect(page);
  await requireHit(summaryDialog(page), 0);
  await closeSummary(page);
  await next(page).click();
  await committedArticle(page, 1, 10);
  await expect(transcript(page)).toContainText(feedText(1));
  await inspect(page);
  await expect(summaryDialog(page).getByTestId("summary-availability")).toContainText(
    /未保存|ありません|見つかりません/,
  );
  await expect(
    summaryDialog(page).getByRole("button", { name: "ショートをAI要約にする", exact: true }),
  ).toHaveCount(0);
  const initialCount = state.requests.length;
  state.behavior = "hit";
  await summaryDialog(page)
    .getByRole("button", { name: "保存済み要約を再確認", exact: true })
    .click();
  await requireHit(summaryDialog(page), 1);
  await expect(
    summaryDialog(page).getByRole("heading", { name: /^要約テスト記事 2：/ }),
  ).toBeFocused();
  expect(state.requests.length).toBe(initialCount + 1);
  expect(state.requests.at(-1)!.urls).toEqual([articleUrl(1)]);
  await closeSummary(page);
  await expect(transcript(page)).toContainText(feedText(1));
  await next(page).click();
  await committedArticle(page, 2, 10);
  await inspect(page);
  await expect(summaryDialog(page).getByTestId("summary-availability")).toContainText(
    /未保存|ありません|見つかりません/,
  );
  state.allowedContent.add(articleUrl(2));
  await summaryDialog(page).getByRole("button", { name: "本文を読む", exact: true }).click();
  await expect(summaryDialog(page)).toHaveCount(0);
  const body = page.getByRole("dialog", { name: "ここで記事の本文を読む" });
  await expect(body).toContainText("明示操作で取得した本文です");
  await page.clock.runFor(80);
  await page.keyboard.press("Escape");
  await expect(body).toHaveCount(0);
  state.allowedContent.delete(articleUrl(2));
  await expect(position(page)).toBeVisible();
  await page.clock.runFor(40);
  await expect(summaryButton(page)).toBeFocused();
  expect(state.content).toEqual([articleUrl(2)]);
  expect(state.ogp).toEqual([articleUrl(2)]);
  expect(await ids(page)).toEqual(["0", "1", "2"]);
});

test("cache error stays an honest fallback and manual retry never calls generation", async ({
  page,
}) => {
  const state = diagnostics.get(page)!;
  state.behavior = "error";
  await open(page);
  await inspect(page);
  await expect(summaryDialog(page).getByTestId("summary-availability")).toContainText(
    /確認でき|取得でき|失敗|エラー/,
  );
  await expect(
    summaryDialog(page).getByRole("button", { name: "本文を読む", exact: true }),
  ).toBeEnabled();
  await expect(
    summaryDialog(page).getByRole("button", { name: "ショートをAI要約にする", exact: true }),
  ).toHaveCount(0);
  const requests = state.requests.length;
  await page.clock.runFor(10_000);
  expect(state.requests.length, "An error must not start automatic retry/generation loops").toBe(
    requests,
  );
  state.behavior = "hit";
  await summaryDialog(page)
    .getByRole("button", { name: "保存済み要約を再確認", exact: true })
    .click();
  await requireHit(summaryDialog(page), 0);
  await expect(
    summaryDialog(page).getByRole("heading", { name: /^要約テスト記事 1：/ }),
  ).toBeFocused();
  expect(state.requests.at(-1)).toEqual({ urls: [articleUrl(0)], model: DEFAULT_AI_MODEL });
  await closeSummary(page);
  await expect(transcript(page)).toContainText(feedText(0));
  expect(state.content).toEqual([]);
});

test("exact selected model wins over a deferred older-model response", async ({ page }) => {
  const state = diagnostics.get(page)!;
  state.behavior = "deferred";
  await open(page);
  await expect.poll(() => state.pending.length).toBeGreaterThan(0);
  await inspect(page);
  await expect(summaryDialog(page).getByTestId("summary-availability")).toContainText(
    /確認中|読み込み中|取得中/,
  );
  await control(page, "setModel", modelB);
  await expect(page.getByTestId("fixture-model")).toHaveText(modelB);
  await expect
    .poll(() => state.pending.filter(({ request }) => request.model === modelB).length)
    .toBeGreaterThan(0);
  await release(page, ({ model }) => model === modelB);
  await requireHit(summaryDialog(page), 0, cachedText(articleUrl(0), modelB));
  await expect(summaryDialog(page)).toContainText("Gemma 4 26B");
  await release(page, ({ model }) => model === DEFAULT_AI_MODEL);
  await expect(summaryDialog(page)).toContainText(cachedText(articleUrl(0), modelB));
  await expect(summaryDialog(page)).not.toContainText(cachedText(articleUrl(0)));
  await closeSummary(page);
  await next(page).click();
  await committedArticle(page, 1, 10);
  await expect(transcript(page)).toContainText(cachedText(articleUrl(1), modelB));
  expect(new Set(state.requests.map(({ model }) => model))).toEqual(
    new Set([DEFAULT_AI_MODEL, modelB]),
  );
});

for (const change of ["account", "scope"] as const) {
  test(`${change} interruption discards deferred old-scope cache results`, async ({ page }) => {
    const state = diagnostics.get(page)!;
    state.behavior = "deferred";
    state.makeHit = (url, model) => ({
      ...makeHit(url, model),
      result: "古い権限の保存済み要約。表示してはいけません。",
    });
    await open(page);
    await expect.poll(() => state.pending.length).toBeGreaterThan(0);
    const oldPending = state.pending.slice();
    await inspect(page);
    const newUser = change === "account" ? "summary-other-user" : "summary-test";
    if (change === "account") await control(page, "setSettingsUser", newUser);
    await control(page, "setAccount", {
      userId: newUser,
      authUsable: true,
      scopeKey: "summary-scope-b",
    });
    await expect(page.getByTestId("fixture-account")).toContainText("summary-scope-b");
    await expect
      .poll(() => state.pending.filter((pending) => !oldPending.includes(pending)).length)
      .toBeGreaterThan(0);
    state.pending = state.pending.filter((pending) => !oldPending.includes(pending));
    await Promise.all(
      oldPending.map(({ route, request }) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(response(state, request)),
        }),
      ),
    );
    await expect(summaryDialog(page)).not.toContainText("古い権限の保存済み要約");
    await expect(transcript(page)).not.toContainText("古い権限の保存済み要約");
    state.makeHit = (url, model) => ({
      ...makeHit(url, model),
      result: "現在の権限の保存済み要約。新しい範囲だけを表示します。",
    });
    await release(page);
    await expect(summaryDialog(page)).toContainText("現在の権限の保存済み要約");
    await expect(summaryDialog(page)).not.toContainText("古い権限の保存済み要約");
    await closeSummary(page);
    await expect(transcript(page)).toContainText(feedText(0));
    expect(state.content).toEqual([]);
  });
}

for (const change of ["account", "scope", "auth"] as const) {
  test(`${change} boundary removes an already-selected old summary and provenance before any new response`, async ({
    page,
  }) => {
    const state = diagnostics.get(page)!;
    await open(page);
    await inspect(page);
    await requireHit(summaryDialog(page), 0);
    await summaryDialog(page)
      .getByRole("button", { name: "ショートをAI要約にする", exact: true })
      .click();
    await expect(summaryDialog(page)).toHaveCount(0);
    await expect(transcript(page)).toContainText(cachedText(articleUrl(0)));
    await expect(activeSlide(page).getByTestId("caption-summary-provenance")).toBeVisible();
    const initialRequests = state.requests.length;
    state.behavior = "deferred";
    const newUser =
      change === "account" ? "summary-other-user" : change === "auth" ? null : "summary-test";
    if (change === "account") await control(page, "setSettingsUser", newUser);
    await control(page, "setAccount", {
      userId: newUser,
      authUsable: change !== "auth",
      scopeKey: "summary-scope-b",
    });
    await expect(page.getByTestId("fixture-account")).toContainText("summary-scope-b");
    await expect(transcript(page)).toContainText(feedText(0));
    await expect(transcript(page)).not.toContainText("保存済み要約 1");
    await expect(activeSlide(page).getByTestId("caption-summary-provenance")).toHaveCount(0);
    await inspect(page);
    await expect(summaryDialog(page)).not.toContainText(cachedText(articleUrl(0)));
    if (change === "auth") {
      await expect(summaryDialog(page).getByTestId("summary-availability")).toContainText(
        "ログイン状態を確認してください",
      );
      await page.clock.runFor(8000);
      expect(state.requests).toHaveLength(initialRequests);
    } else {
      await expect.poll(() => state.pending.length).toBeGreaterThan(0);
      await expect(summaryDialog(page).getByTestId("summary-availability")).toContainText("確認中");
      state.makeHit = (url, model) => ({
        ...makeHit(url, model),
        result: "新しい権限の要約です。再確認した保存済み結果だけを表示します。",
      });
      await release(page);
      await expect(summaryDialog(page)).toContainText("新しい権限の要約です");
      await expect(summaryDialog(page)).not.toContainText(cachedText(articleUrl(0)));
    }
    await closeSummary(page);
    await expect(transcript(page)).toContainText(feedText(0));
    await expect(page.getByRole("button", { name: "自動再生を再開" })).toBeVisible();
    expect(await ids(page)).toEqual(["0"]);
    expect(state.content).toEqual([]);
  });
}

for (const fixtureCase of [
  "browser",
  "no-settings",
  "no-account",
  "no-auth",
  "unusable-auth",
  "wrong-user",
]) {
  test(`${fixtureCase} gates all cache and AI requests`, async ({ page }) => {
    await open(page, fixtureCase);
    await expect(transcript(page)).toContainText(feedText(0));
    if (await summaryButton(page).count()) {
      await inspect(page);
      await expect(summaryDialog(page).getByTestId("summary-availability")).toContainText(
        /利用でき|確認でき|ログイン|無効|ブラウザ|設定/,
      );
      await expect(
        summaryDialog(page).getByRole("button", { name: "ショートをAI要約にする", exact: true }),
      ).toHaveCount(0);
      await closeSummary(page);
    }
    await next(page).click();
    await committedArticle(page, 1, 10);
    await page.clock.runFor(15_000);
    expect(diagnostics.get(page)!.requests).toEqual([]);
    expect(diagnostics.get(page)!.content).toEqual([]);
    expect(await ids(page)).toEqual(["0", "1"]);
  });
}

test("auto provider remains cache-only and opening hidden schedules no cache/read writes until visible", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  });
  await open(page, "auto");
  await page.clock.runFor(15_000);
  expect(diagnostics.get(page)!.requests).toEqual([]);
  expect(await ids(page)).toEqual([]);
  await setVisible(page, true);
  await committedArticle(page, 0, 10);
  await inspect(page);
  await requireHit(summaryDialog(page), 0);
  await closeSummary(page);
  expect(await ids(page)).toEqual(["0"]);
  await setVisible(page, false);
  const count = diagnostics.get(page)!.requests.length;
  await next(page).click();
  await expect(position(page)).toHaveText("2 / 10件");
  await page.clock.runFor(15_000);
  expect(diagnostics.get(page)!.requests.length).toBe(count);
  expect(await ids(page)).toEqual(["0"]);
  await setVisible(page, true);
  await committedArticle(page, 1, 10);
  expect(await ids(page)).toEqual(["0", "1"]);
});

test("hostile cached HTML/markdown stay inert; thinking never enters display or narration", async ({
  page,
}) => {
  const state = diagnostics.get(page)!;
  state.makeHit = (url, model) => ({
    ...makeHit(url, model),
    result:
      '<think>内部思考は表示しない</think>\n# 安全な保存済み要約\n本文だけを表示します。\n![画像](https://attacker.example/image.png)\n<img src="https://attacker.example/x" onerror="window.__summaryInjected=true"><script>window.__summaryInjected=true</script><iframe src="https://attacker.example/frame"></iframe>\n[危険なリンク](javascript:alert(1))',
  });
  await open(page);
  await inspect(page);
  const dialog = summaryDialog(page);
  await expect(dialog).toContainText("安全な保存済み要約");
  await expect(dialog).not.toContainText("内部思考は表示しない");
  await expect(dialog.locator("img, video, audio, iframe, script, object, embed")).toHaveCount(0);
  await expect(dialog.locator('a[href^="javascript:"]')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { __summaryInjected?: boolean }).__summaryInjected,
    ),
  ).toBeUndefined();
  await dialog.getByRole("button", { name: "ショートをAI要約にする", exact: true }).click();
  await expect(transcript(page)).toContainText("安全な保存済み要約");
  await expect(transcript(page)).not.toContainText("内部思考は表示しない");
  await page.getByRole("button", { name: "ナレーションを開始" }).click();
  await page.getByRole("button", { name: "自動再生を再開" }).click();
  await expect.poll(async () => (await speechState(page)).spoken.length).toBeGreaterThan(0);
  await page.evaluate(() =>
    (window as unknown as { summarySpeech: { complete: () => void } }).summarySpeech.complete(),
  );
  const spoken = (await speechState(page)).spoken.join("");
  expect(spoken).toContain("安全な保存済み要約");
  expect(spoken).not.toContain("内部思考は表示しない");
  expect(state.content).toEqual([]);
});

test("legacy/unknown provenance never claims complete source input", async ({ page }) => {
  const state = diagnostics.get(page)!;
  state.makeHit = (url, model) => ({
    ...makeHit(url, model),
    metadata: metadata(model, {
      promptVersion: null,
      bodyHash: null,
      generatedAt: null,
      inputCharacters: null,
      inputTruncated: null,
      completeness: "unknown",
      usage: null,
    }),
  });
  await open(page);
  await inspect(page);
  await requireHit(summaryDialog(page), 0);
  await expect(summaryDialog(page)).toContainText("生成情報不明");
  await expect(summaryDialog(page)).toContainText("本文全体の取得状況不明");
  await closeSummary(page);
  await next(page).click();
  await committedArticle(page, 1, 10);
  await expect(activeSlide(page).getByTestId("caption-summary-provenance")).toContainText(
    "入力の打ち切り有無不明",
  );
  await expect(activeSlide(page).getByTestId("caption-summary-provenance")).toBeVisible();
});

test("truncated source metadata remains visible independently of a short cached result", async ({
  page,
}) => {
  const state = diagnostics.get(page)!;
  state.makeHit = (url, model) => ({
    ...makeHit(url, model),
    result: "短い要約です。",
    metadata: metadata(model, {
      inputTruncated: true,
      completeness: "truncated",
      inputCharacters: 8000,
    }),
  });
  await open(page);
  await inspect(page);
  await requireHit(summaryDialog(page), 0, "短い要約です。");
  await expect(summaryDialog(page)).toContainText("入力は途中で打ち切り");
  await closeSummary(page);
  await next(page).click();
  await committedArticle(page, 1, 10);
  await expect(activeSlide(page).getByTestId("caption-summary-provenance")).toContainText(
    "入力は途中で打ち切り",
  );
});

test("preview shortening does not become a claim that source input was truncated", async ({
  page,
}) => {
  const longText = Array.from(
    { length: 100 },
    (_, index) => `保存済みの段落 ${index + 1} を安全に表示します。`,
  ).join("\n\n");
  const state = diagnostics.get(page)!;
  state.makeHit = (url, model) => ({
    ...makeHit(url, model),
    result: longText,
    metadata: metadata(model, { inputTruncated: false, completeness: "unknown" }),
  });
  await open(page);
  await inspect(page);
  await expect(summaryDialog(page)).toContainText("保存済みの段落 100");
  await expect(summaryDialog(page)).toContainText("入力の打ち切りなし");
  await summaryDialog(page)
    .getByRole("button", { name: "ショートをAI要約にする", exact: true })
    .click();
  await expect(transcript(page)).toContainText("保存済みの段落 1");
  await expect(transcript(page)).not.toContainText("保存済みの段落 100");
  await expect(
    activeSlide(page).getByText("表示は要約の抜粋です。続きは要約表示で確認できます。", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(activeSlide(page).getByTestId("caption-summary-provenance")).toContainText(
    "入力の打ち切りなし",
  );
  await inspect(page);
  await expect(summaryDialog(page)).toContainText("保存済みの段落 100");
  await closeSummary(page);
});

test("23-card replenishment requests each URL/model once and reads only acknowledged active cards", async ({
  page,
}) => {
  await open(page);
  await inspect(page);
  await requireHit(summaryDialog(page), 0);
  await closeSummary(page);
  const seen = ["0"];
  expect(await ids(page)).toEqual(seen);
  for (let index = 1; index < 23; index++) {
    await next(page).click();
    const total = index < 8 ? 10 : index < 18 ? 20 : 23;
    await committedArticle(page, index, total);
    seen.push(String(index));
    expect(await ids(page)).toEqual(seen);
  }
  await inspect(page);
  await requireHit(summaryDialog(page), 22);
  await closeSummary(page);
  const requests = diagnostics.get(page)!.requests;
  const keys = requests.flatMap(({ urls, model }) => urls.map((url) => `${model}:${url}`));
  expect(keys).toHaveLength(23);
  expect(new Set(keys).size).toBe(23);
  expect(requests.every(({ urls }) => urls.length <= MAX_SUMMARY_CACHE_URLS)).toBe(true);
  expect(await ids(page, "session-served-ids")).toHaveLength(23);
  await next(page).click();
  await expect(page.getByRole("heading", { name: "読み込み済みの記事はここまで" })).toBeVisible();
  await expect(next(page)).toBeDisabled();
  await page.clock.runFor(15_000);
  expect(await ids(page)).toEqual(seen);
  await previous(page).click();
  await committedArticle(page, 22, 23);
  expect(await ids(page)).toEqual(seen);
  expect(diagnostics.get(page)!.requests).toHaveLength(requests.length);
});
