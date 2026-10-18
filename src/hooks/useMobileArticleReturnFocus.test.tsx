import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CSSProperties } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeArticle } from "../../e2e/helpers/article";
import { CompactArticleItem } from "../components/article-items/CompactItem";
import { MobilePane } from "../components/MobilePane";
import { SelectedArticleCtx } from "../contexts/SelectedArticleContext";
import type { Article } from "../types";
import { useMobileArticleReturnFocus } from "./useMobileArticleReturnFocus";
import type { MobilePane as Pane } from "./useMobilePane";

const first = makeArticle({ id: "return-first", title: "First synthetic article" });
const second = makeArticle({ id: "return-second", title: "Second synthetic article" });
const articles = [first, second];
const noop = () => {};
interface Row {
  article: Article;
  key: string;
  hidden?: boolean;
  inert?: boolean;
  ariaHidden?: boolean;
  style?: CSSProperties;
  deleting?: boolean;
}
const rows: Row[] = articles.map((article) => ({ article, key: article.id }));
interface Props {
  pane: Pane;
  isDesktop?: boolean;
  blocked?: boolean;
  selectedId?: string | null;
  visible?: Article[];
  rendered?: Row[];
  listHidden?: boolean;
}
function Fixture({
  pane,
  isDesktop = false,
  blocked = false,
  selectedId = first.id,
  visible = articles,
  rendered = rows,
  listHidden = false,
}: Props) {
  useMobileArticleReturnFocus({
    mobilePane: pane,
    isDesktop,
    blocked,
    selectedArticleId: selectedId,
    visibleArticles: visible,
  });
  return (
    <>
      <button>External control</button>
      <div style={{ pointerEvents: "none" }}>
        <button style={{ pointerEvents: "auto" }}>Toast control</button>
      </div>
      <MobilePane
        pane="list"
        currentPane={pane}
        isDesktop={isDesktop}
        as="main"
        id="main-content"
        tabIndex={-1}
      >
        <div hidden={listHidden} role="feed" aria-label="Synthetic articles">
          <SelectedArticleCtx.Provider value={selectedId}>
            {rendered.map((row, index) => (
              <div
                key={row.key}
                data-testid={row.key}
                hidden={row.hidden}
                inert={row.inert}
                aria-hidden={row.ariaHidden}
                style={row.style}
              >
                <CompactArticleItem
                  article={row.article}
                  index={index}
                  totalCount={rendered.length}
                  isRead={false}
                  isBookmarked={false}
                  hasNote={false}
                  isDeleting={row.deleting}
                  feedName="Synthetic"
                  thumb={undefined}
                  showFeedName={false}
                  query=""
                  onSelectArticle={noop}
                  onToggleRead={noop}
                  onToggleBookmark={noop}
                />
              </div>
            ))}
          </SelectedArticleCtx.Provider>
        </div>
        <button>List control</button>
      </MobilePane>
      <MobilePane pane="view" currentPane={pane} isDesktop={isDesktop}>
        <button>Reader control</button>
      </MobilePane>
    </>
  );
}
function row(key = first.id) {
  return screen.getByTestId(key).querySelector<HTMLElement>('[role="article"]')!;
}
function start(options: Omit<Props, "pane"> = {}) {
  const view = render(<Fixture {...options} pane="list" />);
  const opener = row();
  opener.focus();
  view.rerender(<Fixture {...options} pane="view" />);
  const readerControl = screen.getByRole("button", { name: "Reader control" });
  readerControl.focus();
  const back = (changes: Omit<Props, "pane"> = {}) =>
    view.rerender(<Fixture {...options} {...changes} pane="list" />);
  return { ...view, opener, readerControl, back };
}
function expectSafeFocus(target: HTMLElement) {
  expect(target).toHaveFocus();
  expect(document.activeElement?.closest('[hidden], [inert], [aria-hidden="true"]')).toBeNull();
}
beforeEach(() => {
  // Synthetic decision geometry, not measurements from a rendering browser.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.getAttribute("role") === "article") return new DOMRect(0, 100, 390, 48);
    if (this.getAttribute("role") === "feed") return new DOMRect(0, 80, 390, 500);
    return new DOMRect(0, 0, 390, 844);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ordinary mobile article return focus boundaries", () => {
  it("uses preventScroll without changing the list scroll property", () => {
    const fixture = start();
    const main = document.querySelector<HTMLElement>("#main-content")!;
    main.scrollTop = 320;
    const focus = vi.spyOn(fixture.opener, "focus");
    fixture.back();
    expectSafeFocus(fixture.opener);
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(main.scrollTop).toBe(320);
  });

  it("returns to the current reader article, not a stale opener", () => {
    const fixture = start();
    fixture.rerender(<Fixture pane="view" selectedId={second.id} />);
    fixture.back({ selectedId: second.id });
    expectSafeFocus(row(second.id));
  });

  it.each([
    ["above the scroller", new DOMRect(0, 10, 390, 48)],
    ["below the scroller but inside the pane", new DOMRect(0, 600, 390, 48)],
    ["outside horizontally", new DOMRect(400, 100, 390, 48)],
    ["zero-size", new DOMRect(0, 100, 0, 0)],
  ])("uses the list fallback for mounted overscan %s", (_name, bounds) => {
    const fixture = start();
    Object.defineProperty(fixture.opener, "getBoundingClientRect", { value: () => bounds });
    fixture.back();
    expectSafeFocus(document.querySelector<HTMLElement>("#main-content")!);
  });

  it("allows a partially visible row without changing the list position", () => {
    const fixture = start();
    Object.defineProperty(fixture.opener, "getBoundingClientRect", {
      value: () => new DOMRect(0, 560, 390, 48),
    });
    fixture.back();
    expectSafeFocus(fixture.opener);
  });

  it("uses pane-relative clipping while the list is sliding outside the window", () => {
    const fixture = start();
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.getAttribute("role") === "article") return new DOMRect(390, 100, 390, 48);
      if (this.getAttribute("role") === "feed") return new DOMRect(390, 80, 390, 500);
      return new DOMRect(390, 0, 390, 844);
    });
    fixture.back();
    expectSafeFocus(fixture.opener);
  });

  it.each([
    ["logically removed but retained DOM", { visible: [second] }],
    ["virtualized away", { rendered: [rows[1]!] }],
    ["selection cleared", { selectedId: null }],
    ["deleting animation", { rendered: [{ ...rows[0]!, deleting: true }] }],
    [
      "gallery deletion wrapper",
      { rendered: [{ ...rows[0]!, style: { opacity: 0, pointerEvents: "none" } }] },
    ],
    ["hidden row", { rendered: [{ ...rows[0]!, hidden: true }] }],
    ["inert row", { rendered: [{ ...rows[0]!, inert: true }] }],
    ["aria-hidden row", { rendered: [{ ...rows[0]!, ariaHidden: true }] }],
    ["display-none ancestor", { listHidden: true }],
    [
      "visibility-hidden ancestor",
      { rendered: [{ ...rows[0]!, style: { visibility: "hidden" } }] },
    ],
  ] satisfies [string, Omit<Props, "pane">][])(
    "falls back without scrolling when %s",
    (_name, change) => {
      const fixture = start();
      const main = document.querySelector<HTMLElement>("#main-content")!;
      const focus = vi.spyOn(main, "focus");
      fixture.back(change);
      expectSafeFocus(main);
      expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    },
  );

  it("records the exact pointer opener among duplicate gallery article IDs", () => {
    const duplicates: Row[] = [
      { article: first, key: "gallery-a" },
      { article: first, key: "gallery-b" },
    ];
    const view = render(<Fixture pane="list" rendered={duplicates} />);
    const exact = row("gallery-b");
    fireEvent.pointerDown(exact);
    view.rerender(<Fixture pane="view" rendered={duplicates} />);
    screen.getByRole("button", { name: "Reader control" }).focus();
    view.rerender(<Fixture pane="list" rendered={duplicates} />);
    expectSafeFocus(exact);
  });

  it("ignores a hidden duplicate instead of trusting the first matching ID", () => {
    const duplicates: Row[] = [
      { article: first, key: "gallery-hidden", hidden: true },
      { article: first, key: "gallery-visible" },
    ];
    const view = render(<Fixture pane="view" rendered={duplicates} />);
    screen.getByRole("button", { name: "Reader control" }).focus();
    view.rerender(<Fixture pane="list" rendered={duplicates} />);
    expectSafeFocus(row("gallery-visible"));
  });

  it("falls back for ambiguous duplicate IDs when no exact opener remains", () => {
    const fixture = start();
    fixture.back({
      rendered: [
        { article: first, key: "gallery-a" },
        { article: first, key: "gallery-b" },
      ],
    });
    expectSafeFocus(document.querySelector<HTMLElement>("#main-content")!);
  });

  it("clears stale opener intent after another list control receives focus", () => {
    const duplicates: Row[] = [
      { article: first, key: "gallery-a" },
      { article: first, key: "gallery-b" },
    ];
    const view = render(<Fixture pane="list" rendered={duplicates} />);
    fireEvent.pointerDown(row("gallery-b"));
    screen.getByRole("button", { name: "List control" }).focus();
    view.rerender(<Fixture pane="view" rendered={duplicates} />);
    screen.getByRole("button", { name: "Reader control" }).focus();
    view.rerender(<Fixture pane="list" rendered={duplicates} />);
    expectSafeFocus(document.querySelector<HTMLElement>("#main-content")!);
  });

  it("restores when native inert blur has left neutral body focus", () => {
    const fixture = start();
    fixture.readerControl.blur();
    expect(document.body).toHaveFocus();
    fixture.back();
    expectSafeFocus(fixture.opener);
  });

  it("preserves legitimate focus already moved outside the reader", () => {
    const fixture = start();
    const external = screen.getByRole("button", { name: "External control" });
    external.focus();
    fixture.back();
    expectSafeFocus(external);
  });

  it("preserves focused toast controls despite a pointer-events-none ancestor", () => {
    const fixture = start();
    const toast = screen.getByRole("button", { name: "Toast control" });
    toast.focus();
    fixture.back();
    expectSafeFocus(toast);
  });

  it("does not focus on mount, sidebar transitions or later selection/filter changes", () => {
    const external = document.createElement("button");
    document.body.appendChild(external);
    external.focus();
    const view = render(<Fixture pane="list" />);
    expect(external).toHaveFocus();
    view.rerender(<Fixture pane="sidebar" />);
    view.rerender(<Fixture pane="list" selectedId={second.id} visible={[second]} />);
    expect(external).toHaveFocus();
    external.remove();
  });

  it.each([
    ["desktop throughout", { isDesktop: true }, { isDesktop: true }],
    ["resize to desktop", {}, { isDesktop: true }],
    ["resize from desktop", { isDesktop: true }, {}],
    ["popup/overlay remains open", { blocked: true }, { blocked: true }],
    ["popup/overlay closes in return commit", { blocked: true }, {}],
    ["popup/overlay opens in return commit", {}, { blocked: true }],
  ] satisfies [string, Omit<Props, "pane">, Omit<Props, "pane">][])(
    "does not interfere when %s",
    (_name, before, after) => {
      const view = render(<Fixture {...before} pane="view" />);
      const readerControl = screen.getByRole("button", { name: "Reader control" });
      readerControl.focus();
      view.rerender(<Fixture {...after} pane="list" />);
      expect(readerControl).toHaveFocus();
      view.rerender(<Fixture pane="list" />);
      expect(readerControl).toHaveFocus();
    },
  );

  it("handles repeated return edges without replaying an old edge", () => {
    const fixture = start();
    fixture.back();
    expectSafeFocus(fixture.opener);
    const external = screen.getByRole("button", { name: "External control" });
    external.focus();
    fixture.rerender(<Fixture pane="list" selectedId={second.id} />);
    expectSafeFocus(external);
    fixture.rerender(<Fixture pane="view" selectedId={second.id} />);
    screen.getByRole("button", { name: "Reader control" }).focus();
    fixture.back({ selectedId: second.id });
    expectSafeFocus(row(second.id));
  });
});
