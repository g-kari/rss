import { useState } from "react";
import { createRoot } from "react-dom/client";
import ArticleList from "../../src/components/ArticleList";
import { useFilteredArticles } from "../../src/hooks/useFilteredArticles";
import { ArticleFilterProvider } from "../../src/contexts/ArticleFilterContext";
import {
  ReaderSettingsProvider,
  type ReaderSettings,
} from "../../src/contexts/ReaderSettingsContext";
import { ToastProvider } from "../../src/contexts/ToastContext";
import { makeArticle } from "../helpers/article";
import { makeFeed } from "../helpers/feed";
import { STORAGE_KEYS } from "../../src/lib/storage";

const empty = new Set<string>();
const saved = new Set(["in-scope"]);
const noop = () => {};
const onSelectArticle = noop;
const feeds = [makeFeed({ id: "a" }), makeFeed({ id: "b" })];
const articles = [
  makeArticle({
    id: "in-scope",
    feedHash: "a",
    title: "条件に合う記事",
    link: "https://example.com/a",
  }),
  makeArticle({
    id: "retained",
    feedHash: "a",
    title: "保存されていない選択記事",
    link: "https://example.com/retained",
  }),
  makeArticle({
    id: "outside",
    feedHash: "b",
    title: "別のフィードの記事",
    link: "https://example.com/b",
  }),
];
// Only list-pane settings are needed; unrelated article/AI settings are not exercised.
const settings = {
  galleryColumns: 3,
  galleryColumnsFocus: "auto",
  galleryCardSize: "medium",
  galleryMinImagePx: 0,
  autoReadEnabled: false,
  galleryAutoScrollSpeed: "off",
  onChangeGalleryAutoScrollSpeed: noop,
} as unknown as ReaderSettings;

function Reader() {
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [feedId, setFeedId] = useState<string | null>("a");
  const filter = useFilteredArticles({
    articles,
    feeds,
    feedId,
    readIds: empty,
    bookmarkIds: saved,
    readingListIds: saved,
    globalFilter: null,
    setGlobalFilter: noop,
    selectedArticleId: "retained",
  });
  return (
    <ToastProvider
      value={{ info: noop, success: noop, error: noop, toasts: [], undo: noop, dismiss: noop }}
    >
      <ReaderSettingsProvider value={settings}>
        <ArticleFilterProvider value={{ ...filter, onSaveFilter: async () => {} }}>
          <div className="flex h-[85dvh] w-full max-w-xl flex-col border border-border-default">
            <div className="flex gap-3 text-sm p-2">
              <button onClick={() => setLoading((v) => !v)}>読み込み状態</button>
              <button onClick={() => setFetchError((v) => !v)}>エラー状態</button>
              <button onClick={() => setFeedId((v) => (v === "a" ? "b" : "a"))}>
                フィードを切り替える
              </button>
            </div>
            <ArticleList
              recommendationContext={{
                userId: "list-test",
                likeIds: empty,
                historyIds: empty,
                readBeforeTimestamp: null,
              }}
              feeds={feeds}
              readIds={empty}
              bookmarkIds={saved}
              readingListIds={saved}
              selectedArticleId="retained"
              selectedFeedId={feedId}
              layout="list"
              loading={loading}
              fetchError={fetchError}
              onChangeLayout={noop}
              onSelectArticle={onSelectArticle}
              onToggleRead={noop}
              onToggleBookmark={noop}
              onMarkRead={noop}
              listFocusMode={false}
              onToggleListFocusMode={noop}
            />
          </div>
        </ArticleFilterProvider>
      </ReaderSettingsProvider>
    </ToastProvider>
  );
}

localStorage.setItem(STORAGE_KEYS.BOOKMARK_ONLY, "1");
localStorage.setItem(STORAGE_KEYS.READING_LIST_ONLY, "1");
createRoot(document.getElementById("root")!).render(<Reader />);
