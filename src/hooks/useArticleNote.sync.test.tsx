import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ArticleNotePanel from "../components/article-view/ArticleNotePanel";
import { useArticleNote } from "./useArticleNote";
import { useReadState } from "./useReadState";
import { saveReadState, fetchReadState } from "../lib/read-state-sync-api";
import { flushDeferredSaves, saveJson, STORAGE_KEYS } from "../lib/storage";
import type { Article, UserProfile } from "../types";
vi.mock("../lib/read-state-sync-api", () => ({ saveReadState: vi.fn(), fetchReadState: vi.fn() }));
const article: Article = {
  id: "synthetic-note",
  feedHash: "synthetic",
  title: "Synthetic",
  guid: "note",
  link: "https://example.test/note",
  summary: "",
  publishedAt: "2026-10-04T00:00:00Z",
  createdAt: "2026-10-04T00:00:00Z",
};
const user: UserProfile = {
  id: "synthetic-user",
  sub: "synthetic-user",
  name: "Synthetic",
  email: "synthetic@example.test",
  picture: null,
};
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.mocked(fetchReadState).mockResolvedValue(null);
  vi.mocked(saveReadState).mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  flushDeferredSaves();
  vi.useRealTimers();
});
function setup(note?: string) {
  saveJson(STORAGE_KEYS.NOTES, {
    unrelated: "Keep me",
    ...(note === undefined ? {} : { [article.id]: note }),
  });
  flushDeferredSaves();
  function Fixture() {
    const state = useReadState(user, []);
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
        <output aria-label="notes">{JSON.stringify(state.notes)}</output>
        <output aria-label="pending">{String(state.hasPendingChanges)}</output>
      </>
    );
  }
  render(<Fixture />);
  return screen.getByRole("textbox", { name: "この記事へのメモ" }) as HTMLTextAreaElement;
}
describe("note cancellation never schedules a server write", () => {
  it.each([
    ["existing edit", "Original", "Discard"],
    ["existing clear", "Original", ""],
    ["new draft", undefined, "Discard"],
  ])(
    "%s leaves the actual sync hook idle, then allows a later save",
    async (_label, original, draft) => {
      const textarea = setup(original);
      await act(async () => {
        await Promise.resolve();
      });
      const before = localStorage.getItem(STORAGE_KEYS.NOTES);
      textarea.focus();
      fireEvent.change(textarea, { target: { value: draft } });
      fireEvent.keyDown(textarea, { key: "Escape" });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });
      expect(localStorage.getItem(STORAGE_KEYS.NOTES)).toBe(before);
      expect(screen.getByLabelText("pending")).toHaveTextContent("false");
      expect(saveReadState).not.toHaveBeenCalled();
      textarea.focus();
      fireEvent.change(textarea, { target: { value: "Keep later" } });
      fireEvent.blur(textarea);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });
      expect(saveReadState).toHaveBeenCalledTimes(1);
      const body = JSON.parse(vi.mocked(saveReadState).mock.calls[0][0]);
      expect(body.notes).toEqual({ unrelated: "Keep me", [article.id]: "Keep later" });
      expect(body.removedIds.notes).not.toContain(article.id);
    },
  );
});
