import { expect, test, type Locator, type Page } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Production header, TTS/Piper hooks, settings persistence, reader shortcuts and CSS.
// Only synthesis and WebAudio are synthetic; no models, audio, accounts or API writes.
const fixtureUrl = "https://rss-tts-volume.test/";
const errors = new WeakMap<Page, string[]>();
let html = "";

const piperMockSource = `
  export const PiperPlus = { initialize: async () => {
    window.volumeFixture.initializations++;
    const synthesize = async text => {
      window.volumeFixture.syntheses.push(text);
      return {samples: new Float32Array(32), sampleRate: 16000};
    };
    return {synthesize, synthesizeWithVoiceCloning: synthesize, dispose() {}};
  }};
`;
const fixtureSource = `
  import { useRef, useState } from "react";
  import { createRoot } from "react-dom/client";
  import ArticleHeaderAiTts from "./src/components/article-view/ArticleHeaderAiTts";
  import { TtsAdapterProvider } from "./src/contexts/TtsAdapterContext";
  import { ToastProvider } from "./src/contexts/ToastContext";
  import { useArticleViewTts } from "./src/hooks/useArticleViewTts";
  import { useArticleViewShortcuts } from "./src/hooks/useArticleViewShortcuts";
  import { usePiperTts } from "./src/hooks/usePiperTts";
  import { makeArticle } from "./e2e/helpers/article";
  const noop = () => {};
  const article = makeArticle({id: "volume-article", title: "音量テストの記事。"});
  const body = "音量を変更してもこの長い本文の読み上げ位置は維持されます".repeat(12);
  const fixture = window.volumeFixture = {
    initializations: 0, syntheses: [], sources: [], gains: [], toasts: [],
    inspect() { return {
      initializations: this.initializations, syntheses: this.syntheses.length,
      sources: this.sources.map(s => ({starts: s.starts, stops: s.stops, disconnected: s.disconnected})),
      gains: this.gains.map(g => ({value: g.gain.value, disconnected: g.disconnected})),
      toasts: this.toasts, writes: window.volumeWrites,
    }; },
    finish() { this.sources.at(-1)?.onended?.(); },
  };
  class FakeAudioContext {
    state = "running";
    destination = {};
    currentTime = 0;
    createBuffer() { return {copyToChannel: noop}; }
    createBufferSource() {
      const source = {onended: null, starts: 0, stops: 0, disconnected: false,
        connect: noop, start() { this.starts++; }, stop() { this.stops++; },
        disconnect() { this.disconnected = true; }};
      fixture.sources.push(source);
      return source;
    }
    createGain() {
      const gain = {gain: {value: 1}, disconnected: false, connect: noop,
        disconnect() { this.disconnected = true; }};
      fixture.gains.push(gain);
      return gain;
    }
    async suspend() { this.state = "suspended"; }
    async resume() { this.state = "running"; }
  }
  window.AudioContext = FakeAudioContext;
  const toast = {toasts: [], success: noop, error: m => fixture.toasts.push(m),
    info: m => fixture.toasts.push(m), undo: noop, dismiss: noop};
  function Reader({adapter}) {
    const [boundary, setBoundary] = useState(0);
    const [starts, setStarts] = useState(0);
    const [scrolls, setScrolls] = useState(0);
    const [open, setOpen] = useState(true);
    const mainRef = useRef(null);
    const boundaryRef = useRef(null);
    const startRef = useRef(null);
    boundaryRef.current = setBoundary;
    startRef.current = () => {setStarts(s => s + 1); setBoundary(0);};
    const tts = useArticleViewTts(article, body, null, boundaryRef, startRef);
    useArticleViewShortcuts({article, storedContent: null, fetching: false,
      canFetchManually: false, fetchFullContent: noop, aiResult: null, aiLoading: false,
      doRunAi: noop, resetAi: noop, handleTranslate: noop, mainRef,
      autoTranslate: false, autoSummarize: false, autoAiBrowserOnly: false,
      aiPreferenceKey: "synthetic", translatorAvailable: null, summarizerAvailable: null,
      translateResult: null, translateLoading: false});
    return <>
      <h1>{article.title}</h1>
      <button onClick={() => setOpen(o => !o)}>その他の操作{open ? "を閉じる" : "を開く"}</button>
      <header className="flex items-center gap-5 p-4">
        <ArticleHeaderAiTts article={article} section={open ? "all" : "primary"}
          hasContent hasImages={false} fetching={false}
          aiResult={null} aiLoading={false} aiError={null} resetAi={noop} doRunAi={noop}
          handleTranslate={noop} translateResult={null} translateLoading={false} translateError={null}
          {...tts} onTtsToggle={tts.handleTtsToggle} autoMode={false} onToggleAutoMode={noop}
          downloadAllImages={noop} downloadingImages={false} imageDownloadProgress={null} />
      </header>
      <button onClick={adapter.isPaused ? adapter.resume : adapter.pause}>
        {adapter.isPaused ? "合成の一時停止を解除" : "合成の読み上げを一時停止"}
      </button>
      <label>合成の音量設定<input type="range" min="0" max="100" step="1"
        value={Math.round(adapter.volume * 100)}
        onChange={event => adapter.setVolume(Number(event.target.value) / 100)} /></label>
      <output aria-label="読み上げ状態">{JSON.stringify({articleId: article.id, boundary, starts,
        playing: tts.ttsPlaying, paused: tts.ttsPaused, ended: tts.ttsEndedCount,
        rate: tts.ttsRate, volume: tts.ttsVolume, scrolls})}</output>
      <main tabIndex={0} aria-label="記事本文" ref={element => {
        mainRef.current = element;
        if (element) element.scrollBy = () => setScrolls(s => s + 1);
      }}>{body}</main>
    </>;
  }
  function Fixture() {
    const adapter = usePiperTts();
    return <ToastProvider value={toast}><TtsAdapterProvider value={adapter}>
      <Reader adapter={adapter} />
    </TtsAdapterProvider></ToastProvider>;
  }
  createRoot(document).render(<html lang="ja"><head><meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <link rel="icon" href="data:," />
    <style dangerouslySetInnerHTML={{__html: window.fixtureStyles}} />
  </head><body className="font-sans bg-surface-base text-text-strong"><Fixture /></body></html>);
`;

