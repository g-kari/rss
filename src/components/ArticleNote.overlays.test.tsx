import { useState, type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useArticleNote } from "../hooks/useArticleNote";
import ArticleNotePanel from "./article-view/ArticleNotePanel";
import {
  useReadStatePersistence,
  type ReadStatePersistenceResult,
} from "../hooks/useReadStatePersistence";
import { flushDeferredSaves, saveJson, STORAGE_KEYS } from "../lib/storage";
import type { Article } from "../types";
import ArticleDetailOverlay from "./ArticleDetailOverlay";
import FocusModeOverlay from "./FocusModeOverlay";
import type ArticleView from "./ArticleView";
const article: Article = {
  id: "a",
  feedHash: "synthetic",
  guid: "a",
  link: "https://example.test",
  title: "Synthetic",
  summary: "",
  publishedAt: "2026-10-04",
  createdAt: "2026-10-04",
};
let state: ReadStatePersistenceResult;
const sync = vi.fn();
// Keep the actual reader overlays, focus traps, note panel/hook and persistence.
// Only unrelated full-article work and visual controls are replaced.
vi.mock("./ArticleView", () => ({
  default: function Reader() {
    state = useReadStatePersistence([], undefined, sync, () => {});
    const note = state.notes.a;
    const edit = useArticleNote({
      article,
      note,
      onSetNote: state.setNote,
      onDeleteNote: state.deleteNote,
    });
    return <ArticleNotePanel {...edit} note={note} />;
  },
}));
vi.mock("./VisualModeBar", () => ({ VisualModeSwitch: () => null }));
vi.mock("../hooks/useArticleViewShortcuts", () => ({ registerReaderFocusOverlay: () => () => {} }));
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  flushDeferredSaves();
});
function snapshot() {
  flushDeferredSaves();
  return {
    notes: state.notes,
    storage: localStorage.getItem(STORAGE_KEYS.NOTES),
    changed: [...state.pendingNotesChangedRef.current],
    removed: [...state.pendingNotesRemovedRef.current],
    sync: sync.mock.calls.length,
  };
}
for (const mode of ["detail", "focus"] as const) {
  for (const ime of [undefined, { isComposing: true }, { keyCode: 229 }]) {
    for (const [note, draft] of [
      ["saved", "discard"],
      ["saved", ""],
      [undefined, "new draft"],
      ["  saved  ", "discard"],
    ] as const) {
      it(`${mode} Escape ${JSON.stringify(ime)} retains the owner and saved=${JSON.stringify(note)}`, () => {
        saveJson(STORAGE_KEYS.NOTES, {
          other: "retain",
          ...(note === undefined ? {} : { a: note }),
        });
        flushDeferredSaves();
        function Parent() {
          const [open, setOpen] = useState(false);
          const props = {} as ComponentProps<typeof ArticleView>;
          return (
            <>
              <button onClick={() => setOpen(true)}>Open</button>
              {mode === "detail" ? (
                <ArticleDetailOverlay
                  open={open}
                  onClose={() => setOpen(false)}
                  articleViewProps={props}
                />
              ) : (
                <FocusModeOverlay
                  focusMode={open}
                  exitFocusMode={() => setOpen(false)}
                  articleViewProps={props}
                />
              )}
            </>
          );
        }
        render(<Parent />);
        const launch = screen.getByRole("button", { name: "Open" });
        launch.focus();
        fireEvent.click(launch);
        const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
        textarea.focus();
        fireEvent.change(textarea, { target: { value: draft } });
        const before = snapshot();
        fireEvent.keyDown(textarea, { key: "Escape", ...ime });
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(snapshot()).toEqual(before);
        if (ime) {
          expect(textarea).toHaveValue(draft);
          expect(textarea).toHaveFocus();
          fireEvent.keyDown(textarea, { key: "Escape" });
        }
        expect(textarea).toHaveValue(note ?? "");
        expect(textarea).not.toHaveFocus();
        expect(snapshot()).toEqual(before);
        const close = screen.getByRole("button", {
          name: mode === "detail" ? "記事詳細パネルを閉じる" : "フォーカスモード終了",
        });
        close.focus();
        fireEvent.keyDown(close, { key: "Escape" });
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(launch).toHaveFocus();
        expect(snapshot()).toEqual(before);
      });
    }
  }
}
