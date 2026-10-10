import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { ArticleFilterProvider, type ArticleFilter } from "../../contexts/ArticleFilterContext";
import Header from "./index";

vi.mock("./FilterPills", () => ({ default: () => null }));
vi.mock("./LayoutSwitcher", () => ({ default: () => null }));
vi.mock("./SearchBar", () => ({ default: () => null }));
afterEach(cleanup);
function show(props: Partial<ComponentProps<typeof Header>>) {
  render(
    <ArticleFilterProvider
      value={{ globalFilter: null, setGlobalFilter: vi.fn() } as unknown as ArticleFilter}
    >
      <Header
        layout="list"
        onChangeLayout={vi.fn()}
        listFocusMode={false}
        onToggleListFocusMode={vi.fn()}
        filteredCount={0}
        selectedFeedId={null}
        feeds={[]}
        {...props}
      />
    </ArticleFilterProvider>,
  );
}
it.each([
  [null, "すべての記事"],
  ["__bookmarks__", "ブックマーク"],
  ["__reading_list__", "後で読む"],
  ["__likes__", "いいね"],
  ["__history__", "読書履歴"],
  ["__digest__", "ダイジェスト"],
])("names scope %s even with zero results", (selectedFeedId, title) => {
  show({ selectedFeedId });
  expect(screen.getByRole("heading", { name: new RegExp(title!) })).toHaveTextContent("(0)");
});
it.each(["グループ: 開発", "タグ: 設計", "学びの資料"])(
  "preserves explicit context %s",
  (scopeTitle) => {
    show({ scopeTitle, filteredCount: 2 });
    expect(screen.getByRole("heading", { name: new RegExp(scopeTitle) })).toHaveTextContent("(2)");
    expect(screen.getByTitle(scopeTitle)).toBeInTheDocument();
  },
);
