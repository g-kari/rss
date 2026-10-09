import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import type { FeedView } from "../../types";
import FeedViewTabs, { FEED_VIEW_TABS } from "./FeedViewTabs";

const dragType = "application/x-rss-feed-id";
afterEach(() => cleanup());

function mount() {
  const change = vi.fn();
  const drop = vi.fn();
  function Fixture() {
    const [view, setView] = useState<FeedView>("articles");
    return (
      <FeedViewTabs
        activeView={view}
        onChangeView={(next) => {
          change(next);
          setView(next);
        }}
        onDropFeedOnView={drop}
      />
    );
  }
  render(<Fixture />);
  return { change, drop, list: screen.getByRole("tablist", { name: "フィードビュー" }) };
}

describe("FeedViewTabs navigation", () => {
  it("uses the shared minimum navigation size without changing tab semantics or hit area", () => {
    const { list } = mount();
    const tabs = within(list).getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    for (const [index, tab] of tabs.entries()) {
      expect(tab).toHaveAccessibleName(FEED_VIEW_TABS[index].label);
      expect(tab).toHaveAttribute("aria-controls", "feed-view-panel");
      expect(tab).toHaveAttribute("aria-selected", String(index === 0));
      expect(tab).toHaveAttribute("tabindex", index === 0 ? "0" : "-1");
      expect(tab).toHaveClass("min-h-[44px]", "min-w-0", "flex-col");
      expect(tab.querySelector("span")).toHaveClass("text-xs", "leading-4", "whitespace-nowrap");
    }
    expect(tabs[0]).toHaveClass("selection-tab-current", "text-selection-accent");
  });

  it("changes once and moves local focus with arrows, wrapping, Home and End", () => {
    const { change, list } = mount();
    const tabs = within(list).getAllByRole("tab");
    tabs[0].focus();
    for (const [key, index] of [
      ["ArrowRight", 1],
      ["End", 3],
      ["ArrowRight", 0],
      ["ArrowLeft", 3],
      ["Home", 0],
    ] as const) {
      const previous = change.mock.calls.length;
      fireEvent.keyDown(document.activeElement!, { key });
      expect(change).toHaveBeenCalledTimes(previous + 1);
      expect(change).toHaveBeenLastCalledWith(FEED_VIEW_TABS[index].id);
      expect(tabs[index]).toHaveFocus();
      expect(tabs.filter((tab) => tab.tabIndex === 0)).toEqual([tabs[index]]);
    }
    fireEvent.keyDown(tabs[0], { key: "v" });
    expect(change).toHaveBeenCalledTimes(5);
    fireEvent.click(tabs[2]);
    expect(change).toHaveBeenCalledTimes(6);
    expect(change).toHaveBeenLastCalledWith("videos");
  });

  it("retains feed drag/drop and clears its ring without selecting another view", () => {
    const { change, drop, list } = mount();
    const target = within(list).getByRole("tab", { name: "画像" });
    const dataTransfer = { types: [dragType], getData: vi.fn(() => "feed-1"), dropEffect: "none" };
    fireEvent.dragEnter(target, { dataTransfer });
    expect(target).toHaveClass("ring-inset");
    expect(fireEvent.dragOver(target, { dataTransfer })).toBe(false);
    fireEvent.drop(target, { dataTransfer });
    expect(drop).toHaveBeenCalledExactlyOnceWith("feed-1", "pictures");
    expect(dataTransfer.getData).toHaveBeenCalledWith(dragType);
    expect(target).not.toHaveClass("ring-inset");
    expect(change).not.toHaveBeenCalled();
    const irrelevant = { types: ["text/plain"], getData: vi.fn(() => ""), dropEffect: "none" };
    fireEvent.dragEnter(target, { dataTransfer: irrelevant });
    expect(fireEvent.dragOver(target, { dataTransfer: irrelevant })).toBe(true);
    fireEvent.drop(target, { dataTransfer: irrelevant });
    expect(irrelevant.dropEffect).toBe("none");
    expect(target).not.toHaveClass("ring-inset");
    expect(drop).toHaveBeenCalledTimes(1);
  });
});
