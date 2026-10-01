import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeArticle } from "../../e2e/helpers/article";
import { makeFeed } from "../../e2e/helpers/feed";
import type { Article } from "../types";
import ImmersiveArticleMode from "./ImmersiveArticleMode";

const state = vi.hoisted(() => ({
  visual: { enabled: false, motionEnabled: true, motionReason: "", pageVisible: true },
  narrationHolding: false,
  cards: new Map<string, { onComplete: () => void; paused: boolean; speed: number }>(),
}));
vi.mock("../contexts/VisualModeContext", () => ({ useVisualMode: () => state.visual }));
vi.mock("../hooks/useImmersiveNarration", () => ({
  useImmersiveNarration: () => ({
    enabled: state.narrationHolding,
    holding: state.narrationHolding,
    toggle: vi.fn(),
    message: "",
  }),
}));
vi.mock("./ImmersiveInlineReader", () => ({
  default: ({ article, onClose }: { article: Article | null; onClose: () => void }) =>
    article ? (
      <div role="dialog" aria-label="ここで記事の本文を読む">
        <button onClick={onClose}>ショート表示に戻る</button>
      </div>
    ) : null,
}));
vi.mock("./CinematicArticle", () => ({
  default: (props: {
    article: Article;
    active: boolean;
    paused: boolean;
    speed: number;
    onComplete: () => void;
  }) => {
    if (props.active) state.cards.set(props.article.id, props);
    return <h3>{props.article.title}</h3>;
  },
}));
const now = Date.parse("2026-09-30T12:00:00Z");
const articles = Array.from({ length: 12 }, (_, index) =>
  makeArticle({
    id: String(index),
    guid: String(index),
    title: `記事 ${index}`,
    link: `https://example.com/${index}`,
    publishedAt: new Date(now - index * 1000).toISOString(),
  }),
);
const props = {
  candidates: articles,
  articles,
  feeds: [makeFeed({ id: articles[0].feedHash })],
  now,
  readIds: new Set<string>(),
  bookmarkIds: new Set<string>(),
  readingListIds: new Set<string>(),
  likeIds: new Set<string>(),
  historyIds: new Set<string>(),
  dismissedIds: new Set<string>(),
  onClose: vi.fn(),
  onSelectArticle: vi.fn(),
  onToggleReadingList: vi.fn(),
  onDismiss: vi.fn(),
  onRestore: vi.fn(),
};
beforeEach(() => {
  state.cards.clear();
  state.narrationHolding = false;
  Object.assign(state.visual, {
    enabled: false,
    motionEnabled: true,
    motionReason: "",
    pageVisible: true,
  });
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("immersive autoplay session", () => {
  it("runs in the normal reader skin, advances once per completion and stops at ten", () => {
    render(<ImmersiveArticleMode {...props} />);
    expect(screen.getByRole("button", { name: "自動再生を一時停止" })).toBeEnabled();
    const first = state.cards.get("0")!.onComplete;
    act(() => {
      first();
      first();
    });
    expect(screen.getByRole("status")).toHaveTextContent("2 / 10件");
    for (let index = 1; index < 10; index++)
      act(() => state.cards.get(String(index))!.onComplete());
    expect(screen.getByRole("status")).toHaveTextContent("区切り");
    expect(screen.getByRole("button", { name: "次の記事" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "自動再生を一時停止" })).toBeDisabled();
    act(() => state.cards.get("9")!.onComplete());
    expect(screen.getByRole("status")).toHaveTextContent("区切り");
    expect(state.cards.has("10")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "次の10件を見る" }));
    expect(screen.getByRole("status")).toHaveTextContent("1 / 2件");
    expect(state.cards.get("10")?.paused).toBe(false);
    expect(props.onSelectArticle).not.toHaveBeenCalled();
    expect(props.onDismiss).not.toHaveBeenCalled();
  });
  it("persists pause and speed across manual navigation and rejects stale completions", () => {
    render(<ImmersiveArticleMode {...props} />);
    const first = state.cards.get("0")!.onComplete;
    fireEvent.click(screen.getByRole("button", { name: "自動再生を一時停止" }));
    act(() => first());
    expect(screen.getByRole("status")).toHaveTextContent("1 / 10件");
    fireEvent.change(screen.getByLabelText("再生速度"), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: "次の記事" }));
    expect(state.cards.get("1")).toMatchObject({ paused: true, speed: 1.5 });
    act(() => first());
    expect(screen.getByRole("status")).toHaveTextContent("2 / 10件");
    fireEvent.click(screen.getByRole("button", { name: "自動再生を再開" }));
    act(() => state.cards.get("1")!.onComplete());
    expect(screen.getByRole("status")).toHaveTextContent("3 / 10件");
  });
  it("never advances hidden/reduced-motion sessions and leaves speed selector arrow keys alone", () => {
    const { rerender } = render(<ImmersiveArticleMode {...props} />);
    state.visual.pageVisible = false;
    rerender(<ImmersiveArticleMode {...props} />);
    act(() => state.cards.get("0")!.onComplete());
    state.visual.pageVisible = true;
    state.visual.motionReason = "端末の動きを減らす設定";
    rerender(<ImmersiveArticleMode {...props} />);
    act(() => state.cards.get("0")!.onComplete());
    expect(screen.getByRole("status")).toHaveTextContent("1 / 10件");
    fireEvent.keyDown(screen.getByLabelText("再生速度"), { key: "ArrowDown" });
    expect(screen.getByRole("status")).toHaveTextContent("1 / 10件");
    expect(screen.getByRole("button", { name: "自動再生を再開" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "自動再生を再開" }));
    act(() => state.cards.get("0")!.onComplete());
    expect(screen.getByRole("status")).toHaveTextContent("2 / 10件");
  });
});

