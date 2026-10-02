import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReaderSettings } from "../contexts/ReaderSettingsContext";
import type { CacheEntry, ImmersiveSummaryCacheOptions } from "../hooks/useImmersiveSummaryCache";
import type { ImmersiveTextPresentation } from "../lib/immersive-summary";
import type { CachedSummary } from "../lib/ai-summary-contract";
import { DEFAULT_AI_MODEL } from "../lib/ai-models";
import { makeArticle } from "../../e2e/helpers/article";
import { makeFeed } from "../../e2e/helpers/feed";
import ImmersiveArticleMode from "./ImmersiveArticleMode";

const state = vi.hoisted(() => ({
  entries: new Map<string, CacheEntry>(),
  settings: {} as ReaderSettings,
  visible: true,
  narrationText: "",
  narrationPaused: false,
  retry: vi.fn(),
  bodyCalls: vi.fn(),
  cacheOptions: null as ImmersiveSummaryCacheOptions | null,
}));
vi.mock("../contexts/ReaderSettingsContext", () => ({
  useOptionalReaderSettings: () => state.settings,
}));
vi.mock("../contexts/VisualModeContext", () => ({
  useVisualMode: () => ({ motionEnabled: true, motionReason: "", pageVisible: state.visible }),
}));
vi.mock("../hooks/useImmersiveSummaryCache", () => ({
  useImmersiveSummaryCache: (options: ImmersiveSummaryCacheOptions) => {
    state.cacheOptions = options;
    const contextKey = JSON.stringify([
      options.userId,
      options.scopeKey,
      options.model,
      options.authUsable,
    ]);
    return {
      contextKey,
      entries: state.entries,
      loading: false,
      disabledReason: null,
      getEntry: (url: string) => state.entries.get(url) ?? { kind: "loading" },
      retry: state.retry,
    };
  },
}));
vi.mock("../hooks/useImmersiveNarration", () => ({
  useImmersiveNarration: (_id: string, text: string, paused: boolean) => {
    state.narrationText = text;
    state.narrationPaused = paused;
    return { holding: false, enabled: false, toggle: vi.fn(), message: "" };
  },
}));
vi.mock("./CinematicArticle", () => ({
  default: ({
    article,
    textPresentation,
    active,
  }: {
    article: { title: string };
    textPresentation?: ImmersiveTextPresentation;
    active: boolean;
  }) =>
    active ? (
      <div>
        <h3>{article.title}</h3>
        <p data-testid="short-source">{textPresentation?.sourceLabel}</p>
        <p data-testid="short-text">{textPresentation?.text}</p>
      </div>
    ) : null,
}));
vi.mock("./ImmersiveInlineReader", () => ({
  default: ({ article, onClose }: { article: { title: string } | null; onClose: () => void }) => {
    if (!article) return null;
    state.bodyCalls(article.title);
    return (
      <div role="dialog" aria-label="本文">
        <h3>{article.title}</h3>
        <button onClick={onClose}>本文から戻る</button>
      </div>
    );
  },
}));
const articles = Array.from({ length: 14 }, (_, index) =>
  makeArticle({
    id: String(index),
    title: `要約記事 ${index}`,
    link: `https://example.com/${index}`,
    summary: `<p>フィード説明 ${index}</p>`,
    content: "",
    publishedAt: new Date(Date.now() - index * 1000).toISOString(),
  }),
);
const props = {
  candidates: articles,
  articles,
  feeds: [makeFeed({ id: articles[0].feedHash })],
  now: Date.now(),
  readIds: new Set<string>(),
  bookmarkIds: new Set<string>(),
  readingListIds: new Set<string>(),
  likeIds: new Set<string>(),
  historyIds: new Set<string>(),
  dismissedIds: new Set<string>(),
  onClose: vi.fn(),
  onSelectArticle: vi.fn(),
  onDismiss: vi.fn(),
  onRestore: vi.fn(),
  summaryAccount: { userId: "account-a", authUsable: true, scopeKey: "scope-a" },
};
function hit(index: number): CacheEntry {
  const summary: CachedSummary = {
    url: articles[index].link,
    result: `保存された要約 ${index}。`,
    metadata: {
      version: 1,
      model: DEFAULT_AI_MODEL,
      promptVersion: null,
      bodyHash: null,
      generatedAt: null,
      inputCharacters: null,
      inputTruncated: null,
      completeness: "unknown",
      usage: null,
    },
  };
  return { kind: "hit", summary };
}
const frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
function paint() {
  act(() => {
    for (let turn = 0; turn < 2; turn++) {
      const queued = [...frames.values()];
      frames.clear();
      queued.forEach((callback) => callback(turn * 16));
    }
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  state.entries.clear();
  frames.clear();
  frameId = 0;
  state.visible = true;
  state.settings = {
    aiModel: DEFAULT_AI_MODEL,
    aiProvider: "workers-ai",
    aiUserId: "account-a",
  } as ReaderSettings;
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("keeps late cached text out of the active caption and speech through pane open/close and pause", () => {
  const view = render(<ImmersiveArticleMode {...props} />);
  expect(screen.getByTestId("short-text")).toHaveTextContent("フィード説明 0");
  const initialNarration = state.narrationText;
  state.entries.set(articles[0].link, hit(0));
  view.rerender(<ImmersiveArticleMode {...props} />);
  expect(screen.getByTestId("short-text")).toHaveTextContent("フィード説明 0");
  expect(state.narrationText).toBe(initialNarration);
  fireEvent.click(screen.getByRole("button", { name: "保存済みAI要約を確認" }));
  expect(state.narrationPaused).toBe(true);
  expect(screen.getByRole("dialog", { name: "保存済みのAI要約" })).toHaveTextContent(
    "保存された要約 0",
  );
  expect(state.bodyCalls).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "ショート表示に戻る" }));
  paint();
  expect(screen.getByTestId("short-text")).toHaveTextContent("フィード説明 0");
  expect(state.narrationText).toBe(initialNarration);
  expect(screen.getByRole("button", { name: "保存済みAI要約を確認" })).toHaveFocus();
});

