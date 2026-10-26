// Independent synthetic audit of K4's previously unexecuted production-reader lifecycle.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ArticleView from "./ArticleView";
import { TestReaderSettings } from "../../e2e/helpers/reader-settings";
import { ArticleFilterProvider } from "../contexts/ArticleFilterContext";
import { ToastProvider } from "../contexts/ToastContext";
import { TtsAdapterProvider } from "../contexts/TtsAdapterContext";
import { useFilteredArticles } from "../hooks/useFilteredArticles";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";
import { useReadState } from "../hooks/useReadState";
import { saveReadState, fetchReadState } from "../lib/read-state-sync-api";
import { flushDeferredSaves, saveJson, STORAGE_KEYS } from "../lib/storage";
import type { Article, UserProfile } from "../types";

vi.mock("../lib/read-state-sync-api", () => ({ saveReadState: vi.fn(), fetchReadState: vi.fn() }));
vi.mock("../hooks/useArticleContent", () => ({
  useArticleContent: () => ({
    storedContent: null,
    fetching: false,
    fetchError: "",
    fetchRetryable: false,
    resolvedOgImage: null,
    fetchFullContent: vi.fn(),
    fetchFullContentOnce: vi.fn(),
  }),
}));
vi.mock("../hooks/useArticleAi", () => ({
  useArticleAi: () => ({
    aiResult: null,
    aiResultProvider: null,
    aiLoading: false,
    aiError: null,
    translateResult: null,
    translateLoading: false,
    translateError: null,
    doRunAi: vi.fn(),
    resetAi: vi.fn(),
    doTranslate: vi.fn(),
    resetTranslate: vi.fn(),
  }),
}));

const noop = () => {};
const empty = new Set<string>();
const articles: Article[] = ["a", "b"].map((id) => ({
  id,
  feedHash: "synthetic",
  guid: id,
  title: `Lifecycle ${id}`,
  link: `https://example.test/${id}`,
  summary: "Synthetic publisher text",
  content: `<p>${"Synthetic publisher text. ".repeat(30)}</p>`,
  createdAt: "2026-10-19T00:00:00Z",
  publishedAt: "2026-10-19T00:00:00Z",
}));
const user: UserProfile = {
  id: "synthetic",
  sub: "synthetic",
  name: "Synthetic",
  email: "synthetic@example.test",
  picture: null,
};
let strictMounts = 0;
function Fixture() {
  const [selected, setSelected] = useState(articles[0]);
  const [shown, setShown] = useState(true);
  const state = useReadState(user, []);
  const visible = useMemo(() => articles, []);
  const filter = useFilteredArticles({
    articles: visible,
    feedId: null,
    readIds: empty,
    bookmarkIds: empty,
    readingListIds: empty,
    globalFilter: null,
    setGlobalFilter: noop,
  });
  const tts = useSpeechSynthesis();
  useEffect(() => {
    strictMounts++;
  }, []);
  return (
    <TestReaderSettings>
      <ArticleFilterProvider value={{ ...filter, onSaveFilter: async () => {} }}>
        <ToastProvider
          value={{ info: noop, success: noop, error: noop, undo: noop, dismiss: noop, toasts: [] }}
        >
          <TtsAdapterProvider value={tts}>
            <button onClick={() => setSelected(articles[0])}>Select a</button>
            <button onClick={() => setSelected(articles[1])}>Select b</button>
            <button onClick={() => setShown(!shown)}>Toggle reader</button>
            {shown && (
              <ArticleView
                article={selected}
                isBookmarked={false}
                onToggleBookmark={noop}
                isInReadingList={false}
                onToggleReadingList={noop}
                isLiked={false}
                onToggleLike={noop}
                note={state.notes[selected.id]}
                onSetNote={state.setNote}
                onDeleteNote={state.deleteNote}
              />
            )}
            <output aria-label="K4 notes">{JSON.stringify(state.notes)}</output>
            <output aria-label="K4 pending">{String(state.hasPendingChanges)}</output>
          </TtsAdapterProvider>
        </ToastProvider>
      </ArticleFilterProvider>
    </TestReaderSettings>
  );
}
async function tick(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
function mount() {
  return render(
    <StrictMode>
      <Fixture />
    </StrictMode>,
  );
}
const editor = () => screen.getByRole("textbox", { name: "この記事へのメモ" });
function revealEditor() {
  const edit = screen.queryByRole("button", { name: "メモを追加" });
  if (edit) fireEvent.click(edit);
  return editor();
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  strictMounts = 0;
  saveJson(STORAGE_KEYS.NOTES, { a: "Original a", b: "Original b", unrelated: "Keep" });
  flushDeferredSaves();
  vi.mocked(fetchReadState).mockResolvedValue(null);
  vi.mocked(saveReadState).mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  flushDeferredSaves();
  vi.useRealTimers();
});

