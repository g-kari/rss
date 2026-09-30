// Production reader chrome/cards/immersive dialog; deterministic local data, no account or AI.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import ThreePaneLayout from "../../src/components/ThreePaneLayout";
import { MobilePane } from "../../src/components/MobilePane";
import { VisualModeProvider } from "../../src/contexts/VisualModeContext";
import ImmersiveArticleMode from "../../src/components/ImmersiveArticleMode";
import Modal from "../../src/components/Modal";
import { CardArticleItem } from "../../src/components/article-items/CardItem";
import type { Article, Feed } from "../../src/types";
import type { MobilePane as Pane } from "../../src/hooks/useMobilePane";

const now = Date.now();
const articles: Article[] = Array.from({ length: 23 }, (_, index) => ({
  id: String(index),
  feedHash: "preview",
  guid: String(index),
  title: `${index + 1}. 光と色でめぐる、今日のインターネット`,
  link: `https://example.com/${index}`,
  ogImage: "https://rss-preview.test/image.svg",
  summary:
    "いつものニュースを少し違う角度から。好きなところで止めて、気になった言葉から深く読む。この記事の説明はフィードにある文章をそのまま表示しています。自動では次の記事へ進まず、未読の状態も変わりません。",
  publishedAt: new Date(now - index * 60000).toISOString(),
  createdAt: new Date(now).toISOString(),
}));
const feeds: Feed[] = [
  {
    id: "preview",
    title: "DESIGN & TECHNOLOGY",
    url: "https://example.com/feed",
    siteUrl: "https://example.com",
    lastFetchedAt: null,
    fetchError: null,
  },
];
const empty = new Set<string>();

function Preview() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [saved, setSaved] = useState(new Set<string>());
  const [selected, setSelected] = useState<Article | null>(null);
  const [pane, setPane] = useState<Pane>("list");
  const [dark, setDark] = useState(false);
  const [read, setRead] = useState(new Set<string>());
  const desktop = window.innerWidth >= 1024;
  const select = (article: Article) => {
    setSelected(article);
    setRead((old) => new Set([...old, article.id]));
    setPane("view");
  };
  const save = (id: string) =>
    setSaved((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <VisualModeProvider>
      <ThreePaneLayout sidebarWidth={220} listWidth={490} listFocusMode={false}>
        <MobilePane pane="sidebar" currentPane={pane} isDesktop={desktop}>
          <div className="flex h-full flex-col gap-5 bg-surface-elevated p-5 text-text-strong">
            <h1 className="text-lg font-bold">Your reading room</h1>
            <button className="min-h-11 text-left" onClick={() => setPane("list")}>
              記事一覧
            </button>
            <button className="min-h-11 text-left" onClick={() => setSettings(true)}>
              設定を開く
            </button>
            <button
              className="min-h-11 text-left"
              onClick={() => {
                setDark(!dark);
                document.documentElement.dataset.theme = dark ? "light" : "dark";
              }}
            >
              明暗を切り替え
            </button>
            <p>既読: {read.size}件</p>
          </div>
        </MobilePane>
        <MobilePane pane="list" currentPane={pane} isDesktop={desktop}>
          <div className="flex h-full flex-col">
            <header className="flex flex-wrap gap-3 border-b border-border-default p-3">
              <button className="min-h-11 lg:hidden" onClick={() => setPane("sidebar")}>
                フィードへ
              </button>
              <button
                className="min-h-11 rounded-full bg-ink px-4 text-ink-text"
                onClick={() => setOpen(true)}
              >
                ドパガキモードを開く
              </button>
              <button className="min-h-11" onClick={() => setSettings(true)}>
                設定
              </button>
            </header>
            <div data-testid="underlying-list" className="min-h-0 flex-1 overflow-y-auto p-4">
              <h2 className="mb-4 text-xl font-bold">今日、気になるもの。</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {articles.map((article, index) => (
                  <CardArticleItem
                    key={article.id}
                    article={article}
                    index={index}
                    hasNote={false}
                    query=""
                    isRead={read.has(article.id)}
                    isBookmarked={false}
                    isInReadingList={saved.has(article.id)}
                    thumb={article.ogImage}
                    feedName={feeds[0].title}
                    showFeedName
                    onSelectArticle={select}
                    onToggleRead={() => {}}
                    onToggleBookmark={() => {}}
                    onToggleReadingList={save}
                  />
                ))}
              </div>
            </div>
          </div>
        </MobilePane>
        <MobilePane pane="view" currentPane={pane} isDesktop={desktop}>
          <div className="h-full overflow-y-auto p-6">
            <button className="min-h-11 lg:hidden" onClick={() => setPane("list")}>
              一覧へ戻る
            </button>
            <p data-testid="selected">開いた記事: {selected?.id ?? "なし"}</p>
            <div className="article-content">
              <h2>{selected?.title ?? "読みたいものを、好きなペースで。"}</h2>
              <p>
                {selected?.summary ??
                  "左のカードから記事を開くか、ドパガキモードで見つけましょう。"}
              </p>
            </div>
          </div>
        </MobilePane>
        {settings && (
          <Modal title="表示設定のテスト" onClose={() => setSettings(false)}>
            <label className="block p-4">
              文字の大きさ
              <input aria-label="文字の大きさ" defaultValue="16" type="number" />
            </label>
          </Modal>
        )}
        {open && (
          <ImmersiveArticleMode
            candidates={articles}
            articles={articles}
            feeds={feeds}
            now={now}
            readIds={read}
            bookmarkIds={empty}
            likeIds={empty}
            historyIds={empty}
            readingListIds={saved}
            dismissedIds={empty}
            onClose={() => setOpen(false)}
            onSelectArticle={select}
            onToggleReadingList={save}
            onDismiss={() => {}}
            onRestore={() => {}}
          />
        )}
      </ThreePaneLayout>
    </VisualModeProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
