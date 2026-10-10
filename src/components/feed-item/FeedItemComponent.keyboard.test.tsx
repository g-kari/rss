import { useRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFeed } from "../../../e2e/helpers/feed";
import { makeKeyboardNavFixture } from "../../../e2e/helpers/keyboard-nav-fixture";
import { ToastProvider } from "../../contexts/ToastContext";
import { useArticleViewShortcuts } from "../../hooks/useArticleViewShortcuts";
import { useKeyboardNav } from "../../hooks/useKeyboardNav";
import FeedItem from "./FeedItemComponent";
import type { FeedItemProps } from "./types";

afterEach(cleanup);

function makeProps(): FeedItemProps {
  return {
    feed: makeFeed({ title: "Keyboard feed" }),
    count: 3,
    isSelected: true,
    isPinned: false,
    animationIndex: 0,
    onSelect: vi.fn(),
    onMarkAllRead: vi.fn(),
    onDelete: vi.fn(),
    onTogglePin: vi.fn(),
    onRename: vi.fn(async () => {}),
    onRetry: vi.fn(async () => {}),
    onMute: vi.fn(async () => {}),
    onSetView: vi.fn(async () => {}),
    onSetDigestLimit: vi.fn(async () => {}),
    onSetGroup: vi.fn(async () => {}),
    groups: [{ id: "group", name: "Synthetic group", order: 0, createdAt: "2026-10-10T00:00:00Z" }],
  };
}

function Fixture({ props, scroll }: { props: FeedItemProps; scroll: () => void }) {
  const keyboard = makeKeyboardNavFixture();
  const mainRef = useRef<HTMLElement>(null);
  useKeyboardNav(keyboard);
  useArticleViewShortcuts({
    article: keyboard.selectedArticle,
    storedContent: null,
    fetching: false,
    canFetchManually: false,
    fetchFullContent: vi.fn(),
    aiResult: null,
    aiLoading: false,
    doRunAi: vi.fn(),
    resetAi: vi.fn(),
    handleTranslate: vi.fn(),
    mainRef,
    autoTranslate: false,
    autoSummarize: false,
    autoAiBrowserOnly: false,
    aiPreferenceKey: "synthetic",
    translatorAvailable: null,
    summarizerAvailable: null,
    translateResult: null,
    translateLoading: false,
  });
  return (
    <ToastProvider
      value={{
        toasts: [],
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        undo: vi.fn(),
        dismiss: vi.fn(),
      }}
    >
      <FeedItem {...props} />
      <main
        aria-label="記事本文"
        ref={(element) => {
          mainRef.current = element;
          if (element) element.scrollBy = scroll;
        }}
      />
    </ToastProvider>
  );
}

function setup() {
  const props = makeProps();
  const scroll = vi.fn();
  render(<Fixture props={props} scroll={scroll} />);
  return {
    props,
    scroll,
    row: screen.getByRole("button", { name: "Keyboard feed" }),
    trigger: screen.getByRole("button", { name: "操作メニューを開く" }),
  };
}

describe("FeedItem native keyboard activation", () => {
  for (const key of ["Enter", " "]) {
    it(`${key} leaves the trigger and its SVG to native activation`, () => {
      const { props, scroll, trigger } = setup();
      trigger.focus();
      for (const target of [trigger, trigger.querySelector("svg")!]) {
        expect(fireEvent.keyDown(target, { key })).toBe(true);
        expect(props.onSelect).not.toHaveBeenCalled();
        expect(scroll).not.toHaveBeenCalled();
      }
      // happy-dom does not synthesize browser keyup/click activation.
      fireEvent.click(trigger);
      expect(screen.getByRole("menu", { name: "フィード操作メニュー" })).toBeInTheDocument();
    });

    it(`${key} does not close a portalled menu or select the owning feed`, () => {
      const { props, scroll, trigger } = setup();
      fireEvent.click(trigger);
      const pin = screen.getByRole("menuitem", { name: "ピン留め" });
      pin.focus();
      expect(fireEvent.keyDown(pin, { key })).toBe(true);
      expect(screen.getByRole("menu", { name: "フィード操作メニュー" })).toBeInTheDocument();
      expect(props.onSelect).not.toHaveBeenCalled();
      expect(scroll).not.toHaveBeenCalled();
      fireEvent.click(pin);
      expect(props.onTogglePin).toHaveBeenCalledExactlyOnceWith(props.feed.id);
      expect(props.onSelect).not.toHaveBeenCalled();
    });

    it(`${key} still selects the feed row exactly once`, () => {
      const { props, scroll, row } = setup();
      row.focus();
      expect(fireEvent.keyDown(row, { key })).toBe(false);
      expect(props.onSelect).toHaveBeenCalledExactlyOnceWith(props.feed.id);
      expect(scroll).not.toHaveBeenCalled();
    });
  }

  it("keeps repeated pointer opening, Escape and focus restoration intact", () => {
    const { props, trigger } = setup();
    for (let index = 0; index < 2; index++) {
      fireEvent.click(trigger);
      const menu = screen.getByRole("menu", { name: "フィード操作メニュー" });
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      fireEvent.keyDown(menu, { key: "Escape" });
      expect(screen.queryByRole("menu")).toBeNull();
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(trigger).toHaveFocus();
    }
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it.each([
    ["ミュート", "ミュート期間"],
    ["表示: 記事", "表示カテゴリ"],
    ["ダイジェスト: デフォルト", "ダイジェスト件数"],
    ["グループに移動", "グループに移動"],
  ])("preserves native keys inside the %s submenu", (action, name) => {
    const { props, scroll, trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: action }));
    const menu = screen.getByRole("menu", { name });
    const items = menu.querySelectorAll("button");
    for (const item of items) {
      for (const key of ["Enter", " "]) {
        expect(fireEvent.keyDown(item, { key })).toBe(true);
        expect(menu).toBeInTheDocument();
      }
    }
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(scroll).not.toHaveBeenCalled();
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("preserves pointer selection, inline rename and drag handlers", () => {
    const props = makeProps();
    props.onDragStartFeed = vi.fn();
    props.onDragEndFeed = vi.fn();
    render(<Fixture props={props} scroll={vi.fn()} />);
    const row = screen.getByRole("button", { name: "Keyboard feed" });
    fireEvent.click(row);
    expect(props.onSelect).toHaveBeenCalledExactlyOnceWith(props.feed.id);
    const dataTransfer = { effectAllowed: "", setData: vi.fn() };
    fireEvent.dragStart(row, { dataTransfer });
    fireEvent.dragEnd(row);
    expect(dataTransfer.setData).toHaveBeenCalledExactlyOnceWith(
      "application/x-rss-feed-id",
      props.feed.id,
    );
    expect(props.onDragStartFeed).toHaveBeenCalledExactlyOnceWith(props.feed.id);
    expect(props.onDragEndFeed).toHaveBeenCalledOnce();
    fireEvent.doubleClick(row);
    const input = screen.getByRole("textbox", { name: "フィード名を編集" });
    expect(row).toHaveAttribute("draggable", "false");
    fireEvent.change(input, { target: { value: "Renamed feed" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onRename).toHaveBeenCalledExactlyOnceWith(props.feed.id, "Renamed feed");
    expect(props.onSelect).toHaveBeenCalledOnce();
  });
});