test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [{ outputFiles }, css] = await Promise.all([
    build({
      absWorkingDir: root,
      stdin: {
        resolveDir: root,
        sourcefile: "synthetic-tts-volume.tsx",
        loader: "tsx",
        contents: fixtureSource,
      },
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"test"' },
      plugins: [
        {
          name: "synthetic-piper-synthesis",
          setup(builder) {
            builder.onResolve({ filter: /^(piper-plus|onnxruntime-web)$/ }, (args) => ({
              path: args.path,
              namespace: "tts-fixture",
            }));
            builder.onLoad({ filter: /.*/, namespace: "tts-fixture" }, (args) => ({
              contents:
                args.path === "piper-plus" ? piperMockSource : "export const env = {wasm: {}};",
              loader: "js",
            }));
          },
        },
      ],
    }),
    postcss([tailwind({ base: root })]).process(
      await readFile(resolve(root, "app/globals.css"), "utf8"),
      { from: resolve(root, "app/globals.css") },
    ),
  ]);
  const styles = `${css.css}\n:root{--loaded-reddit-sans:system-ui;--loaded-ibm-plex-sans-jp:sans-serif}body{margin:0}header{flex-wrap:wrap}`;
  html = `<!doctype html><html><head><link rel="icon" href="data:,"></head><body><script>window.fixtureStyles=${JSON.stringify(styles).replaceAll("</script", "<\\/script")};${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></body></html>`;
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
    } else {
      collected.push(`unexpected ${request.method()} ${request.url()}`);
      await route.abort();
    }
  });
  await page.addInitScript(() => {
    // Fixture-only origin, seeded once so reload must consume real persisted state.
    if (localStorage.getItem("volume-fixture-seeded") !== "1") {
      const initial = new URLSearchParams(location.hash.slice(1)).get("volume") ?? "1";
      localStorage.setItem("rss-tts-volume", initial);
      localStorage.setItem("rss-tts-voice-uri", "piper:tsukuyomi");
      localStorage.setItem("tts-rate", "1");
      localStorage.setItem("unrelated-reader-setting", "unchanged");
      localStorage.setItem("volume-fixture-seeded", "1");
    }
    const writes: string[][] = [];
    (window as unknown as { volumeWrites: string[][] }).volumeWrites = writes;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      writes.push([key, String(value)]);
      return setItem.call(this, key, value);
    };
  });
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

