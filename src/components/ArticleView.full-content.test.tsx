// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useMemo, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ArticleView from "./ArticleView";
import FocusModeOverlay from "./FocusModeOverlay";
import SearchBar from "./article-list-header/SearchBar";
import { TestReaderSettings } from "../../e2e/helpers/reader-settings";
import { ArticleFilterProvider } from "../contexts/ArticleFilterContext";
import { ToastProvider } from "../contexts/ToastContext";
import { TtsAdapterProvider } from "../contexts/TtsAdapterContext";
import { useFilteredArticles } from "../hooks/useFilteredArticles";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";
import { useFocusMode } from "../hooks/useFocusMode";
import { useMobilePane } from "../hooks/useMobilePane";
import { getPopupOpenCount } from "../lib/popup-lock";
import type { Article } from "../types";
import type { FullContentIntent } from "../lib/full-content-intent";

// Keep the production reader, processing hook, manual shortcut, footer, and intent
// controller. Only network-backed content and AI boundaries are replaced.
const content = vi.hoisted(() => ({
  storedContent: null as string | null,
  fetching: false,
  fetchError: "",
  fetchRetryable: false,
  resolvedOgImage: null,
  fetchFullContent: vi.fn(async () => {}),
  fetchFullContentOnce: vi.fn(async () => {}),
}));
const ai = vi.hoisted(() => ({
  aiResult: null,
  aiResultProvider: null,
  aiLoading: false,
  aiError: null,
  translateResult: null,
  translateLoading: false,
  translateError: null,
  doRunAi: vi.fn(),
  resetAi: vi.fn(),
  doTranslate: vi.fn(),
  resetTranslate: vi.fn(),
}));
vi.mock("../hooks/useArticleContent", () => ({ useArticleContent: () => content }));
vi.mock("../hooks/useArticleAi", () => ({ useArticleAi: () => ai }));

const noop = () => {};
const empty = new Set<string>();
const baseArticle: Article = {
  id: "excerpt",
  feedHash: "feed",
  guid: "excerpt",
  title: "A long publisher excerpt",
  link: "https://example.com/article",
  summary: "A publisher excerpt",
  content: `<p>${"A publisher excerpt. ".repeat(40)}</p>`,
  createdAt: "2026-10-03T00:00:00Z",
  publishedAt: "2026-10-03T00:00:00Z",
};
type ReaderProps = Pick<
  ComponentProps<typeof ArticleView>,
  "article" | "fullContentIntent" | "consumeFullContentIntent" | "autoMode"
> & { integrated?: boolean };

