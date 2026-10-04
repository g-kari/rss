// Substitute only the unrelated full-article body in real reader overlays.
// This subtree keeps production note editing and persistence callbacks intact.
import type { ComponentProps } from "react";
import type ArticleView from "../../src/components/ArticleView";
import ArticleNotePanel from "../../src/components/article-view/ArticleNotePanel";
import { useArticleNote } from "../../src/hooks/useArticleNote";
export default function NoteReader({
  article,
  note,
  onSetNote,
  onDeleteNote,
}: ComponentProps<typeof ArticleView>) {
  const edit = useArticleNote({ article, note, onSetNote, onDeleteNote });
  return (
    <>
      <button onClick={() => edit.setNoteExpanded(true)}>メモを編集</button>
      {(edit.noteExpanded || edit.noteText) && <ArticleNotePanel {...edit} note={note} />}
      <button>外へ移動</button>
    </>
  );
}
