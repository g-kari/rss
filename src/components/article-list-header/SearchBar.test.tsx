import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Window } from "happy-dom";
import SearchBar from "./SearchBar";
import { ArticleFilterProvider, type ArticleFilter } from "../../contexts/ArticleFilterContext";
import { useKeyboardNav } from "../../hooks/useKeyboardNav";
import { useFocusMode } from "../../hooks/useFocusMode";

const scrollArticle = vi.fn();

function Fixture() {
  const focus = useFocusMode();
  const [rawQuery, updateQuery] = useState("title:original");
  const searchRef = useRef<HTMLInputElement>(null);
  useKeyboardNav({
    filteredArticles: [{ id: "current", title: "Current" }],
    selectedArticle: { id: "current", title: "Current" },
  } as Parameters<typeof useKeyboardNav>[0]);
  return (
    <ArticleFilterProvider value={{ rawQuery, updateQuery, searchRef } as ArticleFilter}>
      <SearchBar />
      <button onClick={() => updateQuery("title:newer")}>New query</button>
      <button>Outside</button>
      <button onClick={focus.toggleListFocusMode}>Focus list</button>
      <output aria-label="一覧フォーカス">{String(focus.listFocusMode)}</output>
      <main
        aria-label="記事本文"
        ref={(element) => {
          if (element) element.scrollBy = scrollArticle;
        }}
      />
    </ArticleFilterProvider>
  );
}
function saved() {
  return JSON.parse(localStorage.getItem("rss-saved-searches") ?? "[]");
}
beforeEach(() => {
  localStorage.clear();
  scrollArticle.mockClear();
});
afterEach(cleanup);