function Reader({ article = baseArticle, integrated = false, ...props }: ReaderProps) {
  const articles = useMemo(() => (article ? [article] : []), [article]);
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
  return (
    <TestReaderSettings>
      <ArticleFilterProvider value={{ ...filter, onSaveFilter: async () => {} }}>
        <ToastProvider
          value={{ info: noop, success: noop, error: noop, undo: noop, dismiss: noop, toasts: [] }}
        >
          <TtsAdapterProvider value={tts}>
            {integrated ? (
              <IntegratedPanels article={article} {...props} />
            ) : (
              <ArticleView
                {...props}
                article={article}
                isBookmarked={false}
                onToggleBookmark={noop}
                isInReadingList={false}
                onToggleReadingList={noop}
                isLiked={false}
                onToggleLike={noop}
              />
            )}
          </TtsAdapterProvider>
        </ToastProvider>
      </ArticleFilterProvider>
    </TestReaderSettings>
  );
}
beforeEach(() => {
  localStorage.clear();
  content.storedContent = null;
  content.fetching = false;
  content.fetchError = "";
  content.fetchRetryable = false;
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function IntegratedPanels({ article, ...props }: ReaderProps) {
  // AppShell registers mobile history before focus, and leaves the pane reader
  // mounted while FocusModeOverlay renders its own reader instance.
  const pane = useMobilePane("view");
  const focus = useFocusMode();
  const articleViewProps: ComponentProps<typeof ArticleView> = {
    ...props,
    article,
    isBookmarked: false,
    onToggleBookmark: noop,
    isInReadingList: false,
    onToggleReadingList: noop,
    isLiked: false,
    onToggleLike: noop,
  };
  return (
    <>
      <SearchBar />
      <button onClick={focus.toggleFocusMode}>Open reader focus</button>
      <button onClick={focus.toggleListFocusMode}>Open list focus</button>
      <output aria-label="Mobile destination">{pane.mobilePane}</output>
      <output aria-label="List focus">{String(focus.listFocusMode)}</output>
      <div data-testid="pane-reader">
        <ArticleView {...articleViewProps} />
      </div>
      <FocusModeOverlay
        focusMode={focus.focusMode}
        exitFocusMode={focus.exitFocusMode}
        articleViewProps={articleViewProps}
      />
    </>
  );
}

describe("normal reader manual full content", () => {
  it.each([399, 400, 607])(
    "offers %i-character RSS excerpts without automatic fetching",
    (length) => {
      render(<Reader article={{ ...baseArticle, content: `<p>${"a".repeat(length - 7)}</p>` }} />);
      expect(content.fetchFullContent).not.toHaveBeenCalled();
      expect(content.fetchFullContentOnce).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "全文を取得" }));
      expect(content.fetchFullContent).toHaveBeenCalledOnce();
      expect(ai.doRunAi).not.toHaveBeenCalled();
      expect(ai.doTranslate).not.toHaveBeenCalled();
    },
  );

  it("keeps the V shortcut equivalent to the visible long-excerpt action", () => {
    render(<Reader article={baseArticle} />);
    expect(screen.getByRole("button", { name: "全文を取得" })).toBeEnabled();
    fireEvent.keyDown(document.body, { key: "v" });
    expect(content.fetchFullContent).toHaveBeenCalledOnce();
  });

  it("leaves V in an editable field as typing", () => {
    render(
      <>
        <Reader article={baseArticle} />
        <input aria-label="Reader note" />
      </>,
    );
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Reader note" }), { key: "v" });
    expect(content.fetchFullContent).not.toHaveBeenCalled();
  });

  it("disables pending requests, then reuses the fetched body", () => {
    const { rerender } = render(<Reader article={baseArticle} />);
    fireEvent.click(screen.getByRole("button", { name: "全文を取得" }));
    content.fetching = true;
    rerender(<Reader article={baseArticle} />);
    const button = screen.getByRole("button", { name: /取得中/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    fireEvent.click(button);
    fireEvent.keyDown(document.body, { key: "v" });
    expect(content.fetchFullContent).toHaveBeenCalledOnce();
    content.fetching = false;
    content.storedContent = "<p>The fetched source remainder</p>";
    rerender(<Reader article={baseArticle} />);
    expect(screen.getByText("The fetched source remainder")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "全文を取得" })).toBeNull();
    fireEvent.keyDown(document.body, { key: "v" });
    expect(content.fetchFullContent).toHaveBeenCalledOnce();
  });

  it("keeps manual retry available after an extraction error", () => {
    content.fetchError = "Extraction temporarily unavailable";
    content.fetchRetryable = true;
    render(<Reader article={baseArticle} />);
    expect(screen.getByRole("alert")).toHaveTextContent(content.fetchError);
    fireEvent.click(screen.getByRole("button", { name: "再試行" }));
    expect(content.fetchFullContent).toHaveBeenCalledOnce();
  });

  it("does not add reconnect fetching to the newly visible long-excerpt footer", () => {
    content.fetchError = "Offline source request";
    content.fetchRetryable = true;
    render(<Reader article={baseArticle} />);
    fireEvent(window, new Event("offline"));
    fireEvent(window, new Event("online"));
    expect(content.fetchFullContent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "再試行" }));
    expect(content.fetchFullContent).toHaveBeenCalledOnce();
    fireEvent(window, new Event("offline"));
    fireEvent(window, new Event("online"));
    expect(content.fetchFullContent).toHaveBeenCalledOnce();
  });

  it("retains the existing one-time reconnect retry for short feed content", () => {
    content.fetchError = "Offline source request";
    content.fetchRetryable = true;
    render(<Reader article={{ ...baseArticle, content: "<p>Short excerpt</p>" }} />);
    fireEvent(window, new Event("offline"));
    fireEvent(window, new Event("online"));
    expect(content.fetchFullContent).toHaveBeenCalledOnce();
    fireEvent(window, new Event("offline"));
    fireEvent(window, new Event("online"));
    expect(content.fetchFullContent).toHaveBeenCalledOnce();
  });

  it.each([
    "",
    "not-a-url",
    "http://127.0.0.1/private",
    "https://www.youtube.com/watch?v=ABCDEFGHIJK",
    "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
  ])("does not expose or invoke manual extraction for %s", (link) => {
    render(<Reader article={{ ...baseArticle, link }} />);
    expect(screen.queryByRole("button", { name: "全文を取得" })).toBeNull();
    fireEvent.keyDown(document.body, { key: "v" });
    expect(content.fetchFullContent).not.toHaveBeenCalled();
  });

  it("does not expand automatic fetching when long excerpts receive an intent or auto mode", () => {
    const consume = vi.fn(() => true);
    const intent: FullContentIntent = {
      requestId: 12,
      articleId: baseArticle.id,
      link: baseArticle.link!,
      target: "pane",
    };
    render(
      <Reader
        article={baseArticle}
        fullContentIntent={intent}
        consumeFullContentIntent={consume}
        autoMode
      />,
    );
    expect(consume).toHaveBeenCalledOnce();
    expect(consume).toHaveBeenCalledWith(12);
    expect(content.fetchFullContent).not.toHaveBeenCalled();
    expect(content.fetchFullContentOnce).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "全文を取得" }));
    expect(content.fetchFullContent).toHaveBeenCalledOnce();
  });

  it("retains existing matching short-content intent behavior", () => {
    render(
      <Reader
        article={{ ...baseArticle, content: "<p>Short excerpt</p>" }}
        fullContentIntent={{
          requestId: 13,
          articleId: baseArticle.id,
          link: baseArticle.link!,
          target: "pane",
        }}
      />,
    );
    expect(content.fetchFullContentOnce).toHaveBeenCalledOnce();
    expect(content.fetchFullContent).not.toHaveBeenCalled();
  });

  it("does not consume an intent for another presentation", () => {
    const consume = vi.fn(() => true);
    render(
      <Reader
        article={baseArticle}
        fullContentIntent={{
          requestId: 14,
          articleId: baseArticle.id,
          link: baseArticle.link!,
          target: "overlay",
        }}
        consumeFullContentIntent={consume}
      />,
    );
    expect(consume).not.toHaveBeenCalled();
    expect(content.fetchFullContent).not.toHaveBeenCalled();
    expect(content.fetchFullContentOnce).not.toHaveBeenCalled();
  });
});