interface AudioSnapshot {
  initializations: number;
  syntheses: number;
  sources: { starts: number; stops: number; disconnected: boolean }[];
  gains: { value: number; disconnected: boolean }[];
  toasts: string[];
  writes: string[][];
}
interface ReaderState {
  articleId: string;
  boundary: number;
  starts: number;
  playing: boolean;
  paused: boolean;
  ended: number;
  rate: number;
  volume: number;
  scrolls: number;
}
async function audio(page: Page): Promise<AudioSnapshot> {
  return page.evaluate(() =>
    (
      window as unknown as {
        volumeFixture: { inspect: () => AudioSnapshot };
      }
    ).volumeFixture.inspect(),
  );
}
async function reader(page: Page): Promise<ReaderState> {
  return JSON.parse(
    (await page.getByRole("status", { name: "読み上げ状態" }).textContent()) ?? "{}",
  );
}
function volume(page: Page) {
  return page.getByRole("button", { name: /^音量 / });
}
async function expectVolume(button: Locator, current: number, next: number) {
  await expect(button).toHaveAccessibleName(`音量 ${current}パーセント、次は ${next}パーセント`);
  await expect(button).toHaveAttribute("title", `音量: ${current}% → 次: ${next}%（10%ずつ調整）`);
  await expect(button.locator("svg")).toHaveAttribute("aria-hidden", "true");
  await expect(button.locator('path[d="M9 5l4 4M13 5l-4 4"]')).toHaveCount(current === 0 ? 1 : 0);
}
async function start(page: Page, initial = 100) {
  await page.goto(`${fixtureUrl}#volume=${initial / 100}`);
  await expect(volume(page)).toHaveCount(0);
  await page.getByRole("button", { name: "読み上げ", exact: true }).click();
  await expectVolume(volume(page), initial, initial === 0 ? 100 : Math.max(0, initial - 10));
  await expect.poll(async () => (await audio(page)).sources.length).toBe(1);
  await expect.poll(async () => (await audio(page)).gains[0].value).toBe(initial / 100);
  await expect.poll(async () => (await reader(page)).boundary).toBeGreaterThan(0);
}
async function expectContinuity(page: Page, boundary: number, paused = false) {
  const state = await reader(page);
  expect(state).toMatchObject({
    articleId: "volume-article",
    starts: 1,
    playing: true,
    paused,
    ended: 0,
    rate: 1,
    scrolls: 0,
  });
  expect(state.boundary).toBeGreaterThanOrEqual(boundary);
  expect(await audio(page)).toMatchObject({
    initializations: 1,
    syntheses: 1,
    sources: [{ starts: 1, stops: 0, disconnected: false }],
    toasts: [],
  });
  expect(await page.evaluate(() => localStorage.getItem("unrelated-reader-setting"))).toBe(
    "unchanged",
  );
  expect(await page.evaluate(() => localStorage.getItem("rss-tts-voice-uri"))).toBe(
    "piper:tsukuyomi",
  );
  expect(await page.evaluate(() => localStorage.getItem("tts-rate"))).toBe("1");
}

for (const theme of ["light", "dark"] as const) {
  test(`${theme} desktop: native Enter, Space and click change only volume once`, async ({
    page,
  }, info) => {
    await start(page);
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    const button = volume(page);
    const before = (await reader(page)).boundary;
    await page.getByRole("button", { name: "その他の操作を閉じる" }).focus();
    for (let step = 0; step < 6; step++) await page.keyboard.press("Tab");
    await expect(button).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "合成の読み上げを一時停止" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(button).toBeFocused();
    await page.keyboard.press("Enter");
    await expectVolume(button, 90, 80);
    await expect(button).toBeFocused();
    await page.keyboard.press("Space");
    await expectVolume(button, 80, 70);
    await button.click();
    await expectVolume(button, 70, 60);
    await expectContinuity(page, before);
    const state = await audio(page);
    expect(state.writes).toEqual([
      ["rss-tts-volume", "0.9"],
      ["rss-tts-volume", "0.8"],
      ["rss-tts-volume", "0.7"],
    ]);
    expect(state.gains).toEqual([{ value: 0.7, disconnected: false }]);
    await info.attach("focused-tts-volume", {
      body: await button.screenshot(),
      contentType: "image/png",
    });
    await page.getByRole("main", { name: "記事本文" }).focus();
    await page.keyboard.press("Space");
    await expect.poll(async () => (await reader(page)).scrolls).toBe(1);
    expect((await audio(page)).writes).toEqual(state.writes);
  });

  test.describe(`${theme} touch`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    test("tap cycles 100→90→…→0→100 while the active Piper source stays in place", async ({
      page,
    }, info) => {
      await start(page);
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      const button = volume(page);
      const bounds = await button.boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      const before = (await reader(page)).boundary;
      const expected = [90, 80, 70, 60, 50, 40, 30, 20, 10, 0, 100];
      for (const percent of expected) {
        await button.tap();
        await expectVolume(button, percent, percent === 0 ? 100 : percent - 10);
        await expect.poll(async () => (await audio(page)).gains[0].value).toBe(percent / 100);
      }
      await expectContinuity(page, before);
      expect((await audio(page)).writes).toEqual(
        expected.map((p) => ["rss-tts-volume", String(p / 100)]),
      );
      await info.attach("touch-tts-volume", {
        body: await button.screenshot(),
        contentType: "image/png",
      });
    });
  });
}

