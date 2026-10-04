// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useLayoutEffect, useMemo, useState, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ArticleView from "./ArticleView";
import FocusModeOverlay from "./FocusModeOverlay";
import { TestReaderSettings } from "../../e2e/helpers/reader-settings";
import { ArticleFilterProvider } from "../contexts/ArticleFilterContext";
import { ToastProvider } from "../contexts/ToastContext";
import { TtsAdapterProvider } from "../contexts/TtsAdapterContext";
import { useFilteredArticles } from "../hooks/useFilteredArticles";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";
import { getPopupOpenCount } from "../lib/popup-lock";
import type { Article } from "../types";

// Real ArticleView, content hook, apiFetch, cache and shortcuts. Replace only
// the final HTTP boundary; no account, extraction or AI service is contacted.
const empty = new Set<string>();
const noop = () => {};
let sequence = 0;
let requests: Array<{ url: string; resolve: (response: Response) => void }>;

function Readers({
  differentPane = false,
  publisherMarker = false,
  dispatchOnClose = false,
}: {
  differentPane?: boolean;
  publisherMarker?: boolean;
  dispatchOnClose?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  const [wasOpened, setWasOpened] = useState(false);
  useLayoutEffect(() => {
    if (dispatchOnClose && wasOpened && !focus) {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "v", bubbles: true }));
    }
  }, [dispatchOnClose, wasOpened, focus]);
  const articles = useMemo<Article[]>(() => {
    const id = `shortcut-${++sequence}`;
    return [0, 1].map((index) => ({
      id: `${id}-${index}`,
      feedHash: "feed",
      guid: `${id}-${index}`,
      title: `Source ${index}`,
      link: `https://example.com/${id}/${index}`,
      summary: "Publisher excerpt",
      content: `<p${publisherMarker ? ' data-reader-focus-overlay="true"' : ""}>${"Publisher excerpt. ".repeat(40)}</p>`,
      ogImage: "https://example.com/static-image.jpg",
      createdAt: "2026-10-04T00:00:00Z",
      publishedAt: "2026-10-04T00:00:00Z",
    }));
  }, []);
  const filter = useFilteredArticles({
    articles,
    feedId: null,
    readIds: empty,
    bookmarkIds: empty,
    readingListIds: empty,
    globalFilter: null,
    setGlobalFilter: noop,
  });
  const tts = useSpeechSynthesis();
  const props: ComponentProps<typeof ArticleView> = {
    article: articles[0],
    isBookmarked: false,
    onToggleBookmark: noop,
    isInReadingList: false,
    onToggleReadingList: noop,
    isLiked: false,
    onToggleLike: noop,
    onSetNote: noop,
    note: "Existing note",
  };
  return (
    <TestReaderSettings>
      <ArticleFilterProvider value={{ ...filter, onSaveFilter: async () => {} }}>
        <ToastProvider
          value={{ info: noop, success: noop, error: noop, undo: noop, dismiss: noop, toasts: [] }}
        >
          <TtsAdapterProvider value={tts}>
            <button
              onClick={() => {
                setWasOpened(true);
                setFocus(true);
              }}
            >
              Open reader focus
            </button>
            <div data-testid="pane-reader">
              <ArticleView {...props} article={articles[differentPane ? 1 : 0]} />
            </div>
            <FocusModeOverlay
              focusMode={focus}
              exitFocusMode={() => setFocus(false)}
              articleViewProps={props}
            />
          </TtsAdapterProvider>
        </ToastProvider>
      </ArticleFilterProvider>
    </TestReaderSettings>
  );
}

async function drain() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  localStorage.clear();
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      if (!input.startsWith("/api/content?url="))
        throw new Error(`Unexpected HTTP request: ${input}`);
      return new Promise<Response>((resolve) => requests.push({ url: input, resolve }));
    }),
  );
});
afterEach(async () => {
  cleanup();
  await act(async () => {
    for (const request of requests)
      request.resolve(Response.json({ error: "Synthetic source unavailable" }, { status: 404 }));
  });
  expect(getPopupOpenCount()).toBe(0);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("focused reader shortcut ownership", () => {
  it.each([false, true])(
    "publisher attributes cannot claim ownership (focus: %s)",
    async (focus) => {
      render(<Readers publisherMarker />);
      if (focus) fireEvent.click(screen.getByRole("button", { name: "Open reader focus" }));
      fireEvent.keyDown(document.body, { key: "v" });
      await drain();
      expect(requests).toHaveLength(1);
    },
  );

  it("ignores a detached focus reader before passive listener cleanup", async () => {
    render(<Readers dispatchOnClose />);
    fireEvent.click(screen.getByRole("button", { name: "Open reader focus" }));
    fireEvent.click(screen.getByRole("button", { name: "フォーカスモード終了" }));
    await drain();
    expect(requests).toHaveLength(1);
  });
  it.each([false, true])(
    "V sends one HTTP request, leaving the pane idle (different source: %s)",
    async (differentPane) => {
      render(<Readers differentPane={differentPane} />);
      fireEvent.click(screen.getByRole("button", { name: "Open reader focus" }));
      const dialog = screen.getByRole("dialog", { name: "フォーカスモード" });
      const action = within(dialog).getByRole("button", { name: "全文を取得" });
      fireEvent.keyDown(action, { key: "v" });
      await drain();
      expect(requests).toHaveLength(1);
      expect(decodeURIComponent(requests[0].url)).toMatch(/\/0$/);
      expect(within(dialog).getByRole("button", { name: /取得中/ })).toBeDisabled();
      expect(
        within(screen.getByTestId("pane-reader")).getByRole("button", { name: "全文を取得" }),
      ).toBeEnabled();
      fireEvent.keyDown(action, { key: "v" });
      await drain();
      expect(requests).toHaveLength(1);
    },
  );

  it("owns document-target V too and restores pane V after close", async () => {
    render(<Readers />);
    fireEvent.click(screen.getByRole("button", { name: "Open reader focus" }));
    fireEvent.keyDown(document.body, { key: "v" });
    await drain();
    expect(requests).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "フォーカスモード終了" }));
    fireEvent.keyDown(document.body, { key: "v" });
    await drain();
    expect(requests).toHaveLength(2);
    expect(screen.getByRole("button", { name: /取得中/ })).toBeDisabled();
  });

  it("does not send V from an editable note and keeps ordinary V working", async () => {
    render(<Readers />);
    fireEvent.click(screen.getByRole("button", { name: "Open reader focus" }));
    fireEvent.keyDown(
      within(screen.getByRole("dialog")).getByRole("textbox", { name: "この記事へのメモ" }),
      { key: "v" },
    );
    await drain();
    expect(requests).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "フォーカスモード終了" }));
    fireEvent.keyDown(document.body, { key: "v" });
    await drain();
    expect(requests).toHaveLength(1);
  });

  it("Space scrolls only the focused reader", () => {
    render(<Readers />);
    const pane = screen.getByTestId("pane-reader").querySelector("article")!;
    const paneScroll = vi.spyOn(pane, "scrollBy");
    fireEvent.click(screen.getByRole("button", { name: "Open reader focus" }));
    const focused = within(screen.getByRole("dialog")).getByRole("article", { name: "記事本文" });
    const focusScroll = vi.spyOn(focused, "scrollBy");
    fireEvent.keyDown(focused, { key: " " });
    expect(focusScroll).toHaveBeenCalledOnce();
    expect(paneScroll).not.toHaveBeenCalled();
  });
});
