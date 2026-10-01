import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { makeArticle } from "../../e2e/helpers/article";
import ImmersiveInlineReader from "./ImmersiveInlineReader";
const state = vi.hoisted(() => ({
  storedContent: null as string | null,
  fetching: false,
  fetchError: "",
  fetchRetryable: true,
  fetchFullContent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../hooks/useArticleContent", () => ({
  useArticleContent: () => ({
    ...state,
    resolvedOgImage: null,
    fetchFullContentOnce: state.fetchFullContent,
  }),
}));
const article = makeArticle({
  title: "ここで読む記事",
  content: "",
  summary:
    '<p>読み込み済み説明</p><script>alert(1)</script><img src="https://example.com/body.jpg" onerror="alert(1)">',
});
beforeEach(() => {
  Object.assign(state, {
    storedContent: null,
    fetching: false,
    fetchError: "",
    fetchRetryable: true,
  });
  vi.clearAllMocks();
});
afterEach(cleanup);
it("automatically fetches once, preserves safe summary/fulltext rendering and exposes retryable errors", () => {
  const { container, rerender } = render(
    <ImmersiveInlineReader article={article} onClose={vi.fn()} />,
  );
  expect(state.fetchFullContent).toHaveBeenCalledOnce();
  expect(screen.getByText("読み込み済み説明")).toBeInTheDocument();
  expect(container.querySelector("script, [onerror]")).toBeNull();
  state.fetchError = "通信エラー";
  rerender(<ImmersiveInlineReader article={article} onClose={vi.fn()} />);
  expect(state.fetchFullContent).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "全文取得を再試行" }));
  expect(state.fetchFullContent).toHaveBeenCalledTimes(2);
  state.fetchError = "";
  state.storedContent =
    '<p>取得した全文</p><img src="https://example.com/full.jpg" onload="bad()">';
  rerender(<ImmersiveInlineReader article={article} onClose={vi.fn()} />);
  expect(screen.getByText("取得した全文")).toBeInTheDocument();
  expect(container.querySelector("[onload]")).toBeNull();
});
it("closes on Escape, traps focus and returns to its trigger without exposing unsafe source links", () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>ここで読む</button>
        <ImmersiveInlineReader
          article={open ? { ...article, link: "javascript:alert(1)" } : null}
          onClose={() => setOpen(false)}
        />
      </>
    );
  }
  render(<Harness />);
  const trigger = screen.getByRole("button", { name: "ここで読む" });
  trigger.focus();
  fireEvent.click(trigger);
  expect(screen.getByRole("heading", { name: article.title })).toHaveFocus();
  expect(screen.queryByRole("link", { name: "元記事を開く" })).toBeNull();
  screen.getByRole("button", { name: "ショート表示に戻る" }).focus();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
  expect(screen.getByRole("button", { name: "ショート表示に戻る" })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(trigger).toHaveFocus();
});

it("does not mistake a long feed excerpt for fetched full content", () => {
  render(
    <ImmersiveInlineReader
      article={{ ...article, content: `<p>${"フィードの長い説明です。".repeat(60)}</p>` }}
      onClose={vi.fn()}
    />,
  );
  expect(state.fetchFullContent).toHaveBeenCalledOnce();
  expect(screen.getByText(/全文とは限りません/)).toBeInTheDocument();
});

it("reuses fetched content and does not extract native media or unsafe URLs", () => {
  state.storedContent = "<p>取得済み本文</p>";
  const { rerender } = render(<ImmersiveInlineReader article={article} onClose={vi.fn()} />);
  expect(state.fetchFullContent).not.toHaveBeenCalled();
  expect(screen.getByText("取得済みの記事本文")).toBeInTheDocument();
  state.storedContent = null;
  rerender(
    <ImmersiveInlineReader
      article={{ ...article, id: "native", link: "https://www.youtube.com/watch?v=ABCDEFGHIJK" }}
      onClose={vi.fn()}
    />,
  );
  expect(state.fetchFullContent).not.toHaveBeenCalled();
  rerender(
    <ImmersiveInlineReader
      article={{ ...article, id: "unsafe", link: "http://127.0.0.1/private" }}
      onClose={vi.fn()}
    />,
  );
  expect(state.fetchFullContent).not.toHaveBeenCalled();
});
