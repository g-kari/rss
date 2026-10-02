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
import { SPECIAL_FEED_IDS, STORAGE_KEYS } from "../../src/lib/storage";

const empty = new Set<string>();
const noop = () => {};
const onSelectArticle = noop;
const feeds = [makeFeed({ id: "a" }), makeFeed({ id: "b" })];
const articles = [
  makeArticle({
    id: "in-scope",
    feedHash: "a",
    title: "条件に合う記事",
    link: "https://example.com/a",
    publishedAt: new Date().toISOString(),
  }),
  makeArticle({
    id: "second",
    feedHash: "a",
    title: "追加の対象記事",
    link: "https://example.com/second",
    publishedAt: "2026-01-01T00:00:00Z",
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
const digestArticles = Array.from({ length: 5 }, (_, index) =>
  makeArticle({
    id: `digest-${index}`,
    feedHash: "a",
    title: `ダイジェスト候補 ${index}`,
    link: `https://example.com/digest-${index}`,
    publishedAt: new Date(Date.now() - index * 60000).toISOString(),
  }),
);
const groupFeedIds = new Set(["a"]);
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
  const [shownIds, setShownIds] = useState(new Set<string>());
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [feedId, setFeedId] = useState<string | null>("a");
  const [candidateCount, setCandidateCount] = useState(1);
  const [scope, setScope] = useState("feed");
  const selectedFeedId =
    scope === "digest" ? SPECIAL_FEED_IDS.DIGEST : scope === "feed" ? feedId : null;
  const selectedGroupId = scope === "group" || scope === "empty-group" ? scope : null;
  const selectedArticleId = scope === "digest" ? "digest-0" : "retained";
  const saved = new Set(["in-scope", "second"].slice(0, candidateCount));
  const filter = useFilteredArticles({
    articles: scope === "digest" ? digestArticles : articles,
    feeds,
    feedId: selectedFeedId,
    selectedGroupId,
    groupFeedIds: scope === "group" ? groupFeedIds : scope === "empty-group" ? empty : undefined,
    readIds: empty,
    bookmarkIds: saved,
    readingListIds: saved,
    globalFilter: null,
    setGlobalFilter: noop,
    selectedArticleId,
  });
  return (
    <ToastProvider
      value={{ info: noop, success: noop, error: noop, toasts: [], undo: noop, dismiss: noop }}
    >
      <ReaderSettingsProvider value={settings}>
        <ArticleFilterProvider value={{ ...filter, onSaveFilter: async () => {} }}>
          <div className="flex h-[85dvh] w-full max-w-xl flex-col border border-border-default">
            <div className="flex flex-wrap gap-3 text-sm p-2">
              <button onClick={() => setLoading((v) => !v)}>読み込み状態</button>
              <button onClick={() => setFetchError((v) => !v)}>エラー状態</button>
              <button onClick={() => setFeedId((v) => (v === "a" ? "b" : "a"))}>
                フィードを切り替える
              </button>
              <label>
                合成候補数
                <select
                  aria-label="合成候補数"
                  value={candidateCount}
                  onChange={(event) => setCandidateCount(Number(event.target.value))}
                >
                  <option value={0}>0</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </select>
              </label>
              <label>
                合成スコープ
                <select
                  aria-label="合成スコープ"
                  value={scope}
                  onChange={(event) => setScope(event.target.value)}
                >
                  <option value="feed">個別フィード</option>
                  <option value="group">グループ</option>
                  <option value="empty-group">空のグループ</option>
                  <option value="digest">専用ダイジェスト</option>
                </select>
              </label>
            </div>
            <p data-testid="shown-ids">{JSON.stringify([...shownIds])}</p>
            <ArticleList
              recommendationContext={{
                scopeKey: selectedGroupId ?? undefined,
                userId: "list-test",
                likeIds: empty,
                historyIds: empty,
                readBeforeTimestamp: null,
              }}
              feeds={feeds}
              readIds={empty}
              bookmarkIds={saved}
              readingListIds={saved}
              selectedArticleId={selectedArticleId}
              selectedFeedId={selectedFeedId}
              layout="list"
              loading={loading}
              fetchError={fetchError}
              onChangeLayout={noop}
              onSelectArticle={onSelectArticle}
              onToggleRead={noop}
              onToggleBookmark={noop}
              onMarkRead={(id) =>
                setShownIds((previous) =>
                  previous.has(id) ? previous : new Set([...previous, id]),
                )
              }
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