it("adopts a late hit only on explicit source switch, pauses it, and can restore the loaded excerpt", () => {
  const view = render(<ImmersiveArticleMode {...props} />);
  state.entries.set(articles[0].link, hit(0));
  view.rerender(<ImmersiveArticleMode {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "保存済みAI要約を確認" }));
  fireEvent.click(screen.getByRole("button", { name: "ショートをAI要約にする" }));
  expect(screen.getByTestId("short-text")).toHaveTextContent("保存された要約 0");
  expect(state.narrationText).toContain("保存された要約 0");
  expect(screen.getByRole("button", { name: "自動再生を再開" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "保存済みAI要約を確認" }));
  expect(screen.getByRole("button", { name: "ショートをAI要約にする" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "ショートを説明にする" }));
  expect(screen.getByTestId("short-text")).toHaveTextContent("フィード説明 0");
  expect(state.narrationPaused).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});

it("uses a prefetched hit when its article becomes active without reading the queued neighbor", () => {
  state.entries.set(articles[1].link, hit(1));
  const marked = vi.fn();
  render(<ImmersiveArticleMode {...props} onMarkRead={marked} />);
  paint();
  expect(marked.mock.calls).toEqual([["0"]]);
  expect(screen.getByTestId("short-text")).toHaveTextContent("フィード説明 0");
  fireEvent.click(screen.getByRole("button", { name: "次の記事" }));
  expect(screen.getByTestId("short-text")).toHaveTextContent("保存された要約 1");
  paint();
  expect(marked.mock.calls).toEqual([["0"], ["1"]]);
  expect(state.cacheOptions!.urls.length).toBeLessThanOrEqual(12);
});

it.each(["account", "scope", "model", "expired"])(
  "clears an adopted snapshot at a %s boundary",
  (boundary) => {
    state.entries.set(articles[0].link, hit(0));
    const view = render(<ImmersiveArticleMode {...props} />);
    expect(screen.getByTestId("short-text")).toHaveTextContent("保存された要約 0");
    state.entries.clear();
    if (boundary === "model") state.settings.aiModel = "@cf/google/gemma-4-26b-a4b-it";
    view.rerender(
      <ImmersiveArticleMode
        {...props}
        summaryAccount={{
          userId: boundary === "account" ? "account-b" : "account-a",
          scopeKey: boundary === "scope" ? "scope-b" : "scope-a",
          authUsable: boundary !== "expired",
        }}
      />,
    );
    expect(screen.getByTestId("short-text")).toHaveTextContent("フィード説明 0");
    expect(state.narrationText).not.toContain("保存された要約");
  },
);

it("keeps fallback extraction explicit and acknowledges a painted current title in the summary pane once", () => {
  state.entries.set(articles[0].link, { kind: "miss" });
  const marked = vi.fn();
  render(<ImmersiveArticleMode {...props} onMarkRead={marked} />);
  fireEvent.click(screen.getByRole("button", { name: "保存済みAI要約を確認" }));
  expect(state.bodyCalls).not.toHaveBeenCalled();
  paint();
  expect(marked.mock.calls).toEqual([["0"]]);
  fireEvent.click(screen.getByRole("button", { name: "保存済み要約を再確認" }));
  expect(state.retry).toHaveBeenCalledWith(articles[0].link);
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "保存済みのAI要約" })).getByRole("button", {
      name: "本文を読む",
    }),
  );
  expect(screen.getByRole("dialog", { name: "本文" })).toBeVisible();
  expect(state.bodyCalls).toHaveBeenCalledWith(articles[0].title);
  paint();
  expect(marked).toHaveBeenCalledTimes(1);
});

it("preserves the frozen excerpt while hidden, suppresses scheduling, and never marks a hidden card", () => {
  state.visible = false;
  const marked = vi.fn();
  const view = render(<ImmersiveArticleMode {...props} onMarkRead={marked} />);
  state.entries.set(articles[0].link, hit(0));
  view.rerender(<ImmersiveArticleMode {...props} onMarkRead={marked} />);
  paint();
  expect(marked).not.toHaveBeenCalled();
  expect(state.cacheOptions!.requestAllowed).toBe(false);
  expect(screen.getByTestId("short-text")).toHaveTextContent("フィード説明 0");
  state.visible = true;
  view.rerender(<ImmersiveArticleMode {...props} onMarkRead={marked} />);
  paint();
  expect(marked.mock.calls).toEqual([["0"]]);
  expect(screen.getByTestId("short-text")).toHaveTextContent("フィード説明 0");
});
