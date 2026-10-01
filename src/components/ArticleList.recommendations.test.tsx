import { cleanup, fireEvent, render, screen, within, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ArticleList from "./ArticleList";
import { useFilteredArticles } from "../hooks/useFilteredArticles";
import { ArticleFilterProvider } from "../contexts/ArticleFilterContext";
import { ReaderSettingsProvider, type ReaderSettings } from "../contexts/ReaderSettingsContext";
import { ToastProvider } from "../contexts/ToastContext";
import { makeArticle } from "../../e2e/helpers/article";
import { makeFeed } from "../../e2e/helpers/feed";
import { STORAGE_KEYS } from "../lib/storage";

const empty = new Set<string>();
const saved = new Set(["in-scope"]);
const noop = () => {};
const onSelectArticle = vi.fn();
const feeds = [makeFeed({ id: "a" }), makeFeed({ id: "b" })];
const articles = [
  makeArticle({
    id: "in-scope",
    feedHash: "a",
    title: "条件に合う記事",
    link: "https://example.com/a",
  }),
  makeArticle({
    id: "retained",
    feedHash: "a",
    title: "保存されていない選択記事",
    link: "https://example.com/retained",
  }),
  makeArticle({
    id: "outside",
    feedHash: "b",
    title: "別のフィードの記事",
    link: "https://example.com/b",
  }),
];
// Only list-pane settings are needed; unrelated article/AI settings are not exercised.
const settings = {
  galleryColumns: 3,
  galleryColumnsFocus: "auto",
  galleryCardSize: "medium",
  galleryMinImagePx: 0,
  autoReadEnabled: false,
  galleryAutoScrollSpeed: "off",
  onChangeGalleryAutoScrollSpeed: noop,
} as unknown as ReaderSettings;

function Reader({
  loading = false,
  fetchError = false,
}: {
  loading?: boolean;
  fetchError?: boolean;
}) {
  const filter = useFilteredArticles({
    articles,
    feeds,
    feedId: "a",
    readIds: empty,
    bookmarkIds: saved,
    readingListIds: saved,
    globalFilter: null,
    setGlobalFilter: noop,
    selectedArticleId: "retained",
  });
  return (
    <ToastProvider
      value={{ info: noop, success: noop, error: noop, toasts: [], undo: noop, dismiss: noop }}
    >
      <ReaderSettingsProvider value={settings}>
        <ArticleFilterProvider value={{ ...filter, onSaveFilter: async () => {} }}>
          <ArticleList
            recommendationContext={{
              userId: "list-test",
              likeIds: empty,
              historyIds: empty,
              readBeforeTimestamp: null,
            }}
            feeds={feeds}
            readIds={empty}
            bookmarkIds={saved}
            readingListIds={saved}
            selectedArticleId="retained"
            selectedFeedId="a"
            layout="list"
            loading={loading}
            fetchError={fetchError}
            onChangeLayout={noop}
            onSelectArticle={onSelectArticle}
            onToggleRead={noop}
            onToggleBookmark={noop}
            onMarkRead={noop}
            listFocusMode={false}
            onToggleListFocusMode={noop}
          />
        </ArticleFilterProvider>
      </ReaderSettingsProvider>
    </ToastProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.useFakeTimers();
  localStorage.setItem(STORAGE_KEYS.BOOKMARK_ONLY, "1");
  localStorage.setItem(STORAGE_KEYS.READING_LIST_ONLY, "1");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ArticleList recommendation wiring", () => {
  it("keeps persisted filters and individual feed scope when opening and closing the mode", () => {
    render(<Reader />);
    const recommendations = screen.getByRole("region", { name: "いま読むおすすめ" });
    expect(within(recommendations).getAllByRole("button", { name: /を読む$/ })).toHaveLength(1);
    expect(within(recommendations).queryByText("保存されていない選択記事")).not.toBeInTheDocument();
    const entry = screen.getByRole("button", { name: "ドパガキモード" });
    entry.focus();
    fireEvent.click(entry);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(document.querySelectorAll(".immersive-slide")).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(entry).toHaveFocus();
    expect(localStorage.getItem(STORAGE_KEYS.BOOKMARK_ONLY)).toBe("1");
    expect(localStorage.getItem(STORAGE_KEYS.READING_LIST_ONLY)).toBe("1");
    expect(onSelectArticle).not.toHaveBeenCalled();
  });

  it("keeps the entry visible through debounced search and empty results", () => {
    render(<Reader />);
    fireEvent.change(screen.getByRole("combobox", { name: "検索" }), {
      target: { value: "missing-result" },
    });
    const entry = screen.getByRole("button", { name: "ドパガキモード" });
    expect(entry).toBeDisabled();
    expect(screen.getByText("検索条件を反映しています")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(600));
    expect(entry).toBeEnabled();
    expect(
      screen.getByText("現在のフィルターに合う未読のおすすめ記事はありません"),
    ).toBeInTheDocument();
    fireEvent.click(entry);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(document.querySelectorAll(".immersive-slide")).toHaveLength(0);
  });

  it("keeps explained controls visible during loading and errors without stale recommendations", () => {
    const { rerender } = render(<Reader loading />);
    expect(screen.getByRole("button", { name: "ドパガキモード" })).toBeDisabled();
    rerender(<Reader fetchError />);
    expect(screen.getByRole("button", { name: "ドパガキモード" })).toBeDisabled();
    expect(screen.getByText(/記事を読み込めませんでした/)).toBeInTheDocument();
    rerender(<Reader />);
    expect(screen.getByRole("button", { name: "ドパガキモード" })).toBeEnabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
