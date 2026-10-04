import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ArticleNotePanel from "../components/article-view/ArticleNotePanel";
import { useArticleNote } from "./useArticleNote";
import {
  useReadStatePersistence,
  type ReadStatePersistenceResult,
} from "./useReadStatePersistence";
import { flushDeferredSaves, saveJson, STORAGE_KEYS } from "../lib/storage";
import type { Article } from "../types";
const article: Article = {
  id: "note-article",
  feedHash: "synthetic",
  title: "Synthetic note",
  guid: "note",
  link: "https://example.test/note",
  summary: "",
  publishedAt: "2026-10-04T00:00:00Z",
  createdAt: "2026-10-04T00:00:00Z",
};
const scheduleSync = vi.fn();
let state: ReadStatePersistenceResult;
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  flushDeferredSaves();
});
function setup(note?: string) {
  saveJson(STORAGE_KEYS.NOTES, {
    unrelated: "Keep me",
    ...(note === undefined ? {} : { [article.id]: note }),
  });
  flushDeferredSaves();
  function Fixture() {
    state = useReadStatePersistence([], undefined, scheduleSync, () => {});
    const savedNote = state.notes[article.id];
    const edit = useArticleNote({
      article,
      note: savedNote,
      onSetNote: state.setNote,
      onDeleteNote: state.deleteNote,
    });
    return (
      <>
        <ArticleNotePanel {...edit} note={savedNote} />
        <button>Outside</button>
      </>
    );
  }
  render(<Fixture />);
  state.pendingNotesChangedRef.current.add("unrelated-pending-change");
  state.pendingNotesRemovedRef.current.add("unrelated-pending-remove");
  return screen.getByRole("textbox", { name: "この記事へのメモ" }) as HTMLTextAreaElement;
}
function snapshot() {
  flushDeferredSaves();
  return {
    notes: state.notes,
    stored: localStorage.getItem(STORAGE_KEYS.NOTES),
    changed: [...state.pendingNotesChangedRef.current],
    removed: [...state.pendingNotesRemovedRef.current],
    scheduled: scheduleSync.mock.calls.length,
  };
}
function edit(textarea: HTMLTextAreaElement, draft: string) {
  textarea.focus();
  fireEvent.change(textarea, { target: { value: draft } });
}
describe("article note cancel through the actual panel and persistence", () => {
  it.each([
    ["existing edit", "Original note", "Discarded edit"],
    ["existing cleared", "Original note", ""],
    ["existing whitespace", "Original note", "   "],
    ["new draft", undefined, "Discarded new note"],
    ["new whitespace", undefined, "   "],
    ["unchanged", "Original note", "Original note"],
    ["saved surrounding whitespace", "  Original note  ", "Discard me"],
    ["saved multiline whitespace", "\nOriginal note\n", ""],
    ["saved only whitespace", "   ", "Replacement"],
  ])(
    "%s Escape leaves notes, storage, pending intent and sync untouched",
    (_label, original, draft) => {
      const textarea = setup(original);
      const before = snapshot();
      edit(textarea, draft!);
      fireEvent.keyDown(textarea, { key: "Escape" });
      expect(textarea).not.toHaveFocus();
      expect(textarea).toHaveValue(original ?? "");
      expect(snapshot()).toEqual(before);
    },
  );
  it("a cancelled draft can be re-edited and normally saved", () => {
    const textarea = setup("Original note");
    edit(textarea, "Discard me");
    fireEvent.keyDown(textarea, { key: "Escape" });
    edit(textarea, "  Keep this  ");
    fireEvent.blur(textarea);
    expect(state.notes).toEqual({ unrelated: "Keep me", [article.id]: "Keep this" });
    expect(state.pendingNotesChangedRef.current.has(article.id)).toBe(true);
    expect(state.pendingNotesRemovedRef.current.has(article.id)).toBe(false);
    expect(scheduleSync).toHaveBeenCalledTimes(1);
  });
  it("ordinary empty blur still deletes the saved note", () => {
    const textarea = setup("Original note");
    edit(textarea, "  ");
    fireEvent.blur(textarea);
    expect(state.notes).toEqual({ unrelated: "Keep me" });
    expect(state.pendingNotesRemovedRef.current.has(article.id)).toBe(true);
    expect(state.pendingNotesChangedRef.current.has(article.id)).toBe(false);
    expect(scheduleSync).toHaveBeenCalledTimes(1);
  });
  it("Enter remains an editing key and blur saves multiline text", () => {
    const textarea = setup("Original note");
    edit(textarea, "First\nSecond");
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(textarea).toHaveFocus();
    expect(scheduleSync).not.toHaveBeenCalled();
    fireEvent.blur(textarea);
    expect(state.notes[article.id]).toBe("First\nSecond");
  });
  it.each([{ isComposing: true }, { keyCode: 229 }])(
    "IME Escape does not cancel or blur (%j)",
    (ime) => {
      const textarea = setup("Original note");
      const before = snapshot();
      edit(textarea, "編集中");
      fireEvent.keyDown(textarea, { key: "Escape", ...ime });
      expect(textarea).toHaveFocus();
      expect(textarea).toHaveValue("編集中");
      expect(snapshot()).toEqual(before);
    },
  );
});
describe("same event draft and blur ordering", () => {
  it("reads a synchronous draft update before React renders again", () => {
    const onSetNote = vi.fn();
    const onDeleteNote = vi.fn();
    const { result } = renderHook(() =>
      useArticleNote({ article, note: "Original note", onSetNote, onDeleteNote }),
    );
    act(() => {
      result.current.setNoteText("Discard me");
    });
    act(() => {
      result.current.setNoteText("Original note");
      result.current.handleNoteBlur();
    });
    expect(onSetNote).not.toHaveBeenCalled();
    expect(onDeleteNote).not.toHaveBeenCalled();
    act(() => {
      result.current.setNoteText("Keep me");
      result.current.handleNoteBlur();
    });
    expect(onSetNote).toHaveBeenCalledWith(article.id, "Keep me");
  });
});