describe("saved search editing", () => {
  it("opens with native click activation and keeps editing while focus enters Save", () => {
    render(<Fixture />);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    const name = screen.getByLabelText("検索を保存するための名前");
    const submit = screen.getByRole("button", { name: "保存" });
    fireEvent.change(name, { target: { value: "Keyboard" } });
    act(() => submit.focus());
    expect(name).toBeInTheDocument();
    expect(submit).toHaveFocus();
    expect(saved()).toEqual([]);
    fireEvent.click(submit);
    expect(saved()).toMatchObject([{ name: "Keyboard", query: "title:original" }]);
    expect(screen.queryByLabelText("検索を保存するための名前")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveFocus();
  });

  it("does not dismiss the naming field on a blur to its Save button", () => {
    render(<Fixture />);
    fireEvent.mouseDown(screen.getByRole("button", { name: "保存" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    const name = screen.getByLabelText("検索を保存するための名前");
    const submit = screen.getByRole("button", { name: "保存" });
    fireEvent.blur(name, { relatedTarget: submit });
    expect(name).toBeInTheDocument();
    expect(saved()).toEqual([]);
  });

  it("Escape closes from Save without leaking the key or clearing the search", () => {
    render(<Fixture />);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    const submit = screen.getByRole("button", { name: "保存" });
    act(() => submit.focus());
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => submit.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByLabelText("検索を保存するための名前")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("title:original");
    expect(screen.getByRole("combobox")).toHaveFocus();
    expect(saved()).toEqual([]);
  });

  it("invalidates an open editor when the query changes without a focus transition", () => {
    render(<Fixture />);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    fireEvent.change(screen.getByLabelText("検索を保存するための名前"), {
      target: { value: "Stale name" },
    });
    fireEvent.click(screen.getByRole("button", { name: "New query" }));
    expect(screen.queryByLabelText("検索を保存するための名前")).not.toBeInTheDocument();
    expect(saved()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByLabelText("検索を保存するための名前")).toHaveValue("title:newer");
  });

  it("IME confirmation never submits or dismisses the editor", () => {
    render(<Fixture />);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    const name = screen.getByLabelText("検索を保存するための名前");
    for (const key of ["Enter", "Escape"]) {
      const event = new KeyboardEvent("keydown", {
        key,
        isComposing: true,
        bubbles: true,
        cancelable: true,
      });
      act(() => name.dispatchEvent(event));
      if (key === "Enter") expect(event.defaultPrevented).toBe(true);
      expect(name).toBeInTheDocument();
      expect(saved()).toEqual([]);
    }
  });

  it("preserves the name focus before Safari-style mouse activation without saving on press", () => {
    render(<Fixture />);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    const name = screen.getByLabelText("検索を保存するための名前");
    fireEvent.change(name, { target: { value: "Pointer" } });
    for (const label of ["保存", "キャンセル"]) {
      const button = screen.getByRole("button", { name: label });
      const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      act(() => button.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(true);
      expect(name).toHaveFocus();
      expect(name).toBeInTheDocument();
      expect(saved()).toEqual([]);
    }
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(saved()).toMatchObject([{ name: "Pointer", query: "title:original" }]);
    expect(screen.getByRole("combobox")).toHaveFocus();
  });

  it("keeps native Space activation away from the real reader shortcut", () => {
    render(<Fixture />);
    const button = screen.getByRole("button", { name: "保存" });
    const event = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    act(() => button.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
    expect(scrollArticle).not.toHaveBeenCalled();
  });
});

describe("search input IME composition", () => {
  function openSuggestions() {
    localStorage.setItem(
      "rss-saved-searches",
      JSON.stringify([
        { id: "saved", name: "Saved", query: "title:saved", createdAt: "2026-10-03T00:00:00Z" },
      ]),
    );
    localStorage.setItem("rss-search-history", JSON.stringify(["title:history"]));
    render(<Fixture />);
    const search = screen.getByRole("combobox");
    act(() => search.focus());
    fireEvent.keyDown(search, { key: "End" });
    return search;
  }

  for (const marker of [{ isComposing: true }, { keyCode: 229 }]) {
    for (const key of [
      "Enter",
      "Escape",
      "ArrowDown",
      "ArrowUp",
      "Home",
      "End",
      "Delete",
      "DeleteSaved",
    ]) {
      it(`preserves the query and suggestions during ${key} with ${JSON.stringify(marker)}`, () => {
        const search = openSuggestions();
        if (key === "End" || key === "DeleteSaved") fireEvent.keyDown(search, { key: "Home" });
        const selected = search.getAttribute("aria-activedescendant");
        const beforeSaved = localStorage.getItem("rss-saved-searches");
        const beforeHistory = localStorage.getItem("rss-search-history");
        const event = new KeyboardEvent("keydown", {
          key: key === "DeleteSaved" ? "Delete" : key,
          shiftKey: key.startsWith("Delete"),
          ...marker,
          bubbles: true,
          cancelable: true,
        });
        act(() => search.dispatchEvent(event));
        expect(event.defaultPrevented).toBe(false);
        expect(search).toHaveValue("title:original");
        expect(search).toHaveFocus();
        expect(search).toHaveAttribute("aria-expanded", "true");
        expect(search).toHaveAttribute("aria-activedescendant", selected);
        expect(localStorage.getItem("rss-saved-searches")).toBe(beforeSaved);
        expect(localStorage.getItem("rss-search-history")).toBe(beforeHistory);
      });
    }
  }

  it("does not record a partially composed search when no suggestions exist", () => {
    render(<Fixture />);
    const search = screen.getByRole("combobox");
    for (const marker of [{ isComposing: true }, { keyCode: 229 }]) {
      fireEvent.keyDown(search, { key: "Enter", ...marker });
      expect(localStorage.getItem("rss-search-history")).toBeNull();
    }
    fireEvent.keyDown(search, { key: "Enter" });
    expect(JSON.parse(localStorage.getItem("rss-search-history") ?? "[]")).toEqual([
      "title:original",
    ]);
  });

  it("keeps normal selection, deletion and Escape available after composition", () => {
    const search = openSuggestions();
    fireEvent.keyDown(search, { key: "Enter", isComposing: true });
    fireEvent.keyDown(search, { key: "Home" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(search).toHaveValue("title:saved");
    expect(search).toHaveAttribute("aria-expanded", "false");
    act(() => search.blur());
    act(() => search.focus());
    fireEvent.keyDown(search, { key: "Delete", shiftKey: true });
    expect(saved()).toEqual([]);
    const dismiss = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    act(() => search.dispatchEvent(dismiss));
    // A type=search input otherwise clears itself on a native browser Escape.
    expect(dismiss.defaultPrevented).toBe(true);
    expect(search).toHaveValue("title:saved");
    expect(search).toHaveAttribute("aria-expanded", "false");
    expect(search).toHaveFocus();
    fireEvent.keyDown(search, { key: "Escape" });
    expect(search).toHaveValue("");
    expect(search).not.toHaveFocus();
  });
});

describe("combined list-focus and search keyboard ownership", () => {
  let initialHistoryState: unknown;
  let ownedWindow: Window | null = null;
  let documentRoot: Root | null = null;
  beforeEach(({ task }) => {
    if (task.name.includes("document root: true")) {
      ownedWindow = new Window();
      vi.stubGlobal("window", ownedWindow);
      vi.stubGlobal("document", ownedWindow.document);
      vi.stubGlobal("localStorage", ownedWindow.localStorage);
      vi.stubGlobal("Event", ownedWindow.Event);
      vi.stubGlobal("KeyboardEvent", ownedWindow.KeyboardEvent);
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    }
    initialHistoryState = window.history.state;
  });
  afterEach(async () => {
    if (documentRoot) {
      await act(async () => documentRoot!.unmount());
      documentRoot = null;
    }
    window.history.replaceState(initialHistoryState, "");
    vi.restoreAllMocks();
    if (ownedWindow) {
      await ownedWindow.happyDOM.close();
      ownedWindow = null;
      vi.unstubAllGlobals();
    }
  });

  it.each([false, true])(
    "Save editor consumes Escape before list-focus exit (document root: %s)",
    async (atDocument) => {
      const baseState = window.history.state;
      const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
      if (atDocument) {
        documentRoot = createRoot(document);
        await act(async () =>
          documentRoot!.render(
            <html>
              <head />
              <body>
                <Fixture />
              </body>
            </html>,
          ),
        );
      } else render(<Fixture />);
      const view = within(document.body);
      await act(async () => fireEvent.click(view.getByRole("button", { name: "Focus list" })));
      expect(view.getByRole("status", { name: "一覧フォーカス" })).toHaveTextContent("true");
      await act(async () => fireEvent.click(view.getByRole("button", { name: "保存" })));
      const submit = view.getByRole("button", { name: "保存" });
      act(() => submit.focus());
      await act(async () => fireEvent.keyDown(submit, { key: "Escape" }));
      expect(back).not.toHaveBeenCalled();
      expect(view.queryByLabelText("検索を保存するための名前")).not.toBeInTheDocument();
      expect(view.getByRole("combobox")).toHaveValue("title:original");
      expect(view.getByRole("combobox")).toHaveFocus();
      expect(saved()).toEqual([]);
      act(() => view.getByRole("button", { name: "Outside" }).focus());
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      expect(back).toHaveBeenCalledTimes(1);
      window.history.replaceState(baseState, "");
      act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: baseState })));
      expect(view.getByRole("status", { name: "一覧フォーカス" })).toHaveTextContent("false");
    },
  );

  it.each([{ isComposing: true }, { keyCode: 229 }])(
    "preserves IME search while list focus is active (%j)",
    (marker) => {
      const baseState = window.history.state;
      const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
      localStorage.setItem("rss-search-history", JSON.stringify(["title:history"]));
      render(<Fixture />);
      fireEvent.click(screen.getByRole("button", { name: "Focus list" }));
      const search = screen.getByRole("combobox");
      act(() => search.focus());
      const history = localStorage.getItem("rss-search-history");
      for (const key of ["Enter", "Escape", "ArrowDown", "Delete"]) {
        const event = new KeyboardEvent("keydown", {
          key,
          shiftKey: key === "Delete",
          ...marker,
          bubbles: true,
          cancelable: true,
        });
        act(() => search.dispatchEvent(event));
        expect(event.defaultPrevented).toBe(false);
        expect(search).toHaveValue("title:original");
        expect(search).toHaveFocus();
        expect(search).toHaveAttribute("aria-expanded", "true");
        expect(localStorage.getItem("rss-search-history")).toBe(history);
        expect(saved()).toEqual([]);
        expect(back).not.toHaveBeenCalled();
      }
      window.history.replaceState(baseState, "");
      act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: baseState })));
    },
  );
});