describe("K4 actual ArticleView lifecycle under StrictMode", () => {
  it.each(["Discarded draft", "", "日本語の未保存メモ"])(
    "Escape cancels %j without a sync write",
    async (draft) => {
      mount();
      await tick();
      expect(strictMounts).toBe(2);
      expect(screen.getByRole("heading", { name: "Lifecycle a" })).toBeInTheDocument();
      const textarea = editor();
      textarea.focus();
      fireEvent.change(textarea, { target: { value: draft } });
      fireEvent.keyDown(textarea, { key: "Escape" });
      await tick(6000);
      expect(editor()).toHaveValue("Original a");
      expect(screen.getByLabelText("K4 notes")).toHaveTextContent('"b":"Original b"');
      expect(screen.getByLabelText("K4 pending")).toHaveTextContent("false");
      expect(saveReadState).not.toHaveBeenCalled();
    },
  );
  it("blur followed by article changes saves only the outgoing note and preserves the next note", async () => {
    mount();
    await tick();
    const textarea = editor();
    textarea.focus();
    fireEvent.change(textarea, { target: { value: "Saved a" } });
    fireEvent.blur(textarea);
    fireEvent.click(screen.getByRole("button", { name: "Select b" }));
    expect(editor()).toHaveValue("Original b");
    await tick(6000);
    expect(saveReadState).toHaveBeenCalledTimes(1);
    expect(JSON.parse(vi.mocked(saveReadState).mock.calls[0][0]).notes).toEqual({
      a: "Saved a",
      b: "Original b",
      unrelated: "Keep",
    });
    fireEvent.click(screen.getByRole("button", { name: "Select a" }));
    expect(editor()).toHaveValue("Saved a");
  });
  it("repeated actual-reader unmount/remount retains saved notes and starts no extra POST", async () => {
    mount();
    await tick();
    const textarea = editor();
    textarea.focus();
    fireEvent.change(textarea, { target: { value: "Saved a" } });
    fireEvent.blur(textarea);
    await tick(6000);
    expect(saveReadState).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Toggle reader" }));
      expect(screen.queryByRole("heading", { name: "Lifecycle a" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Toggle reader" }));
      expect(revealEditor()).toHaveValue("Saved a");
    }
    await tick(6000);
    expect(saveReadState).toHaveBeenCalledTimes(1);
  });
  it("a delayed sync response after full unmount does not start a second save", async () => {
    let resolve!: (value: { ok: true }) => void;
    vi.mocked(saveReadState).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const view = mount();
    await tick();
    const textarea = editor();
    textarea.focus();
    fireEvent.change(textarea, { target: { value: "Saved late" } });
    fireEvent.blur(textarea);
    await tick(6000);
    expect(saveReadState).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => {
      resolve({ ok: true });
      await Promise.resolve();
    });
    await tick(6000);
    expect(saveReadState).toHaveBeenCalledTimes(1);
    mount();
    await tick();
    expect(editor()).toHaveValue("Saved late");
  });
});
