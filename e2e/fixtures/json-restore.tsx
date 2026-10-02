// Production restore controls and dialog; only synthetic in-memory article state.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import JsonRestoreControls from "../../src/components/user-settings/JsonRestoreControls";
import Modal from "../../src/components/Modal";
import { ToastProvider } from "../../src/contexts/ToastContext";
import { VisualModeProvider } from "../../src/contexts/VisualModeContext";
import { useToastState } from "../../src/hooks/useToast";
import { makeArticle } from "../helpers/article";
import type { Collection } from "../../src/types";

declare global {
  interface Window {
    restoreActions: string[];
    registerRestoreBookmark: () => void;
    fillRestoreCollection: (count: number) => void;
    enlargeRestoreNotes: () => void;
  }
}
window.restoreActions = [];
const articles = [
  makeArticle({ id: "one", link: "https://example.test/one", title: "新しく復元する記事" }),
  makeArticle({ id: "two", link: "https://example.test/two", title: "既存メモのある記事" }),
  makeArticle({ id: "three", link: "https://example.test/three", title: "同じメモの記事" }),
];

function RestorePreview() {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({
    two: "現在のメモ",
    three: "同じメモ",
  });
  const [bookmarks, setBookmarks] = useState(new Set<string>());
  const [readingList, setReadingList] = useState(new Set<string>());
  const [collections, setCollections] = useState<Collection[]>([
    {
      id: "collection",
      name: "復元先コレクション",
      articleIds: ["three"],
      createdAt: "2026-01-01",
      order: 0,
    },
  ]);
  const toast = useToastState();
  window.registerRestoreBookmark = () => setBookmarks(new Set(["one"]));
  window.fillRestoreCollection = (count) =>
    setCollections((current) =>
      current.map((collection) => ({
        ...collection,
        articleIds: Array.from({ length: count }, (_, index) => `existing-${index}`),
      })),
    );
  window.enlargeRestoreNotes = () =>
    setNotes(
      Object.fromEntries(
        Array.from({ length: 263 }, (_, index) => [`existing-${index}`, "a".repeat(2000)]),
      ),
    );
  return (
    <ToastProvider value={toast}>
      <main className="min-h-dvh bg-surface-base p-4 text-text-strong">
        <button
          type="button"
          onClick={() => {
            setHidden(false);
            setOpen(true);
          }}
          className="min-h-[44px] rounded-lg border border-border-default px-3"
        >
          バックアップを開く
        </button>
        {open && (
          <Modal title="バックアップ・連携" onClose={() => setOpen(false)} width="sm:w-[600px]">
            <div className="flex flex-col gap-4 p-4">
              <button
                type="button"
                onClick={() => setHidden(!hidden)}
                className="min-h-[44px] self-start rounded-lg border border-border-default px-3"
              >
                {hidden ? "バックアップに戻る" : "別カテゴリへ"}
              </button>
              <div hidden={hidden} className="flex flex-col gap-4">
                <JsonRestoreControls
                  userId="restore-fixture"
                  hidden={hidden}
                  articles={articles}
                  notes={notes}
                  setNote={(id, note) => {
                    window.restoreActions.push(`note:${id}:${note}`);
                    setNotes((current) => ({ ...current, [id]: note }));
                  }}
                  bookmarkIds={bookmarks}
                  readingListIds={readingList}
                  toggleBookmark={(id) => {
                    window.restoreActions.push(`bookmark:${id}`);
                    setBookmarks((current) => new Set([...current, id]));
                  }}
                  toggleReadingList={(id) => {
                    window.restoreActions.push(`reading-list:${id}`);
                    setReadingList((current) => new Set([...current, id]));
                  }}
                  collections={collections}
                  addArticlesToCollection={async (id, ids) => {
                    window.restoreActions.push(`collection:${id}:${ids.join(",")}`);
                    setCollections((current) =>
                      current.map((collection) =>
                        collection.id === id
                          ? {
                              ...collection,
                              articleIds: [...new Set([...collection.articleIds, ...ids])],
                            }
                          : collection,
                      ),
                    );
                  }}
                />
              </div>
            </div>
          </Modal>
        )}
        <div aria-live="polite">
          {toast.toasts.map((item) => (
            <p key={item.id}>{item.message}</p>
          ))}
        </div>
      </main>
    </ToastProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <VisualModeProvider>
    <RestorePreview />
  </VisualModeProvider>,
);
