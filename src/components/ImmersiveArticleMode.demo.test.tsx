import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { installDemoFetch } from "../../app/demo/mock";
import { ReaderSettingsProvider, type ReaderSettings } from "../contexts/ReaderSettingsContext";
import { DEFAULT_AI_MODEL } from "../lib/ai-models";
import type { Article, Feed } from "../types";
import ImmersiveArticleMode from "./ImmersiveArticleMode";

const demoGlobal = globalThis as typeof globalThis & { __demoFetchOriginal?: typeof fetch };
const escapedFetch = vi.fn<typeof fetch>();
let previousPath: string;

beforeEach(() => {
  previousPath = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, "", "/demo");
  escapedFetch.mockReset().mockRejectedValue(new Error("Demo requests must remain local"));
  vi.stubGlobal("fetch", escapedFetch);
  installDemoFetch();
});

afterEach(() => {
  cleanup();
  delete demoGlobal.__demoFetchOriginal;
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", previousPath);
});

it("opens the real demo article without a cache hit and keeps the disabled summary pane reversible", async () => {
  // Use the same API data as the full-App hosted QA, without manufacturing a cache hit
  // or replacing useImmersiveSummaryCache, resolveImmersiveText or either reader component.
  const articles = (await (await fetch("/api/articles")).json()) as Article[];
  const feeds = (await (await fetch("/api/feeds")).json()) as Feed[];
  const article = articles[0]!;
  expect(article.link).toBeUndefined();
  expect(article.content).toContain("React 19");
  const close = vi.fn();
  const settings = {
    aiProvider: "workers-ai",
    aiModel: DEFAULT_AI_MODEL,
    aiUserId: "demo-user",
  } as ReaderSettings;

  render(
    <ReaderSettingsProvider value={settings}>
      <ImmersiveArticleMode
        candidates={[article]}
        articles={[article]}
        feeds={feeds}
        now={Date.now()}
        readIds={new Set()}
        bookmarkIds={new Set()}
        readingListIds={new Set()}
        likeIds={new Set()}
        historyIds={new Set()}
        dismissedIds={new Set()}
        summaryAccount={{ userId: "demo-user", authUsable: true, scopeKey: "demo" }}
        onClose={close}
        onSelectArticle={vi.fn()}
        onDismiss={vi.fn()}
        onRestore={vi.fn()}
      />
    </ReaderSettingsProvider>,
  );

  expect(screen.getByRole("heading", { name: article.title })).toBeVisible();
  expect(screen.getAllByText("フィード説明の抜粋", { exact: false })[0]).toBeVisible();
  for (let repeat = 0; repeat < 2; repeat++) {
    fireEvent.click(screen.getByRole("button", { name: "保存済みAI要約を確認" }));
    const summary = screen.getByRole("dialog", { name: "保存済みのAI要約" });
    expect(within(summary).getByTestId("summary-availability")).toHaveTextContent(
      "この記事のURLでは保存済み要約を利用できません",
    );
    expect(within(summary).queryByRole("button", { name: "ショートをAI要約にする" })).toBeNull();
    fireEvent.click(within(summary).getByRole("button", { name: "ショート表示に戻る" }));
    expect(screen.queryByRole("dialog", { name: "保存済みのAI要約" })).toBeNull();
    expect(screen.getByRole("heading", { name: article.title })).toBeVisible();
  }
  fireEvent.keyDown(screen.getByRole("dialog", { name: "ドパガキモード" }), { key: "Escape" });
  expect(close).toHaveBeenCalledTimes(1);
  expect(escapedFetch).not.toHaveBeenCalled();
});
