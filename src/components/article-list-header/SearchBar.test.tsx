import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useRef, useState } from "react";
import SearchBar from "./SearchBar";
import { ArticleFilterProvider, type ArticleFilter } from "../../contexts/ArticleFilterContext";

function Fixture() {
  const [rawQuery, updateQuery] = useState("title:original");
  const searchRef = useRef<HTMLInputElement>(null);
  return (
    <ArticleFilterProvider value={{ rawQuery, updateQuery, searchRef } as ArticleFilter}>
      <SearchBar />
      <button onClick={() => updateQuery("title:newer")}>New query</button>
      <button>Outside</button>
    </ArticleFilterProvider>
  );
}
function saved() {
  return JSON.parse(localStorage.getItem("rss-saved-searches") ?? "[]");
}
beforeEach(() => localStorage.clear());
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
});
