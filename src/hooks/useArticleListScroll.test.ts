import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeArticle } from "../../e2e/helpers/article";
import type { Layout } from "../types";
import { useArticleListScroll } from "./useArticleListScroll";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function setup(layout: Layout = "list") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  container.getBoundingClientRect = () => new DOMRect(0, 100, 300, 400);
  container.scrollTop = 200;
  container.scrollTo = vi.fn();
  const virtualizer = () => ({ scrollToIndex: vi.fn() });
  const displayItems = ["old-a", "old-b", "a", "b"].map((id) => makeArticle({ id }));
  return {
    selectedArticleId: "a" as string | null,
    layout,
    anchorTrigger: 0,
    scrollContainerRef: { current: container },
    displayItems,
    flatItems: displayItems.map((article, articleIndex) => ({
      type: "article" as const,
      key: article.id,
      article,
      articleIndex,
    })),
    listVirtualizer: virtualizer(),
    cardVirtualizer: virtualizer(),
    magazineVirtualizer: virtualizer(),
  };
}

function addItem(container: HTMLDivElement, id: string, top: number, height = 80) {
  const element = document.createElement("div");
  element.id = `article-${id}`;
  element.getBoundingClientRect = () => new DOMRect(0, top, 300, height);
  element.scrollIntoView = vi.fn();
  container.appendChild(element);
  return element;
}

describe("useArticleListScroll", () => {
  it.each<Layout>(["compact", "list", "card", "magazine", "gallery"])(
    "keeps already-visible next/previous selections still in %s layout",
    (layout) => {
      const options = setup(layout);
      const container = options.scrollContainerRef.current;
      addItem(container, "a", 180);
      addItem(container, "b", 480); // Partially visible cards should not jerk into alignment.
      const { rerender } = renderHook(useArticleListScroll, { initialProps: options });
      rerender({ ...options, selectedArticleId: "b" });
      rerender(options);
      expect(container.scrollTo).not.toHaveBeenCalled();
      expect(options.listVirtualizer.scrollToIndex).not.toHaveBeenCalled();
      expect(options.cardVirtualizer.scrollToIndex).not.toHaveBeenCalled();
      expect(options.magazineVirtualizer.scrollToIndex).not.toHaveBeenCalled();
    },
  );

  it("only centers an unchanged selection when the explicit anchor counter changes", () => {
    const options = setup();
    const container = options.scrollContainerRef.current;
    addItem(container, "a", 180);
    const { rerender } = renderHook(useArticleListScroll, { initialProps: options });
    expect(container.scrollTo).not.toHaveBeenCalled();
    rerender({ ...options, anchorTrigger: 1 });
    expect(container.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 120, behavior: "instant" });
  });

  it("reveals offscreen gallery selections instantly in the list pane during rapid next/previous", () => {
    const options = setup("gallery");
    const container = options.scrollContainerRef.current;
    const first = addItem(container, "a", 650);
    const second = addItem(container, "b", -100);
    const { rerender } = renderHook(useArticleListScroll, { initialProps: options });
    expect(container.scrollTo).toHaveBeenLastCalledWith({ top: 430, behavior: "instant" });
    rerender({ ...options, selectedArticleId: "b" });
    expect(container.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "instant" });
    rerender(options);
    expect(container.scrollTo).toHaveBeenCalledTimes(3);
    expect(first.scrollIntoView).not.toHaveBeenCalled();
    expect(second.scrollIntoView).not.toHaveBeenCalled();
  });

  it("uses rendered card indices while older read articles are pending removal", () => {
    const options = setup("card");
    renderHook(useArticleListScroll, { initialProps: options });
    // 'a' is index 0 in the unread results, but still index 2 in the rendered list.
    expect(options.cardVirtualizer.scrollToIndex).toHaveBeenCalledExactlyOnceWith(1, {
      align: "auto",
      behavior: "instant",
    });
  });

  it("reveals virtual rows on selection but does not re-anchor on delayed removals", () => {
    const options = setup();
    const { rerender } = renderHook(useArticleListScroll, { initialProps: options });
    expect(options.listVirtualizer.scrollToIndex).toHaveBeenCalledExactlyOnceWith(2, {
      align: "auto",
      behavior: "instant",
    });
    rerender({
      ...options,
      displayItems: options.displayItems.slice(2),
      flatItems: options.flatItems.slice(2),
    });
    expect(options.listVirtualizer.scrollToIndex).toHaveBeenCalledTimes(1);
  });

  it("centers a virtual row on a manual anchor and handles the magazine featured article", () => {
    const options = setup("magazine");
    const { rerender } = renderHook(useArticleListScroll, { initialProps: options });
    expect(options.magazineVirtualizer.scrollToIndex).toHaveBeenLastCalledWith(1, {
      align: "auto",
      behavior: "instant",
    });
    rerender({ ...options, anchorTrigger: 1 });
    expect(options.magazineVirtualizer.scrollToIndex).toHaveBeenLastCalledWith(1, {
      align: "center",
      behavior: "instant",
    });
    const container = options.scrollContainerRef.current;
    addItem(container, "old-a", -100, 200);
    rerender({ ...options, selectedArticleId: "old-a", anchorTrigger: 1 });
    expect(container.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0, behavior: "instant" });
  });

  it("ignores a hidden list pane rather than scrolling another pane", () => {
    const options = setup();
    const container = options.scrollContainerRef.current;
    Object.defineProperty(container, "clientHeight", { value: 0 });
    renderHook(useArticleListScroll, { initialProps: options });
    expect(container.scrollTo).not.toHaveBeenCalled();
    expect(options.listVirtualizer.scrollToIndex).not.toHaveBeenCalled();
  });

  it("updates its anchor baseline while selection is cleared", () => {
    const options = setup();
    const { rerender } = renderHook(useArticleListScroll, { initialProps: options });
    rerender({ ...options, selectedArticleId: null, anchorTrigger: 1 });
    rerender({ ...options, selectedArticleId: "b", anchorTrigger: 1 });
    expect(options.listVirtualizer.scrollToIndex).toHaveBeenLastCalledWith(3, {
      align: "auto",
      behavior: "instant",
    });
  });
});
