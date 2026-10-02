// Real reader, immersive mode and existing setting sections; synthetic data only.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import ArticleView from "../../src/components/ArticleView";
import ArticleDetailOverlay from "../../src/components/ArticleDetailOverlay";
import ImmersiveArticleMode from "../../src/components/ImmersiveArticleMode";
import FontSection from "../../src/components/user-settings/FontSection";
import LayoutSection from "../../src/components/user-settings/LayoutSection";
import { TestReaderSettings } from "../helpers/reader-settings";
import { useReaderSettings } from "../../src/contexts/ReaderSettingsContext";
import { VisualModeProvider } from "../../src/contexts/VisualModeContext";
import { ArticleFilterProvider } from "../../src/contexts/ArticleFilterContext";
import { ToastProvider } from "../../src/contexts/ToastContext";
import { TtsAdapterProvider } from "../../src/contexts/TtsAdapterContext";
import { useSpeechSynthesis } from "../../src/hooks/useSpeechSynthesis";
import { useFilteredArticles } from "../../src/hooks/useFilteredArticles";
import { contentLruCache } from "../../src/lib/lru-cache";
import { makeArticle } from "../helpers/article";
import { makeFeed } from "../helpers/feed";

const empty = new Set<string>();
const noop = () => {};
const articles = [0, 1].map((id) =>
  makeArticle({
    id: `quick-${id}`,
    title: `読書設定テスト ${id}`,
    feedHash: "quick-feed",
    link: `https://example.com/reading/${id}`,
    ogImage: "https://rss-preview.test/image.svg",
    content: Array.from(
      { length: 60 },
      (_, i) =>
        `<p>段落 ${i}。文字の大きさ・フォント・行間・幅を変えても本文は開いたままです。</p>`,
    ).join(""),
  }),
);
for (const article of articles) contentLruCache.set(article.id, article.content!);
const feeds = [makeFeed({ id: "quick-feed", title: "読むテスト" })];
declare global {
  interface Window {
    quickActions: string[];
    retainedBody?: Element;
  }
}
window.quickActions = [];
const record = (action: string) => () => window.quickActions.push(action);

function Reader() {
  const settings = useReaderSettings();
  const [selected, select] = useState(articles[0]);
  const [mode, setMode] = useState<"reader" | "immersive" | "overlay">("reader");
  const [allSettings, setAllSettings] = useState(false);
  const tts = useSpeechSynthesis();
  const filter = useFilteredArticles({
    articles,
    feeds,
    feedId: null,
    readIds: empty,
    bookmarkIds: empty,
    readingListIds: empty,
    globalFilter: null,
    setGlobalFilter: noop,
  });
  const articleViewProps = {
    article: selected,
    feeds,
    isBookmarked: false,
    isInReadingList: false,
    isLiked: false,
    onToggleBookmark: record("bookmark"),
    onToggleReadingList: record("save"),
    onToggleLike: record("like"),
    onAutoMarkRead: record("read"),
    onSetNote: record("note"),
    currentMobilePane: "view" as const,
    onEngagement: record("engagement"),
    onSelectNext: record("next"),
    onSelectPrev: record("prev"),
    onGoBack: record("back"),
  };
  return (
    <TtsAdapterProvider value={tts}>
      <ToastProvider
        value={{ info: noop, success: noop, error: noop, undo: noop, dismiss: noop, toasts: [] }}
      >
        <ArticleFilterProvider value={{ ...filter, onSaveFilter: async () => {} }}>
          <main className="h-dvh bg-surface-base text-text-strong">
            <div className="flex flex-wrap gap-2 p-2 text-[14px]" style={{ height: 100 }}>
              <button
                onClick={() => {
                  select((old) => articles[old.id === articles[0].id ? 1 : 0]);
                }}
              >
                次のテスト記事
              </button>
              <button onClick={() => setMode("immersive")}>モードを開く</button>
              <button onClick={() => setMode("overlay")}>オーバーレイを開く</button>
              <button onClick={() => setAllSettings((old) => !old)}>既存の表示設定</button>
              <p data-testid="outside-settings">設定の外側</p>
            </div>
            {allSettings && (
              <section aria-label="既存の表示設定" className="space-y-3 p-3">
                <FontSection {...settings} />
                <LayoutSection {...settings} />
              </section>
            )}
            <div style={{ height: "calc(100dvh - 100px)" }}>
              <ArticleView {...articleViewProps} />
            </div>
            <ArticleDetailOverlay
              open={mode === "overlay"}
              onClose={() => setMode("reader")}
              articleViewProps={articleViewProps}
            />
            {mode === "immersive" && (
              <ImmersiveArticleMode
                candidates={articles}
                articles={articles}
                feeds={feeds}
                session={{
                  remaining: articles.map((article) => ({
                    article,
                    feedTitle: feeds[0].title,
                    reasons: ["fixture"],
                  })),
                  served: [],
                  paused: true,
                  speed: 1,
                }}
                readIds={empty}
                bookmarkIds={empty}
                readingListIds={empty}
                likeIds={empty}
                historyIds={empty}
                dismissedIds={empty}
                now={Date.now()}
                onClose={() => setMode("reader")}
                onSelectArticle={record("select")}
                onToggleReadingList={record("save")}
                onDismiss={record("dismiss")}
                onRestore={record("restore")}
              />
            )}
          </main>
        </ArticleFilterProvider>
      </ToastProvider>
    </TtsAdapterProvider>
  );
}
createRoot(document.getElementById("root")!).render(
  <VisualModeProvider>
    <TestReaderSettings>
      <Reader />
    </TestReaderSettings>
  </VisualModeProvider>,
);
