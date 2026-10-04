// Actual production save/dialog/read-state/keyboard hooks, synthetic intercepted data only.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import SaveUrlModal from "../../src/components/SaveUrlModal";
import { useSaveUrlDialog } from "../../src/hooks/useSaveUrlDialog";
import { useSaveArticleUrl } from "../../src/hooks/useSaveArticleUrl";
import { useApiErrorToast } from "../../src/hooks/useApiErrorToast";
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
function Fixture() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  useApiErrorToast({ error: (message) => setErrorMessages((current) => [...current, message]) });
  const state = useReadState(user, articles);
  useKeyboardNav(makeKeyboardNavFixture());
  const save = useSaveArticleUrl({
    prependArticle: (article) =>
      setArticles((current) => [article, ...current.filter((item) => item.id !== article.id)]),
    addBookmark: state.addBookmark,
    addReadingList: state.addReadingList,
    toast: { success: (message) => setMessages((current) => [...current, message]) },
  });
  const dialog = useSaveUrlDialog(save);
  return (
    <>
      <button onClick={dialog.open}>URL を保存</button>
      <button onClick={() => state.toggleBookmark("synthetic-saved")}>通常ブックマーク切替</button>
      <button onClick={() => state.toggleReadingList("synthetic-saved")}>通常後で読む切替</button>
      <output aria-label="ブックマーク状態">
        {String(state.bookmarkIds.has("synthetic-saved"))}
      </output>
      <output aria-label="後で読む状態">
        {String(state.readingListIds.has("synthetic-saved"))}
      </output>
      <output aria-label="同期状態">{state.hasPendingChanges ? "同期待ち" : "同期済み"}</output>
      <output aria-label="グローバルエラー通知数">{errorMessages.length}</output>
      <output aria-label="成功通知数">{messages.length}</output>
      <output aria-label="成功通知">{messages.join(" / ")}</output>
      <output aria-label="記事数">{articles.length}</output>
      <main aria-label="記事本文" style={{ height: 200, overflow: "auto" }}>
        <div style={{ height: 1500 }}>Synthetic reader</div>
      </main>
      {dialog.isOpen && (
        <SaveUrlModal
          url={dialog.url}
          onUrlChange={dialog.onUrlChange}
          saving={dialog.saving}
          error={dialog.error}
          onSave={(mode) => void dialog.onSave(mode)}
          onClose={dialog.close}
        />
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
