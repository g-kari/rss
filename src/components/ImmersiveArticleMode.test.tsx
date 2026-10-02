import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import ImmersiveArticleMode from "./ImmersiveArticleMode";
import ArticleRecommendations from "./ArticleRecommendations";
import { getPopupOpenCount } from "../lib/popup-lock";
import type { Article, Feed } from "../types";

const now = Date.parse("2026-09-30T12:00:00Z");
const articles: Article[] = Array.from({ length: 23 }, (_, i) => ({
  id: String(i),
  feedHash: "a",
  guid: String(i),
  title: `記事 ${i}`,
  link: `https://example.com/${i}`,
  summary: "<p>既存の説明 &amp; 要点</p>",
  publishedAt: new Date(now - i * 1000).toISOString(),
  createdAt: new Date(now).toISOString(),
  ogImage: "https://example.com/image.png",
}));
const feeds: Feed[] = [
  {
    id: "a",
    title: "Feed",
    url: "https://example.com/feed",
    siteUrl: "https://example.com",
    lastFetchedAt: null,
    fetchError: null,
  },
];
const props = {
  candidates: articles,
  articles,
  feeds,
  readIds: new Set<string>(),
  bookmarkIds: new Set<string>(),
  readingListIds: new Set<string>(),
  likeIds: new Set<string>(),
  historyIds: new Set<string>(),
  dismissedIds: new Set<string>(),
  now,
  onClose: vi.fn(),
  onSelectArticle: vi.fn(),
  onToggleReadingList: vi.fn(),
  onDismiss: vi.fn(),
  onRestore: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Harness() {
  const [open, setOpen] = useState(false);
  const [dismissedIds, setDismissed] = useState(new Set<string>());
  const [readingListIds, setSaved] = useState(new Set<string>());
  return (
    <>
      <button onClick={() => setOpen(true)}>開始</button>
      {open && (
        <ImmersiveArticleMode
          {...props}
          dismissedIds={dismissedIds}
          readingListIds={readingListIds}
          onClose={() => setOpen(false)}
          onDismiss={(id) => setDismissed(new Set([id]))}
          onRestore={() => setDismissed(new Set())}
          onToggleReadingList={(id) => setSaved(readingListIds.has(id) ? new Set() : new Set([id]))}
        />
      )}
    </>
  );
}
function start() {
  render(<Harness />);
  const trigger = screen.getByRole("button", { name: "開始" });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}
function advance(count: number) {
  for (let i = 0; i < count; i++) fireEvent.click(screen.getByRole("button", { name: "次の記事" }));
}

describe("ImmersiveArticleMode", () => {
  it("shows one accessible article with only neighboring media and no generated-content requests", () => {
    render(<ImmersiveArticleMode {...props} />);
    expect(screen.getByRole("heading", { name: "記事 0" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getAllByText("既存の説明 & 要点", { exact: false })).toHaveLength(2);
    expect(document.querySelector("audio, video, iframe")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(props.onSelectArticle).not.toHaveBeenCalled();
    expect(getPopupOpenCount()).toBe(1);
  });
  it("continues through all loaded articles without a next-batch confirmation", () => {
    render(<ImmersiveArticleMode {...props} />);
    advance(10);
    expect(screen.getByRole("heading", { name: "記事 10" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("11 / 20件");
    advance(10);
    expect(screen.getByRole("status")).toHaveTextContent("21 / 23件");
    advance(3);
    expect(screen.getByRole("heading", { name: "読み込み済みの記事はここまで" })).toBeVisible();
    expect(screen.getByRole("button", { name: "次の記事" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "次の10件を見る" })).toBeNull();
    expect(props.onSelectArticle).not.toHaveBeenCalled();
    expect(props.onDismiss).not.toHaveBeenCalled();
  });
  it("responds to native vertical scrolling and rapid keyboard changes without selection/read side effects", () => {
    render(<ImmersiveArticleMode {...props} />);
    const scroller = screen.getByRole("region");
    Object.defineProperty(scroller, "clientHeight", { value: 400 });
    scroller.scrollTop = 400;
    fireEvent.scroll(scroller);
    expect(screen.getByRole("heading", { name: "記事 1" })).toBeInTheDocument();
    fireEvent.keyDown(scroller, { key: "ArrowDown" });
    fireEvent.keyDown(scroller, { key: "ArrowDown" });
    fireEvent.keyDown(scroller, { key: "ArrowUp" });
    expect(screen.getByRole("heading", { name: "記事 2" })).toBeInTheDocument();
    expect(scroller.scrollTop).toBe(800);
    expect(props.onSelectArticle).not.toHaveBeenCalled();
  });
  it("retains navigation focus as the next local batch is appended", () => {
    const trigger = start();
    advance(7);
    const next = screen.getByRole("button", { name: "次の記事" });
    next.focus();
    fireEvent.click(next);
    expect(next).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("9 / 20件");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });
  it("aligns the new batch after slides replace an empty queue instead of retaining the end snap target", () => {
    const { rerender } = render(
      <ImmersiveArticleMode
        {...props}
        candidates={[]}
        session={{ remaining: [], served: [articles[0]], paused: true, speed: 1 }}
      />,
    );
    const scroller = screen.getByRole("region");
    Object.defineProperty(scroller, "clientHeight", { value: 400 });
    let alignedAfterInsertion = false;
    // Model the hosted browser retaining the persistent end-section snap target at its new offset.
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      get: () => (scroller.querySelector(".immersive-slide") && !alignedAfterInsertion ? 400 : 0),
      set: (value: number) => {
        if (value === 0 && scroller.querySelector(".immersive-slide")) alignedAfterInsertion = true;
      },
    });
    rerender(
      <ImmersiveArticleMode
        {...props}
        candidates={articles.slice(0, 2)}
        session={{ remaining: [], served: [articles[0]], paused: true, speed: 1 }}
      />,
    );
    fireEvent.scroll(scroller);
    expect(screen.getByRole("heading", { name: "記事 1" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 / 1件");
    expect(scroller.scrollTop).toBe(0);
  });
  it.each(["end", "start"])(
    "keeps keyboard focus when the %s navigation control becomes disabled",
    (edge) => {
      const trigger = start();
      advance(edge === "end" ? 22 : 1);
      const button = screen.getByRole("button", {
        name: edge === "end" ? "次の記事" : "前の記事",
      });
      button.focus();
      fireEvent.click(button);
      expect(button).toBeDisabled();
      expect(screen.getByRole("region")).toHaveFocus();
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(trigger).toHaveFocus();
    },
  );
  it.each(["再生速度", "一覧に戻る"])(
    "retains the stable %s control focus when native scrolling reaches the end",
    (name) => {
      start();
      advance(22);
      const stable = screen.getByRole(name === "再生速度" ? "combobox" : "button", { name });
      stable.focus();
      const scroller = screen.getByRole("region");
      Object.defineProperty(scroller, "clientHeight", { value: 400 });
      scroller.scrollTop = 9200;
      fireEvent.scroll(scroller);
      expect(screen.getByRole("status")).toHaveTextContent("ここまで");
      expect(stable).toHaveFocus();
    },
  );
  it.each(["自動再生を再開", "ナレーションを開始", "本文を読む"])(
    "repairs the unavailable %s control focus when native scrolling reaches the end",
    (name) => {
      start();
      advance(22);
      screen.getByRole("button", { name }).focus();
      const scroller = screen.getByRole("region");
      Object.defineProperty(scroller, "clientHeight", { value: 400 });
      scroller.scrollTop = 9200;
      fireEvent.scroll(scroller);
      expect(scroller).toHaveFocus();
      expect(screen.getByRole("status")).toHaveTextContent("ここまで");
    },
  );
  it("saves without reordering, dismisses with a focused undo, and restores the same card", () => {
    start();
    fireEvent.click(screen.getByRole("button", { name: "後で読む" }));
    expect(screen.getByRole("button", { name: "保存済み" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("heading", { name: "記事 0" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "興味なし" }));
    expect(screen.queryByRole("heading", { name: "記事 0" })).toBeNull();
    const undo = screen.getByRole("button", { name: "元に戻す" });
    expect(undo).toHaveFocus();
    fireEvent.click(undo);
    expect(screen.getByRole("heading", { name: "記事 0" })).toBeInTheDocument();
  });
  it("never displays stale cards when strict source scope, read state or dismissal changes", () => {
    const { rerender } = render(<ImmersiveArticleMode {...props} />);
    rerender(<ImmersiveArticleMode {...props} articles={articles.slice(1)} />);
    expect(screen.queryByRole("heading", { name: "記事 0" })).toBeNull();
    expect(screen.queryByRole("button", { name: "本文を読む" })).toBeNull();
    rerender(<ImmersiveArticleMode {...props} readIds={new Set(["0"])} />);
    expect(screen.queryByRole("heading", { name: "記事 0" })).toBeNull();
    rerender(<ImmersiveArticleMode {...props} dismissedIds={new Set(["0"])} />);
    expect(screen.queryByRole("heading", { name: "記事 0" })).toBeNull();
  });
  it("opens the article only on an explicit full-article action", () => {
    render(<ImmersiveArticleMode {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "本文を読む" }));
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(props.onSelectArticle).toHaveBeenCalledWith(articles[0]);
  });
  it("traps Tab, exits with Escape, restores focus and can reopen with a fresh session", () => {
    const trigger = start();
    expect(screen.getByRole("button", { name: "一覧に戻る" })).toHaveFocus();
    const next = screen.getByRole("button", { name: "次の記事" });
    next.focus();
    fireEvent.keyDown(next, { key: "Tab" });
    expect(screen.getByRole("button", { name: "一覧に戻る" })).toHaveFocus();
    advance(2);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(getPopupOpenCount()).toBe(0);
    fireEvent.click(trigger);
    expect(screen.getByRole("status")).toHaveTextContent("1 / 10件");
    fireEvent.click(screen.getByRole("button", { name: "一覧に戻る" }));
    expect(trigger).toHaveFocus();
  });
  it("offers an explicit exit for empty candidate pools", () => {
    render(<ImmersiveArticleMode {...props} candidates={[]} />);
    expect(
      screen.getByRole("heading", { name: "いま紹介できる記事はありません" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "次の記事" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "ここで終わる" })).toBeInTheDocument();
  });
  it("enters through recommendations and closes immediately when that scope is disabled", () => {
    const { rerender } = render(<ArticleRecommendations {...props} userId="one" />);
    fireEvent.click(screen.getByRole("button", { name: "ドパガキモード" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).getByRole("button", { name: "後で読む" }),
    ).toBeInTheDocument();
    rerender(<ArticleRecommendations {...props} userId="one" enabled={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<ArticleRecommendations {...props} userId="one" enabled />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