it.each(["軽量表示", "データ節約設定"])(
  "starts the finite timer despite %s decoration fallback",
  (reason) => {
    state.visual.motionReason = reason;
    render(<ImmersiveArticleMode {...props} />);
    expect(state.cards.get("0")?.paused).toBe(false);
    act(() => state.cards.get("0")!.onComplete());
    expect(screen.getByRole("status")).toHaveTextContent("2 / 10件");
  },
);

it("waits for narration after media ends, and never releases a manually paused session", () => {
  state.narrationHolding = true;
  const { rerender } = render(<ImmersiveArticleMode {...props} />);
  act(() => state.cards.get("0")!.onComplete());
  expect(screen.getByRole("status")).toHaveTextContent("1 / 10件");
  fireEvent.click(screen.getByRole("button", { name: "自動再生を一時停止" }));
  state.narrationHolding = false;
  rerender(<ImmersiveArticleMode {...props} />);
  expect(screen.getByRole("status")).toHaveTextContent("1 / 10件");
  fireEvent.click(screen.getByRole("button", { name: "自動再生を再開" }));
  expect(screen.getByRole("status")).toHaveTextContent("2 / 10件");
});

it.each([false, true])(
  "pauses inline reading and restores prior user-paused state %s",
  (paused) => {
    render(<ImmersiveArticleMode {...props} />);
    if (paused) fireEvent.click(screen.getByRole("button", { name: "自動再生を一時停止" }));
    const first = state.cards.get("0")!.onComplete;
    fireEvent.click(screen.getByRole("button", { name: "ここで読む" }));
    expect(state.cards.get("0")?.paused).toBe(true);
    act(() => first());
    expect(screen.getByRole("status")).toHaveTextContent("1 / 10件");
    fireEvent.click(screen.getByRole("button", { name: "ショート表示に戻る" }));
    expect(state.cards.get("0")?.paused).toBe(paused);
    expect(props.onSelectArticle).not.toHaveBeenCalled();
  },
);
it("closes an inline panel safely if the active article leaves the eligible scope", () => {
  const { rerender } = render(<ImmersiveArticleMode {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "ここで読む" }));
  rerender(<ImmersiveArticleMode {...props} readIds={new Set(["0"])} />);
  expect(screen.queryByRole("dialog", { name: "ここで記事の本文を読む" })).toBeNull();
  expect(document.querySelector(".immersive-footer")).not.toHaveAttribute("inert");
});