test("83% survives pause, hidden controls and reload; low positive slider settings clamp to mute", async ({
  page,
}) => {
  await start(page, 83);
  await page.getByRole("button", { name: "合成の読み上げを一時停止" }).click();
  await expect.poll(async () => (await reader(page)).paused).toBe(true);
  const before = (await reader(page)).boundary;
  await volume(page).click();
  await expectVolume(volume(page), 73, 63);
  await expectContinuity(page, before, true);
  expect((await audio(page)).gains).toEqual([{ value: 0.73, disconnected: false }]);
  await page.getByRole("button", { name: "その他の操作を閉じる" }).click();
  await expect(volume(page)).toHaveCount(0);
  await page.getByRole("button", { name: "その他の操作を開く" }).click();
  await expectVolume(volume(page), 73, 63);
  await expectContinuity(page, before, true);
  expect((await audio(page)).writes).toEqual([["rss-tts-volume", "0.73"]]);
  await page.getByRole("button", { name: "合成の一時停止を解除" }).click();
  await expect.poll(async () => (await reader(page)).boundary).toBeGreaterThan(before);
  await page.getByRole("button", { name: "読み上げを停止", exact: true }).click();
  await expect(volume(page)).toHaveCount(0);
  expect((await audio(page)).gains[0].disconnected).toBe(true);
  await page.reload();
  await expect(volume(page)).toHaveCount(0);
  await page.getByRole("button", { name: "読み上げ", exact: true }).click();
  await expectVolume(volume(page), 73, 63);
  await expect.poll(async () => (await audio(page)).gains[0]?.value).toBe(0.73);
  const slider = page.getByRole("slider", { name: "合成の音量設定" });
  await slider.focus();
  await page.keyboard.press("Home");
  for (let step = 0; step < 5; step++) await page.keyboard.press("ArrowRight");
  await expectVolume(volume(page), 5, 0);
  await volume(page).click();
  await expectVolume(volume(page), 0, 100);
  expect((await audio(page)).gains).toEqual([{ value: 0, disconnected: false }]);
  expect((await audio(page)).writes).toEqual(
    [0, 0.01, 0.02, 0.03, 0.04, 0.05, 0].map((value) => ["rss-tts-volume", String(value)]),
  );
});

test("mute applies to the active and subsequent chunks; natural completion and manual restart retain it", async ({
  page,
}) => {
  await start(page, 10);
  await volume(page).click();
  await expectVolume(volume(page), 0, 100);
  expect((await audio(page)).gains[0].value).toBe(0);
  await page.evaluate(() =>
    (window as unknown as { volumeFixture: { finish: () => void } }).volumeFixture.finish(),
  );
  await expect.poll(async () => (await audio(page)).sources.length).toBe(2);
  expect((await audio(page)).gains).toEqual([
    { value: 0, disconnected: true },
    { value: 0, disconnected: false },
  ]);
  await page.evaluate(() =>
    (window as unknown as { volumeFixture: { finish: () => void } }).volumeFixture.finish(),
  );
  await expect.poll(async () => (await reader(page)).ended).toBe(1);
  await expect(volume(page)).toHaveCount(0);
  expect((await audio(page)).gains.every((g) => g.disconnected)).toBe(true);
  await page.getByRole("button", { name: "読み上げ", exact: true }).click();
  await expectVolume(volume(page), 0, 100);
  await expect.poll(async () => (await audio(page)).sources.length).toBe(3);
  expect((await audio(page)).gains[2].value).toBe(0);
  await volume(page).click();
  await expectVolume(volume(page), 100, 90);
  expect((await audio(page)).gains[2].value).toBe(1);
  expect((await audio(page)).writes).toEqual([
    ["rss-tts-volume", "0"],
    ["rss-tts-volume", "1"],
  ]);
});
