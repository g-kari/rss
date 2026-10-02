import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { makeArticle } from "../../e2e/helpers/article";
import { makeFeed } from "../../e2e/helpers/feed";
import ImmersiveArticleMode from "./ImmersiveArticleMode";
import ArticleRecommendations from "./ArticleRecommendations";

const state = vi.hoisted(() => ({ visible: true }));
vi.mock("../contexts/VisualModeContext", () => ({
  useVisualMode: () => ({ motionEnabled: true, motionReason: "", pageVisible: state.visible }),
}));
vi.mock("../hooks/useImmersiveNarration", () => ({
  useImmersiveNarration: () => ({ holding: false, enabled: false, toggle: vi.fn(), message: "" }),
}));
const articles = Array.from({ length: 25 }, (_, i) =>
  makeArticle({
    id: String(i),
    guid: String(i),
    title: `連続 ${i}`,
    link: `https://example.com/${i}`,
    publishedAt: new Date(Date.now() - i * 1000).toISOString(),
  }),
);
const props = {
  displayCandidates: articles,
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
};
const frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
const paint = () =>
  act(() => {
    for (let turn = 0; turn < 2; turn++) {
      const current = [...frames];
      frames.clear();
      current.forEach(([, callback]) => callback(turn * 16));
    }
  });
beforeEach(() => {
  state.visible = true;
  frames.clear();
  frameId = 0;
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
it("replenishes beyond ten, keeps pause/speed, rejects duplicate links and ends only after the pool", () => {
  const duplicate = { ...articles[0], id: "alias" };
  render(
    <ImmersiveArticleMode
      {...props}
      candidates={[...articles, duplicate]}
      articles={[...articles, duplicate]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "自動再生を一時停止" }));
  fireEvent.change(screen.getByLabelText("再生速度"), { target: { value: "1.5" } });
  const seen = [];
  for (let i = 0; i < 25; i++) {
    seen.push(screen.getByRole("heading", { name: `連続 ${i}` }).textContent);
    fireEvent.click(screen.getByRole("button", { name: "次の記事" }));
  }
  expect(new Set(seen).size).toBe(25);
  expect(screen.getByRole("button", { name: "次の記事" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "次の10件を見る" })).toBeNull();
  expect(screen.getByLabelText("再生速度")).toHaveValue("1.5");
  fireEvent.click(screen.getByRole("button", { name: "前の記事" }));
  expect(screen.getByRole("heading", { name: "連続 24" })).toBeVisible();
  expect(screen.getByRole("button", { name: "自動再生を再開" })).toBeEnabled();
});
it("marks only a painted active visible card, keeps it displayed after read state changes, and deduplicates revisits", () => {
  const marked = vi.fn();
  function Harness() {
    const [readIds, setReadIds] = useState(new Set<string>());
    return (
      <ImmersiveArticleMode
        {...props}
        readIds={readIds}
        candidates={articles.filter((a) => !readIds.has(a.id))}
        onMarkRead={(id: string) => {
          marked(id);
          setReadIds((previous) => new Set([...previous, id]));
        }}
      />
    );
  }
  const view = render(<Harness />);
  expect(marked).not.toHaveBeenCalled();
  paint();
  expect(marked.mock.calls).toEqual([["0"]]);
  expect(screen.getByRole("heading", { name: "連続 0" })).toBeVisible();
  view.rerender(<Harness />);
  paint();
  expect(marked).toHaveBeenCalledTimes(1);
  state.visible = false;
  view.rerender(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "次の記事" }));
  paint();
  expect(marked).toHaveBeenCalledTimes(1);
  state.visible = true;
  view.rerender(<Harness />);
  paint();
  expect(marked.mock.calls).toEqual([["0"], ["1"]]);
  fireEvent.click(screen.getByRole("button", { name: "前の記事" }));
  paint();
  expect(marked).toHaveBeenCalledTimes(2);
});
it("cancels paint-time read callbacks on rapid navigation and teardown", () => {
  const mark = vi.fn();
  const { unmount } = render(<ImmersiveArticleMode {...props} onMarkRead={mark} />);
  fireEvent.click(screen.getByRole("button", { name: "次の記事" }));
  fireEvent.click(screen.getByRole("button", { name: "次の記事" }));
  paint();
  expect(mark.mock.calls).toEqual([["2"]]);
  fireEvent.click(screen.getByRole("button", { name: "次の記事" }));
  unmount();
  paint();
  expect(mark).toHaveBeenCalledTimes(1);
});

it("retains only the read-relaxed strict candidate scope after a painted card loses another state filter", () => {
  const mark = vi.fn();
  const { rerender } = render(<ImmersiveArticleMode {...props} onMarkRead={mark} />);
  paint();
  rerender(
    <ImmersiveArticleMode
      {...props}
      onMarkRead={mark}
      readIds={new Set(["0"])}
      candidates={articles.slice(1)}
      displayCandidates={articles.slice(1)}
    />,
  );
  expect(screen.queryByRole("heading", { name: "連続 0" })).toBeNull();
});

it("marks once under StrictMode and cancels pending callbacks on account/scope interruption", () => {
  const first = vi.fn();
  const second = vi.fn();
  const view = render(
    <StrictMode>
      <ArticleRecommendations {...props} userId="one" scopeKey="first" onMarkRead={first} />
    </StrictMode>,
  );
  fireEvent.click(screen.getByRole("button", { name: "ドパガキモード" }));
  paint();
  paint();
  expect(first.mock.calls).toEqual([["0"]]);
  fireEvent.click(screen.getByRole("button", { name: "次の記事" }));
  view.rerender(
    <StrictMode>
      <ArticleRecommendations {...props} userId="two" scopeKey="first" onMarkRead={second} />
    </StrictMode>,
  );
  paint();
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "ドパガキモード" }));
  view.rerender(
    <StrictMode>
      <ArticleRecommendations {...props} userId="two" scopeKey="changed" onMarkRead={second} />
    </StrictMode>,
  );
  paint();
  expect(second).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("never marks queued cards externally read before their display", () => {
  const mark = vi.fn();
  const { rerender } = render(<ImmersiveArticleMode {...props} onMarkRead={mark} />);
  paint();
  rerender(<ImmersiveArticleMode {...props} onMarkRead={mark} readIds={new Set(["1", "2"])} />);
  fireEvent.click(screen.getByRole("button", { name: "次の記事" }));
  expect(screen.getByRole("heading", { name: "連続 3" })).toBeVisible();
  paint();
  expect(mark.mock.calls).toEqual([["0"], ["3"]]);
});
