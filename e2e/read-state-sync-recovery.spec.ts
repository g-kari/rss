import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import { resolve } from "node:path";

// The actual hook and API wrapper run against a synthetic, fully intercepted origin.
// No account, credentials, live endpoint, new storage infrastructure or Next server.
const fixtureUrl = "https://rss-sync-recovery.test/";
const stateUrl = `${fixtureUrl}api/read-state`;
let html = "";
const diagnostics = new WeakMap<Page, { bodies: string[]; errors: string[] }>();
const emptyState = { readIds: [], bookmarkIds: [], readingListIds: [], likeIds: [] };

test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const { outputFiles } = await build({
    absWorkingDir: root,
    stdin: {
      resolveDir: root,
      sourcefile: "synthetic-sync-recovery.tsx",
      loader: "tsx",
      contents: `
        import { useRef } from "react";
        import { createRoot } from "react-dom/client";
        import { useReadStateSyncFlush } from "./src/hooks/useReadStateSyncFlush";
        import { emptyPendingSets } from "./src/lib/read-state-storage";
        function Fixture() {
          const stateRef = useRef({
            read: new Set(), bookmarks: new Set(), readingList: new Set(), likes: new Set(),
            readBeforeTimestamp: null, snoozedUntil: {}, notes: {}, tagIds: {}, ttlDays: null,
          });
          const added = useRef(emptyPendingSets());
          const removed = useRef(emptyPendingSets());
          const applyServerState = useRef(() => {}).current;
          const sync = useReadStateSyncFlush({
            user: { sub: "synthetic-user" }, stateRef,
            globalFilterRef: useRef(null), lastServerSyncRef: useRef(0),
            applyServerState, pendingAddedRef: added, pendingRemovedRef: removed,
            pendingTagChangedRef: useRef(new Set()), pendingTagRemovedRef: useRef(new Set()),
            pendingNotesChangedRef: useRef(new Set()), pendingNotesRemovedRef: useRef(new Set()),
            globalFilterDirtyRef: useRef(false),
          });
          function save() {
            stateRef.current.bookmarks.add("bookmark-1");
            stateRef.current.notes["note-1"] = "Synthetic note";
            added.current.bookmarks.add("bookmark-1");
            removed.current.bookmarks.add("old-bookmark");
            sync.scheduleSyncToServer();
            sync.syncImmediately();
          }
          return <main>
            <button onClick={save}>合成変更を保存</button>
            <output aria-label="同期状態">{sync.hasPendingChanges ? "同期待ち" : "同期済み"}</output>
          </main>;
        }
        createRoot(document.getElementById("root")).render(<Fixture />);
      `,
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"' },
  });
  html = `<!doctype html><html lang="ja"><meta charset="utf-8"><link rel="icon" href="data:,"><div id="root"></div><script>${outputFiles![0].text.replaceAll("</script", "<\\/script")}</script></html>`;
});

test.beforeEach(async ({ page }) => {
  const state = { bodies: [] as string[], errors: [] as string[] };
  diagnostics.set(page, state);
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.url() === fixtureUrl && request.isNavigationRequest()) {
      await route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    } else if (request.url() === stateUrl && request.method() === "GET") {
      await route.fulfill({ json: emptyState });
    } else if (request.url() === stateUrl && request.method() === "POST") {
      state.bodies.push(request.postData() ?? "");
      if (state.bodies.length === 1) {
        await route.fulfill({ status: 503, json: { error: "Synthetic failure" } });
      } else {
        await route.fulfill({ json: { ...emptyState, bookmarkIds: ["bookmark-1"] } });
      }
    } else {
      state.errors.push(`unexpected ${request.method()} ${request.url()}`);
      await route.abort();
    }
  });
  await page.goto(fixtureUrl);
});

test.afterEach(({ page }) => expect(diagnostics.get(page)?.errors).toEqual([]));

test("a failed POST retries once on reconnect without another edit", async ({ page }) => {
  const failedResponse = page.waitForResponse(
    (response) => response.url() === stateUrl && response.status() === 503,
  );
  await page.getByRole("button", { name: "合成変更を保存" }).click();
  await (await failedResponse).finished();
  await expect.poll(() => diagnostics.get(page)?.bodies.length).toBe(1);
  await expect(page.getByLabel("同期状態")).toHaveText("同期待ち");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => diagnostics.get(page)?.bodies.length).toBe(2);
  await expect(page.getByLabel("同期状態")).toHaveText("同期済み");
  const bodies = diagnostics.get(page)!.bodies;
  expect(bodies[1]).toBe(bodies[0]);
  expect(JSON.parse(bodies[1])).toMatchObject({
    bookmarkIds: ["bookmark-1"],
    removedIds: { bookmarkIds: ["old-bookmark"] },
    notes: { "note-1": "Synthetic note" },
  });
  await page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
  });
  expect(bodies).toHaveLength(2);
});

test("unloading after failure retains the existing overflow recovery payload", async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "sendBeacon", { value: () => false, configurable: true });
  });
  const failedResponse = page.waitForResponse(
    (response) => response.url() === stateUrl && response.status() === 503,
  );
  await page.getByRole("button", { name: "合成変更を保存" }).click();
  await (await failedResponse).finished();
  await expect.poll(() => diagnostics.get(page)?.bodies.length).toBe(1);
  await expect(page.getByLabel("同期状態")).toHaveText("同期待ち");
  await page.evaluate(() => window.dispatchEvent(new Event("beforeunload")));
  const body = diagnostics.get(page)!.bodies[0];
  expect(await page.evaluate(() => localStorage.getItem("rss-beacon-overflow"))).toBe(body);
  expect(diagnostics.get(page)?.bodies).toHaveLength(1);
});
