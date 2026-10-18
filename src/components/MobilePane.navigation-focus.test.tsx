import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeArticle } from "../../e2e/helpers/article";
import { SelectedArticleCtx } from "../contexts/SelectedArticleContext";
import { useArticleSelection } from "../hooks/useArticleSelection";
import { useArticleViewProps } from "../hooks/useArticleViewProps";
import { useMobilePane } from "../hooks/useMobilePane";
import { useMobileArticleReturnFocus } from "../hooks/useMobileArticleReturnFocus";
import type { Article } from "../types";
import { CompactArticleItem } from "./article-items/CompactItem";
import { MobilePane } from "./MobilePane";

// Synthetic data only. Production pane, row, keyboard handler, selection, history
// listener, and reader navigation callback are imported without mocks.
// The reader body is intentionally small: it binds the same onMobileBack callback
// as ArticleHeader, without mounting unrelated network/AI/TTS consumers.
const article = makeArticle({ id: "mobile-focus-fixture", title: "Mobile focus fixture" });
const markRead = vi.fn();
const addToHistory = vi.fn();
const noop = () => {};
const emptyIds = new Set<string>();

function NavigationFixture() {
  // A retained selection in list view is an ordinary state after returning from
  // the reader. Keep the selected row keyboard-reachable as in the real list.
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(article);
  const { mobilePane, setMobilePane } = useMobilePane("list");
  const { selectArticle } = useArticleSelection({
    setSelectedArticle,
    markRead,
    addToHistory,
    setMobilePane,
    isDesktop: false,
    listFocusMode: false,
  });
  // Same orchestration binding as AppShell, with synthetic logical list data.
  useMobileArticleReturnFocus({
    mobilePane,
    isDesktop: false,
    selectedArticleId: selectedArticle?.id ?? null,
    visibleArticles: [article],
    blocked: false,
  });
  const viewProps = useArticleViewProps({
    selectedArticle,
    bookmarkIds: emptyIds,
    handleToggleBookmark: noop,
    readingListIds: emptyIds,
    handleToggleReadingList: noop,
    likeIds: emptyIds,
    handleToggleLike: noop,
    recordEngagement: noop,
    mobilePane,
    setMobilePane,
    prevArticle: null,
    nextArticle: null,
    selectArticle,
    feeds: [],
    snoozeArticle: noop,
    notes: {},
    setNote: noop,
    deleteNote: noop,
    markRead,
    articleTagIds: {},
    addTag: noop,
    removeTag: noop,
    setArticleTags: noop,
    clearArticleTags: noop,
    collections: [],
    addArticleToCollection: async () => {},
    addArticlesToCollection: async () => {},
    removeArticleFromCollection: async () => {},
    createCollection: async () => ({ error: "Unused synthetic operation" }),
    autoMode: false,
    onAutoModeStop: noop,
    onToggleAutoMode: noop,
  });

  return (
    <>
      <MobilePane
        pane="list"
        currentPane={mobilePane}
        isDesktop={false}
        as="main"
        id="main-content"
        tabIndex={-1}
      >
        <div data-testid="article-list-scroll">
          <SelectedArticleCtx.Provider value={selectedArticle?.id ?? null}>
            <CompactArticleItem
              article={article}
              index={0}
              totalCount={1}
              isRead={false}
              isBookmarked={false}
              hasNote={false}
              feedName="Synthetic feed"
              thumb={undefined}
              showFeedName={false}
              query=""
              onSelectArticle={selectArticle}
              onToggleRead={noop}
              onToggleBookmark={noop}
            />
          </SelectedArticleCtx.Provider>
        </div>
      </MobilePane>
      <MobilePane pane="view" currentPane={mobilePane} isDesktop={false}>
        <button onClick={viewProps.onMobileBack}>記事一覧に戻る</button>
        <p>{viewProps.article?.title}</p>
      </MobilePane>
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "");
  // happy-dom has no layout. These explicit rectangles model the focus-target
  // decision only; real geometry is covered by the hosted full-App browser test.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.getAttribute("role") === "article"
      ? new DOMRect(0, 100, 390, 48)
      : new DOMRect(0, 0, 390, 844);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function openReaderByKeyboard() {
  const { container } = render(<NavigationFixture />);
  const row = screen.getByRole("article", { name: article.title });
  const list = container.querySelector<HTMLElement>('[data-pane="list"]')!;
  const reader = container.querySelector<HTMLElement>('[data-pane="view"]')!;
  const scroller = screen.getByTestId("article-list-scroll");
  const initialHistory = { ...window.history.state };
  scroller.scrollTop = 320;
  row.focus();
  expect(row).toHaveFocus();
  expect(row).toHaveAttribute("tabindex", "0");
  fireEvent.keyDown(row, { key: "Enter" });
  expect(reader).not.toHaveAttribute("aria-hidden");
  expect(reader).not.toHaveAttribute("inert");
  expect(list).toHaveAttribute("aria-hidden", "true");
  expect(list).toHaveAttribute("inert");
  expect(markRead).toHaveBeenCalledExactlyOnceWith(article.id);
  expect(addToHistory).toHaveBeenCalledExactlyOnceWith(article.id);
  expect(window.history.state.mobilePane).toBe("view");
  const back = screen.getByRole("button", { name: /^記事一覧に戻る$/ });
  back.focus();
  expect(back).toHaveFocus();
  return { row, list, reader, scroller, initialHistory, back };
}

function expectListStateRetained({
  row,
  list,
  reader,
  scroller,
}: ReturnType<typeof openReaderByKeyboard>) {
  expect(list).not.toHaveAttribute("aria-hidden");
  expect(list).not.toHaveAttribute("inert");
  expect(reader).toHaveAttribute("aria-hidden", "true");
  expect(reader).toHaveAttribute("inert");
  expect(row).toHaveAttribute("aria-current", "true");
  expect(row).toHaveAttribute("tabindex", "0");
  // DOM property continuity, not a claim of browser geometry/scroll validation.
  expect(scroller.scrollTop).toBe(320);
  expect(window.history.state.mobilePane).toBe("list");
}

describe("ordinary mobile reader return focus (actual-source DOM regression)", () => {
  it("keeps existing pane, selection and list scroll state when the UI Back callback runs", () => {
    const fixture = openReaderByKeyboard();
    fireEvent.click(fixture.back);
    expectListStateRetained(fixture);
  });

  it("returns focus to the visible selected article after keyboard open and UI Back", () => {
    const fixture = openReaderByKeyboard();
    fireEvent.click(fixture.back);
    expectListStateRetained(fixture);
    expect(fixture.row).toHaveFocus();
    expect(document.activeElement?.closest('[aria-hidden="true"], [inert]')).toBeNull();
  });

  it("returns focus to the visible selected article on a browser Back destination event", () => {
    const fixture = openReaderByKeyboard();
    // Deliver a real PopStateEvent to the production useMobilePane listener.
    // Native browser history traversal itself is a separate hosted-E2E gate.
    act(() => {
      window.history.replaceState(fixture.initialHistory, "");
      window.dispatchEvent(new PopStateEvent("popstate", { state: fixture.initialHistory }));
    });
    expectListStateRetained(fixture);
    expect(fixture.row).toHaveFocus();
    expect(document.activeElement?.closest('[aria-hidden="true"], [inert]')).toBeNull();
  });
});
