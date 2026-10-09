import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import ArticleListHeader from "./index";
import { ArticleFilterProvider } from "../../contexts/ArticleFilterContext";
import { useFilteredArticles } from "../../hooks/useFilteredArticles";
import { SPECIAL_FEED_IDS } from "../../lib/storage";
import { makeArticle } from "../../../e2e/helpers/article";
import { makeFeed } from "../../../e2e/helpers/feed";

const feeds = [makeFeed({ id: "feed", title: "デザインと技術", category: "技術" })];
const articles = [makeArticle({ id: "article", feedHash: "feed" })];
const empty = new Set<string>();
function Fixture(props: Partial<ComponentProps<typeof ArticleListHeader>>) {
  const filter = useFilteredArticles({
    articles,
    feeds,
    feedId: null,
    readIds: empty,
    bookmarkIds: empty,
    readingListIds: empty,
    globalFilter: null,
    setGlobalFilter: vi.fn(),
    selectedArticleId: null,
  });
  return (
    <ArticleFilterProvider value={{ ...filter, onSaveFilter: vi.fn() }}>
      <ArticleListHeader
        layout="list"
        onChangeLayout={vi.fn()}
        listFocusMode={false}
        onToggleListFocusMode={vi.fn()}
        filteredCount={0}
        selectedFeedId={null}
        feeds={feeds}
        {...props}
      />
    </ArticleFilterProvider>
  );
}
afterEach(() => {
  cleanup();
  localStorage.clear();
});
describe("task-oriented list header", () => {
  it("names the selected scope and retains a truthful zero count", () => {
    render(<Fixture scopeTitle="コレクション: 学び" />);
    expect(screen.getByRole("heading", { name: "コレクション: 学び" })).toBeTruthy();
    expect(screen.getByText("0 件")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "カード表示" })).toBeNull();
  });
  it("names feeds and special saved views without changing selection", () => {
    const view = render(<Fixture selectedFeedId="feed" />);
    expect(screen.getByRole("heading", { name: "デザインと技術" })).toBeTruthy();
    view.rerender(<Fixture selectedFeedId={SPECIAL_FEED_IDS.READING_LIST} />);
    expect(screen.getByRole("heading", { name: "後で読む" })).toBeTruthy();
  });
  it("shows active advanced conditions outside the dialog and preserves clearing", () => {
    render(<Fixture />);
    fireEvent.click(screen.getByRole("button", { name: /^絞り込み/ }));
    const dialog = screen.getByRole("dialog", { name: "記事の絞り込み" });
    fireEvent.click(within(dialog).getByRole("button", { name: "ブックマークフィルター切替 (B)" }));
    fireEvent.change(within(dialog).getByLabelText("カテゴリでフィルター"), {
      target: { value: "技術" },
    });
    expect(screen.getByLabelText("有効な絞り込み条件").textContent).toBe(
      "ブックマーク・カテゴリ: 技術",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "すべてのフィルターをクリア" }));
    expect(screen.queryByLabelText("有効な絞り込み条件")).toBeNull();
  });
  it("keeps all five layouts and list focus in the display task", () => {
    const onChangeLayout = vi.fn(),
      onToggleListFocusMode = vi.fn();
    render(
      <Fixture onChangeLayout={onChangeLayout} onToggleListFocusMode={onToggleListFocusMode} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "表示", exact: true }));
    const dialog = screen.getByRole("dialog", { name: "記事一覧の表示" });
    for (const name of [
      "コンパクト表示",
      "リスト表示",
      "カード表示",
      "マガジン表示",
      "ギャラリー表示",
    ])
      fireEvent.click(within(dialog).getByRole("button", { name }));
    expect(onChangeLayout.mock.calls.map(([layout]) => layout)).toEqual([
      "compact",
      "list",
      "card",
      "magazine",
      "gallery",
    ]);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "記事一覧フォーカス", exact: true }),
    );
    expect(onToggleListFocusMode).toHaveBeenCalledOnce();
  });
  it("retains two-step confirmation for list-wide read changes", () => {
    const onMarkAllRead = vi.fn();
    render(<Fixture onMarkAllRead={onMarkAllRead} />);
    fireEvent.click(screen.getByRole("button", { name: "操作", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "全て既読にする", exact: true }));
    expect(onMarkAllRead).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "全記事を既読にする（確認）" }));
    expect(onMarkAllRead).toHaveBeenCalledOnce();
  });
});
