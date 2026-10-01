// Real production reader/list and virtualization. Local articles only; no account, AI or write API.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import ArticleList from "../../src/components/ArticleList";
import ArticleView from "../../src/components/ArticleView";
import ThreePaneLayout from "../../src/components/ThreePaneLayout";
import { MobilePane } from "../../src/components/MobilePane";
import Modal from "../../src/components/Modal";
import { VisualModeProvider } from "../../src/contexts/VisualModeContext";
import { ArticleFilterProvider } from "../../src/contexts/ArticleFilterContext";
import {
  ReaderSettingsProvider,
  type ReaderSettings,
} from "../../src/contexts/ReaderSettingsContext";
import { ToastProvider } from "../../src/contexts/ToastContext";
import { TtsAdapterProvider } from "../../src/contexts/TtsAdapterContext";
import { useSpeechSynthesis } from "../../src/hooks/useSpeechSynthesis";
import { useFilteredArticles } from "../../src/hooks/useFilteredArticles";
import type { Article, Layout } from "../../src/types";
import type { MobilePane as Pane } from "../../src/hooks/useMobilePane";
import { makeArticle } from "../helpers/article";
import { makeFeed } from "../helpers/feed";
import { READER_MOTION_IMAGE_URL } from "../helpers/reader-motion-request";

declare global {
  interface Window {
    readerMotionEvents: string[];
    retainedArticle?: Element;
  }
}

const empty = new Set<string>();
const noop = () => {};
const feeds = [makeFeed({ id: "a", title: "DESIGN" }), makeFeed({ id: "b", title: "TECHNOLOGY" })];
const articles = Array.from({ length: 140 }, (_, i) =>
  makeArticle({
    id: String(i),
    feedHash: i < 100 ? "a" : "b",
    title: `Article ${i} 余白と色をつなぐ読書`,
    link: `https://example.com/article/${i}`,
    content: Array.from(
      { length: 40 },
      (_, p) => `<p>Paragraph ${p} 記事の本文とメモは表示モードを変えてもそのまま保たれます。</p>`,
    ).join(""),
    ogImage: READER_MOTION_IMAGE_URL,
    publishedAt: new Date(Date.now() - i * 60000).toISOString(),
  }),
);
const settings = {
  fontSize: "medium",
  fontFamily: "sans",
  theme: "light",
  contentWidth: "medium",
  lineHeight: "normal",
  autoReadEnabled: false,
  autoReadThreshold: 90,
  autoTranslate: false,
  autoSummarize: false,
  autoAiBrowserOnly: false,
  aiProvider: "workers",
  aiModel: "@cf/meta/llama-3.1-8b-instruct",
  aiUserId: null,
  imageDlFolder: "",
  imageDlFolderNsfw: "",
  galleryColumns: 3,
  galleryColumnsFocus: "auto",
  galleryCardSize: "medium",
  galleryMinImagePx: 0,
  galleryAutoScrollSpeed: "off",
  onChangeGalleryAutoScrollSpeed: noop,
  onChangeFontSize: noop,
  onChangeFontFamily: noop,
  onChangeLineHeight: noop,
  onChangeContentWidth: noop,
  toggleFocusMode: noop,
} as unknown as ReaderSettings;

