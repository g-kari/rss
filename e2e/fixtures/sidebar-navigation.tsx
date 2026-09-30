// Browser component fixture. Real components/styles, deterministic local-only data.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import SidebarFooter from "../../src/components/feed-sidebar/SidebarFooter";
import SidebarHeader from "../../src/components/feed-sidebar/SidebarHeader";
import FeedSearchBar from "../../src/components/feed-sidebar/FeedSearchBar";
import FeedViewTabs from "../../src/components/feed-sidebar/FeedViewTabs";
import SpecialViewButton from "../../src/components/feed-sidebar/SpecialViewButton";
import { ListArticleItem } from "../../src/components/article-items/ListItem";
import { SelectedArticleCtx } from "../../src/contexts/SelectedArticleContext";
import { ToastProvider } from "../../src/contexts/ToastContext";
import Modal from "../../src/components/Modal";
import type { Article, FeedView } from "../../src/types";

const articles: Article[] = [
  {
    id: "one",
    feedHash: "fixture",
    guid: "one",
    title: "読みたい記事を、迷わず見つける",
    summary: "サイドバーの主要な操作と、現在読んでいる記事がひと目でわかります。",
    link: "https://example.test/one",
    publishedAt: "2026-09-29T10:00:00Z",
    createdAt: "2026-09-29T10:00:00Z",
  },
  {
    id: "two",
    feedHash: "fixture",
    guid: "two",
    title: "未読の記事と現在地を区別する",
    summary: "未読のドットと太字を保ったまま、選択中の行をアクセントカラーと側線で示します。",
    link: "https://example.test/two",
    publishedAt: "2026-09-29T09:00:00Z",
    createdAt: "2026-09-29T09:00:00Z",
  },
];

function Preview() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [view, setView] = useState<FeedView>("articles");
  const [selectedFeed, setSelectedFeed] = useState("all");
  const [selectedArticle, setSelectedArticle] = useState("one");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState("");
  const [message, setMessage] = useState("");
  const [pushLoading, setPushLoading] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const action = () => setMessage("操作を実行しました");
  return (
    <ToastProvider
      value={{
        toasts: [],
        success: setMessage,
        error: setMessage,
        info: setMessage,
        undo: action,
        dismiss: action,
      }}
    >
      <main className="preview-grid">
        <section
          className="h-full flex flex-col min-h-0 overflow-hidden border-r border-border-default bg-surface-elevated"
          aria-label="フィードサイドバー"
        >
          <SidebarHeader
            nsfwMode={false}
            inputOpen={false}
            refreshing={false}
            isOnline
            onActivateNsfw={action}
            onDeactivateNsfw={action}
            onToggleInput={() => setDialog("フィードを追加")}
            onRefresh={action}
          />
          <FeedSearchBar value={query} onChange={setQuery} />
          <FeedViewTabs activeView={view} onChangeView={setView} />
          <div className="flex-1 min-h-0 overflow-y-auto py-2">
            {[
              { id: "all", label: "すべて", count: 12 },
              { id: "later", label: "後で読む", count: 3 },
              { id: "bookmarks", label: "ブックマーク", count: 5 },
            ]
              .filter((item) => item.label.includes(query))
              .map((item) => (
                <SpecialViewButton
                  key={item.id}
                  {...item}
                  selectedFeedId={selectedFeed}
                  onSelectFeed={setSelectedFeed}
                />
              ))}
            <p className="px-4 py-3 text-[10px] text-text-muted">フィード</p>
            {["デザインと技術", "開発者ニュース"]
              .filter((name) => name.includes(query))
              .map((name) => (
                <SpecialViewButton
                  key={name}
                  id={name}
                  label={name}
                  count={4}
                  selectedFeedId={selectedFeed}
                  onSelectFeed={setSelectedFeed}
                />
              ))}
          </div>
          <SidebarFooter
            user={{
              id: "preview",
              sub: "preview",
              name: "Reader",
              email: "reader@example.test",
              picture: null,
            }}
            theme={theme}
            importing={false}
            readTodayCount={3}
            weeklyGoal={20}
            onImport={action}
            onShowReleaseNotes={() => setDialog("リリースノート")}
            onShowStats={() => setDialog("読書統計")}
            onExportOpml={action}
            onExportMarkdown={action}
            onExportJson={action}
            onExportNotes={action}
            onExportNotesJson={action}
            onExportReadwise={action}
            onExportCollectionMarkdown={action}
            onExportCollectionJson={action}
            selectedCollectionName="デザイン"
            noteCount={2}
            install={{ canInstall: true, onInstall: action }}
            push={{
              supported: true,
              subscribed: true,
              loading: pushLoading,
              error: pushError,
              onToggle: () => {
                setPushLoading(true);
                setTimeout(() => {
                  setPushLoading(false);
                  setPushError("通知の許可が必要です");
                }, 200);
              },
              onSendTest: async () => "テスト通知を送信しました",
            }}
            onShowFeedHealth={() => setDialog("フィードヘルス")}
            onOpenSettings={() => setDialog("ユーザー設定")}
            onOpenHelp={() => setDialog("キーボードショートカット")}
            onToggleTheme={() => setTheme((old) => (old === "light" ? "dark" : "light"))}
            onLogout={action}
          />
        </section>
        <section className="preview-articles bg-surface-base" aria-label="記事一覧">
          <h1 className="px-4 py-5 text-[13px] text-text-strong">今日の記事</h1>
          <SelectedArticleCtx value={selectedArticle}>
            {articles.map((article, index) => (
              <ListArticleItem
                key={article.id}
                article={article}
                index={index}
                isRead={index === 0}
                isBookmarked={false}
                hasNote={false}
                feedName="デザインと技術"
                thumb={undefined}
                showFeedName
                query=""
                onSelectArticle={(item) => setSelectedArticle(item.id)}
                onToggleRead={action}
                onToggleBookmark={action}
              />
            ))}
          </SelectedArticleCtx>
          <p role="status" className="px-4 py-4 text-[12px] text-text-muted">
            {message}
          </p>
        </section>
      </main>
      {dialog && (
        <Modal title={dialog} onClose={() => setDialog("")}>
          <p className="p-4 text-[13px] text-text-default">
            メニューからの導線とフォーカス復帰を確認するためのプレビューです
          </p>
        </Modal>
      )}
    </ToastProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
