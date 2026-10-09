import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const origin = "https://rss-push-feedback.test/";
let html = "";
test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const [{ outputFiles }, css] = await Promise.all([
    build({
      absWorkingDir: root,
      stdin: {
        resolveDir: root,
        loader: "tsx",
        contents: `
          import { useEffect, useState } from "react";
          import { createRoot } from "react-dom/client";
          import SidebarFooter from "./src/components/feed-sidebar/SidebarFooter";
          import { ToastProvider } from "./src/contexts/ToastContext";
          import { usePushNotifications } from "./src/hooks/usePushNotifications";
          import { onApiError } from "./src/lib/api-fetch";
          const noop = () => {};
          function Fixture() {
            const { sendTest } = usePushNotifications(null);
            const [results, setResults] = useState([]);
            const [globalErrors, setGlobalErrors] = useState(0);
            const [ready, setReady] = useState(false);
            useEffect(() => {
              const unsubscribe = onApiError(() => setGlobalErrors(n => n + 1));
              setReady(true);
              return unsubscribe;
            }, []);
            const record = type => message => setResults(items => [...items, { type, message }]);
            return <ToastProvider value={{ toasts: [], success: record("success"), error: record("error"), info: noop, undo: noop, dismiss: noop }}>
              <main>
                <SidebarFooter user={{ id: "synthetic", sub: "synthetic", name: "Reader", email: "reader@example.test", picture: null }}
                  theme="light" importing={false} onImport={noop} onShowReleaseNotes={noop} onShowStats={noop}
                  onExportOpml={noop} onShowFeedHealth={noop} onOpenSettings={noop} onOpenHelp={noop}
                  onToggleTheme={noop} onLogout={noop}
                  push={{ supported: true, subscribed: true, loading: false, error: null, onToggle: noop, onSendTest: sendTest }} />
                <output aria-label="fixture ready">{String(ready)}</output>
                <output aria-label="global errors">{globalErrors}</output>
                <ul aria-label="通知結果">{results.map((result, index) => <li key={index} data-kind={result.type}>{result.message}</li>)}</ul>
              </main>
            </ToastProvider>;
          }
          createRoot(document.getElementById("root")).render(<Fixture />);
        `,
      },
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"test"' },
      plugins: [
        {
          name: "synthetic-auth-ready",
          setup(builder) {
            builder.onLoad({ filter: /src\/hooks\/useAuth\.ts$/ }, () => ({
              contents:
                "export const getAuthReady = () => Promise.resolve(); export const getTokenExpiry = () => null;",
              loader: "ts",
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
  html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>${css.css}</style><div id="root"></div><script>${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></html>`;
});

type Result = number | "network" | "invalid-json" | "invalid-count";
async function mount(page: Page, result: Result) {
  const posts: string[] = [];
  const unexpected: string[] = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.url() === origin && request.method() === "GET") {
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    }
    if (request.url() === `${origin}api/push/test` && request.method() === "POST") {
      posts.push(request.method());
      if (result === "network") return route.abort("failed");
      if (result === "invalid-json")
        return route.fulfill({ status: 200, body: "synthetic invalid JSON" });
      if (result === "invalid-count")
        return route.fulfill({ json: { sent: 2, expired: 1, remaining: 2 } });
      if (result !== 200) return route.fulfill({ status: result, body: "" });
      return route.fulfill({ json: { sent: 2, expired: 0, remaining: 2 } });
    }
    unexpected.push(`${request.method()} ${request.url()}`);
    await route.abort();
  });
  await page.goto(origin);
  await expect(page.getByLabel("fixture ready")).toHaveText("true");
  return {
    posts,
    unexpected,
    setResult: (next: Result) => {
      result = next;
    },
  };
}

async function send(page: Page, keyboard = false) {
  const trigger = page.getByRole("button", { name: "その他のメニュー" });
  await trigger.click();
  const action = page.getByRole("menuitem", { name: "テスト通知を送信" });
  if (keyboard) {
    await action.focus();
    await action.press("Enter");
  } else await action.click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(trigger).toBeFocused();
}

for (const width of [390, 1280]) {
  test.describe(`${width}px push feedback`, () => {
    test.use({ viewport: { width, height: 850 } });
    for (const [result, message] of [
      [404, "サブスクリプションが見つかりません (再度購読してください)"],
      [503, "VAPID キーが未設定です (wrangler secret を確認してください)"],
      [429, "送信失敗 (429)"],
      [500, "送信失敗 (500)"],
      ["network", "ネットワークエラーが発生しました"],
      ["invalid-json", "通知の送信結果を確認できませんでした"],
      ["invalid-count", "通知の送信結果を確認できませんでした"],
    ] as const) {
      test(`${result} shows one error and no success`, async ({ page }) => {
        const state = await mount(page, result);
        await send(page, true);
        await expect(page.locator('[data-kind="error"]')).toHaveText(message);
        await expect(page.locator('[data-kind="success"]')).toHaveCount(0);
        await expect(page.getByLabel("global errors")).toHaveText("0");
        expect(state.posts).toEqual(["POST"]);
        expect(state.unexpected).toEqual([]);
      });
    }
    test("failure can be retried from the same menu with correct success feedback", async ({
      page,
    }) => {
      const state = await mount(page, "network");
      await send(page);
      await expect(page.locator('[data-kind="error"]')).toHaveText(
        "ネットワークエラーが発生しました",
      );
      state.setResult(200);
      await send(page, true);
      await expect(page.locator('[data-kind="success"]')).toHaveText(
        "テスト通知を 2 件送信しました",
      );
      await expect(page.locator('[data-kind="error"]')).toHaveCount(1);
      await expect(page.getByLabel("global errors")).toHaveText("0");
      expect(state.posts).toEqual(["POST", "POST"]);
      expect(state.unexpected).toEqual([]);
    });
    test("Escape cancellation sends no test notification", async ({ page }) => {
      const state = await mount(page, 200);
      const trigger = page.getByRole("button", { name: "その他のメニュー" });
      await trigger.click();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(state.posts).toEqual([]);
      await expect(page.getByRole("list", { name: "通知結果" }).getByRole("listitem")).toHaveCount(
        0,
      );
      expect(state.unexpected).toEqual([]);
    });
  });
}
