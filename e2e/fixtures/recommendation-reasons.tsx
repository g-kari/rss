import { useState } from "react";
import { createRoot } from "react-dom/client";
import ArticleRecommendations from "../../src/components/ArticleRecommendations";
import { makeArticle } from "../helpers/article";
import { makeFeed } from "../helpers/feed";

const now = new Date().toISOString();
const feeds = ["a", "b", "c", "d"].map((id) => makeFeed({ id, title: `Feed ${id}` }));
const articles = ["a", "b", "c", "d"].map((id) =>
  makeArticle({
    id,
    feedHash: id,
    title: id === "b" ? "Unityの新しい記事" : `合成記事 ${id}`,
    link: `https://example.com/${id}`,
    publishedAt: now,
    createdAt: now,
    categories: [id === "b" ? "Unity" : `Topic ${id}`],
  }),
);
const empty = new Set<string>();

function Fixture() {
  const [account, setAccount] = useState("one");
  const [scope, setScope] = useState("all");
  const [selects, setSelects] = useState(0);
  const [reads, setReads] = useState(0);
  const [saves, setSaves] = useState(0);
  const candidates =
    scope === "empty"
      ? []
      : scope === "without-unity"
        ? articles.filter((article) => article.id !== "b")
        : articles;
  return (
    <div className="mx-auto flex h-dvh w-full max-w-xl flex-col border border-border-default bg-surface-base text-text-default">
      <header className="flex flex-wrap gap-2 p-2 text-[12px]">
        <label>
          合成アカウント
          <select
            aria-label="合成アカウント"
            value={account}
            onChange={(event) => setAccount(event.target.value)}
          >
            <option>one</option>
            <option>two</option>
          </select>
        </label>
        <label>
          合成フィルター
          <select
            aria-label="合成フィルター"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
          >
            <option value="all">すべて</option>
            <option value="without-unity">Unity以外</option>
            <option value="empty">空</option>
          </select>
        </label>
        <p data-testid="mutations">
          選択{selects} 既読{reads} 保存{saves}
        </p>
      </header>
      <ArticleRecommendations
        userId={account}
        scopeKey={scope}
        candidates={candidates}
        articles={candidates}
        feeds={feeds}
        readIds={empty}
        bookmarkIds={empty}
        readingListIds={empty}
        likeIds={empty}
        historyIds={empty}
        summaryAccess={false}
        onSelectArticle={() => setSelects((value) => value + 1)}
        onMarkRead={() => setReads((value) => value + 1)}
        onToggleReadingList={() => setSaves((value) => value + 1)}
      />
      <p className="p-4 text-[13px]">既存の記事一覧領域</p>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