describe("integrated search, focus and manual reading", () => {
  let baseState: unknown;
  let back: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    baseState = window.history.state;
    back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  });
  afterEach(() => window.history.replaceState(baseState, ""));

  function finishBack() {
    expect(back).toHaveBeenCalledOnce();
    const destination = { mobilePane: "view", router: "preserved" };
    window.history.replaceState(destination, "");
    act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: destination })));
  }

  it("fetches manually in reader focus and returns from a pending footer without losing position", () => {
    window.history.replaceState({ router: "preserved" }, "");
    const view = render(<Reader article={baseArticle} integrated />);
    const pane = screen.getByTestId("pane-reader");
    pane.scrollTop = 640;
    const trigger = screen.getByRole("button", { name: "Open reader focus" });
    act(() => trigger.focus());
    const returnFocus = vi.spyOn(trigger, "focus");
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "フォーカスモード" });
    const fetch = within(dialog).getByRole("button", { name: "全文を取得" });
    expect(content.fetchFullContent).not.toHaveBeenCalled();
    expect(content.fetchFullContentOnce).not.toHaveBeenCalled();
    fireEvent.click(fetch);
    expect(content.fetchFullContent).toHaveBeenCalledOnce();
    content.fetching = true;
    view.rerender(<Reader article={baseArticle} integrated />);
    const pending = within(dialog).getByRole("button", { name: /取得中/ });
    expect(pending).toBeDisabled();
    fireEvent.keyDown(pending, { key: "v" });
    expect(content.fetchFullContent).toHaveBeenCalledOnce();
    fireEvent.keyDown(pending, { key: "Escape" });
    fireEvent.keyDown(pending, { key: "Escape" });
    expect(dialog).toBeInTheDocument();
    finishBack();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(returnFocus).toHaveBeenLastCalledWith({ preventScroll: true });
    expect(screen.getByTestId("pane-reader")).toBe(pane);
    expect(pane.scrollTop).toBe(640);
    expect(screen.getByRole("status", { name: "Mobile destination" })).toHaveTextContent("view");
    expect(window.history.state).toEqual({
      mobilePane: "view",
      mobilePaneNavigationIndex: 0,
      router: "preserved",
    });
    expect(getPopupOpenCount()).toBe(0);
    content.fetching = false;
    content.storedContent = "<p>Completed while reader focus closed</p>";
    view.rerender(<Reader article={baseArticle} integrated />);
    expect(screen.getByText("Completed while reader focus closed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "全文を取得" })).toBeNull();
    fireEvent.keyDown(trigger, { key: "v" });
    expect(content.fetchFullContent).toHaveBeenCalledOnce();
  });

  it.each([{ isComposing: true }, { keyCode: 229 }])(
    "keeps composition and Save Escape independent of the reader V action (%j)",
    (marker) => {
      localStorage.setItem("rss-search-history", JSON.stringify(["title:history"]));
      render(<Reader article={baseArticle} integrated />);
      fireEvent.click(screen.getByRole("button", { name: "Open list focus" }));
      const search = screen.getByRole("combobox");
      fireEvent.change(search, { target: { value: "title:original" } });
      act(() => search.focus());
      const history = localStorage.getItem("rss-search-history");
      for (const key of ["Enter", "Escape", "ArrowDown", "Delete", "v"]) {
        const event = new KeyboardEvent("keydown", {
          key,
          shiftKey: key === "Delete",
          ...marker,
          bubbles: true,
          cancelable: true,
        });
        act(() => search.dispatchEvent(event));
        expect(event.defaultPrevented).toBe(false);
        expect(search).toHaveValue("title:original");
        expect(search).toHaveAttribute("aria-expanded", "true");
        expect(localStorage.getItem("rss-search-history")).toBe(history);
        expect(content.fetchFullContent).not.toHaveBeenCalled();
        expect(back).not.toHaveBeenCalled();
      }
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      const name = screen.getByLabelText("検索を保存するための名前");
      fireEvent.keyDown(name, { key: "Enter", ...marker });
      fireEvent.keyDown(name, { key: "v" });
      expect(localStorage.getItem("rss-saved-searches")).toBeNull();
      expect(content.fetchFullContent).not.toHaveBeenCalled();
      const save = screen.getByRole("button", { name: "保存" });
      act(() => save.focus());
      fireEvent.keyDown(save, { key: "Escape" });
      expect(back).not.toHaveBeenCalled();
      expect(search).toHaveFocus();
      expect(screen.queryByLabelText("検索を保存するための名前")).toBeNull();
      const fetch = screen.getByRole("button", { name: "全文を取得" });
      act(() => fetch.focus());
      fireEvent.keyDown(fetch, { key: "v" });
      expect(content.fetchFullContent).toHaveBeenCalledOnce();
      fireEvent.keyDown(fetch, { key: "Escape" });
      finishBack();
      expect(screen.getByRole("status", { name: "List focus" })).toHaveTextContent("false");
      expect(search).toHaveValue("title:original");
      expect(getPopupOpenCount()).toBe(0);
    },
  );

  it("keeps long-excerpt reconnect manual before, during and after reader focus", () => {
    content.fetchError = "Offline extraction";
    content.fetchRetryable = true;
    render(<Reader article={baseArticle} integrated />);
    const reconnect = () => {
      fireEvent(window, new Event("offline"));
      fireEvent(window, new Event("online"));
    };
    reconnect();
    fireEvent.click(screen.getByRole("button", { name: "Open reader focus" }));
    reconnect();
    expect(content.fetchFullContent).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "再試行" }));
    expect(content.fetchFullContent).toHaveBeenCalledOnce();
    reconnect();
    fireEvent.click(screen.getByRole("button", { name: "フォーカスモード終了" }));
    finishBack();
    reconnect();
    expect(content.fetchFullContent).toHaveBeenCalledOnce();
    expect(content.fetchFullContentOnce).not.toHaveBeenCalled();
    expect(ai.doRunAi).not.toHaveBeenCalled();
    expect(ai.doTranslate).not.toHaveBeenCalled();
  });
});
