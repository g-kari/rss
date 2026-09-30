import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";

let viewerScript: string;
let viewerStyles: string;

test.beforeAll(async () => {
  // Bundle the actual React component and hooks, not a copy of their event handlers.
  const result = await build({
    stdin: {
      contents: `import { createRoot } from "react-dom/client";
        import Harness from "./e2e/helpers/slide-viewer-keyboard";
        createRoot(document.getElementById("root")).render(<Harness />);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  viewerScript = result.outputFiles[0]!.text;
  const styles = await readFile("app/globals.css", "utf8");
  viewerStyles = styles.slice(styles.indexOf("/* Docswell uses a native top-layer dialog"));
});

test.beforeEach(async ({ page }) => {
  // No live provider or account is needed; this iframe still has its own browsing context.
  await page.route("https://speakerdeck.com/player/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><button id="player">Player</button><output id="page">1</output>
        <script>document.addEventListener("keydown", event => {
          if (event.key === "ArrowRight") document.getElementById("page").textContent = "2";
        });</script>`,
    }),
  );
  await page.setContent('<div id="root"></div>');
  await page.addStyleTag({ content: viewerStyles });
  await page.addScriptTag({ content: viewerScript });
  await expect(page.getByTestId("selected")).toHaveText("Current");
});

test("expanded dialog isolates article keys and returns shortcuts after Escape", async ({
  page,
}) => {
  const trigger = page.getByRole("button", { name: "スライドを拡大" });
  await trigger.click();
  const close = page.getByRole("button", { name: "閉じる" });
  await expect(close).toBeFocused();
  for (const key of ["PageDown", "j", "ArrowDown", "PageUp", "k", "ArrowUp", "b", "r", "?"]) {
    await page.keyboard.press(key);
  }
  await expect(page.getByTestId("selected")).toHaveText("Current");
  await expect(page.getByTestId("read")).toBeEmpty();
  await expect(page.getByTestId("actions")).toHaveText("0");
  await expect(page.getByTestId("help")).toHaveText("false");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press("j");
  await expect(page.getByTestId("selected")).toHaveText("Next");
  await expect(page.getByTestId("read")).toHaveText("Next");
});

test("native Tab, iframe keys, and Enter/Space Close preserve the same player", async ({
  page,
}) => {
  const player = page.frameLocator("iframe");
  const trigger = page.getByRole("button", { name: "スライドを拡大" });
  const close = page.getByRole("button", { name: "閉じる" });
  await trigger.click();
  await page.keyboard.press("Tab");
  await expect(player.getByRole("button", { name: "Player" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(player.locator("output")).toHaveText("2");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link")).toBeFocused();
  await page.keyboard.press("PageDown");
  await expect(page.getByTestId("selected")).toHaveText("Current");
  await expect(page.getByTestId("read")).toBeEmpty();
  await page.keyboard.press("Shift+Tab");
  await expect(player.getByRole("button", { name: "Player" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(trigger).toBeFocused();
  await expect(player.locator("output")).toHaveText("2");
  await trigger.click();
  await expect(close).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(player.locator("output")).toHaveText("2");
});
