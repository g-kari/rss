// Actual production note panel, note/read-state/keyboard hooks; intercepted synthetic data only.
import { useState, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import ArticleDetailOverlay from "../../src/components/ArticleDetailOverlay";
import FocusModeOverlay from "../../src/components/FocusModeOverlay";
import type ArticleView from "../../src/components/ArticleView";
import NoteReader from "../helpers/article-note-reader";
import { useReadState } from "../../src/hooks/useReadState";
import { useKeyboardNav } from "../../src/hooks/useKeyboardNav";
import { makeKeyboardNavFixture } from "../helpers/keyboard-nav-fixture";
import type { Article, UserProfile } from "../../src/types";
const user: UserProfile = {
  id: "synthetic-user",
  sub: "synthetic-user",
  name: "Synthetic",
  email: "synthetic@example.test",
  picture: null,
};
const article: Article = {
  id: "synthetic-note",
  feedHash: "synthetic",
  title: "Synthetic note",
  guid: "note",
  link: "https://example.test/note",
  summary: "",
  publishedAt: "2026-10-04T00:00:00Z",
  createdAt: "2026-10-04T00:00:00Z",
};
function Fixture() {
  const [selected, setSelected] = useState(article);
  const [shortcuts, setShortcuts] = useState(0);
  const [mode, setMode] = useState<"pane" | "detail" | "focus">("pane");
  const state = useReadState(user, []);
  const note = state.notes[selected.id];
  const articleViewProps = {
    article: selected,
    note,
    onSetNote: state.setNote,
    onDeleteNote: state.deleteNote,
  } as ComponentProps<typeof ArticleView>;
  useKeyboardNav({
    ...makeKeyboardNavFixture(),
    selectedArticle: selected,
    toggleBookmark: () => setShortcuts((n) => n + 1),
  });
  return (
    <main style={{ maxWidth: 650, padding: 20, margin: "auto" }}>
      <h1>記事メモの動作確認</h1>
      <button onClick={() => setSelected(article)}>保存済みメモの記事</button>
      <button onClick={() => setSelected({ ...article, id: "new-note" })}>メモのない記事</button>
      <button onClick={() => setMode("detail")}>詳細で読む</button>
      <button onClick={() => setMode("focus")}>フォーカスで読む</button>
      {mode === "pane" && <NoteReader {...articleViewProps} />}
      <ArticleDetailOverlay
        open={mode === "detail"}
        onClose={() => setMode("pane")}
        articleViewProps={articleViewProps}
      />
      <FocusModeOverlay
        focusMode={mode === "focus"}
        exitFocusMode={() => setMode("pane")}
        articleViewProps={articleViewProps}
      />
      <output aria-label="保存済みメモ">{JSON.stringify(state.notes)}</output>
      <output aria-label="同期状態">{state.hasPendingChanges ? "同期待ち" : "同期済み"}</output>
      <output aria-label="ショートカット回数">{shortcuts}</output>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