function Reader() {
  const [feed, setFeed] = useState("a");
  const [layout, setLayout] = useState<Layout>("card");
  const [selected, setSelected] = useState<Article>(articles[0]);
  const [pane, setPane] = useState<Pane>("list");
  const [focus, setFocus] = useState(false);
  const [width, setWidth] = useState(420);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const tts = useSpeechSynthesis();
  const filter = useFilteredArticles({
    articles,
    feeds,
    feedId: feed,
    readIds: empty,
    bookmarkIds: empty,
    readingListIds: empty,
    globalFilter: null,
    setGlobalFilter: noop,
    selectedArticleId: selected.id,
    pageSize: 500,
  });
  const select = (article: Article) => {
    setSelected(article);
    setPane("view");
  };
  const next = () => {
    setSelected((old) => articles[(Number(old.id) + 1) % articles.length]);
    setPane("view");
  };
  return (
    <VisualModeProvider>
      <TtsAdapterProvider value={tts}>
        <ToastProvider
          value={{ info: noop, success: noop, error: noop, undo: noop, dismiss: noop, toasts: [] }}
        >
          <ReaderSettingsProvider value={settings}>
            <ArticleFilterProvider value={{ ...filter, onSaveFilter: async () => {} }}>
              <div className="fixture-controls" aria-label="Local test controls">
                <button
                  onClick={() => {
                    setFeed((old) => (old === "a" ? "b" : "a"));
                    setPane("list");
                  }}
                >
                  Change feed
                </button>
                <button onClick={next}>Next article</button>
                <button onClick={() => setPane("list")}>Show list</button>
                <button onClick={() => setSettingsOpen(true)}>Open settings</button>
                <button onClick={() => setWidth((old) => (old === 420 ? 460 : 420))}>
                  Resize columns
                </button>
                <button
                  onClick={() => {
                    document.documentElement.dataset.theme =
                      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
                  }}
                >
                  Theme
                </button>
                <select
                  aria-label="Test layout"
                  value={layout}
                  onChange={(e) => setLayout(e.target.value as Layout)}
                >
                  {["compact", "list", "card", "magazine", "gallery"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <span data-testid="selected">Selected {selected.id}</span>
              </div>
              <ThreePaneLayout sidebarWidth={220} listWidth={width} listFocusMode={focus}>
                <MobilePane pane="sidebar" currentPane={pane} isDesktop={innerWidth >= 1024}>
                  <div className="p-4">
                    <h2>Your reading room</h2>
                    <p>DESIGN & TECHNOLOGY</p>
                  </div>
                </MobilePane>
                <MobilePane pane="list" currentPane={pane} isDesktop={innerWidth >= 1024}>
                  <ArticleList
                    feeds={feeds}
                    readIds={empty}
                    bookmarkIds={empty}
                    readingListIds={empty}
                    selectedArticleId={selected.id}
                    selectedFeedId={feed}
                    layout={layout}
                    onChangeLayout={setLayout}
                    onSelectArticle={select}
                    onToggleRead={noop}
                    onToggleBookmark={noop}
                    onMarkRead={noop}
                    listFocusMode={focus}
                    onToggleListFocusMode={() => setFocus((old) => !old)}
                  />
                </MobilePane>
                <MobilePane pane="view" currentPane={pane} isDesktop={innerWidth >= 1024}>
                  <ArticleView
                    article={selected}
                    isBookmarked={false}
                    isInReadingList={false}
                    isLiked={false}
                    onToggleBookmark={noop}
                    onToggleReadingList={noop}
                    onToggleLike={noop}
                    feeds={feeds}
                    onSetNote={noop}
                    note="Saved note"
                    currentMobilePane={pane}
                  />
                </MobilePane>
                {settingsOpen && (
                  <Modal title="Reader settings" onClose={() => setSettingsOpen(false)}>
                    <label className="block p-4">
                      Text size <input aria-label="Text size" defaultValue="16" />
                    </label>
                  </Modal>
                )}
              </ThreePaneLayout>
            </ArticleFilterProvider>
          </ReaderSettingsProvider>
        </ToastProvider>
      </TtsAdapterProvider>
    </VisualModeProvider>
  );
}
const evidence = window as Window & { readerMotionEvents: string[] };
evidence.readerMotionEvents = [];
new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    const element = mutation.target as HTMLElement;
    if (element.dataset.readerAnimating === "true")
      evidence.readerMotionEvents.push(
        element.dataset.readerArrival ?? element.getAttribute("aria-labelledby") ?? "unknown",
      );
  }
}).observe(document.getElementById("root")!, {
  subtree: true,
  attributes: true,
  attributeFilter: ["data-reader-animating"],
});
createRoot(document.getElementById("root")!).render(<Reader />);
