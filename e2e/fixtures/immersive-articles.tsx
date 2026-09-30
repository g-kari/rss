// Production immersive UI with local data only; no login, AI, audio or external network.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import ImmersiveArticleMode from "../../src/components/ImmersiveArticleMode";
import type { Article, Feed } from "../../src/types";

const now = Date.now();
const articles: Article[] = Array.from({ length: 23 }, (_, index) => ({
  id: String(index),
  feedHash: "preview",
  guid: String(index),
  title: `記事 ${index + 1}：気になるニュースを、自分のペースで読む`,
  link: `https://example.com/${index}`,
  ogImage: "https://rss-preview.test/image.svg",
  summary:
    "大きな画像と、フィードにある説明で記事を選べます。スワイプしただけでは既読になりません。気になった記事は本文を開くか、後で読むに保存できます。",
  publishedAt: new Date(now - index * 60000).toISOString(),
  createdAt: new Date(now).toISOString(),
}));
const feeds: Feed[] = [
  {
    id: "preview",
    title: "Preview Feed",
    url: "https://example.com/feed",
    siteUrl: "https://example.com",
    lastFetchedAt: null,
    fetchError: null,
  },
];
const empty = new Set<string>();

function Preview() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(new Set<string>());
  const [dismissed, setDismissed] = useState(new Set<string>());
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <main className="bg-surface-base p-6 text-text-strong">
      <button className="min-h-11" onClick={() => setOpen(true)}>
        ドパガキモードを開く
      </button>
      <p>開いた記事: {selected ?? "なし"}</p>
      <div data-testid="underlying-list" className="h-40 overflow-y-auto">
        <div className="h-[1200px]">一覧のスクロール位置を保ちます</div>
      </div>
      {open && (
        <ImmersiveArticleMode
          candidates={articles}
          articles={articles}
          feeds={feeds}
          now={now}
          readIds={empty}
          bookmarkIds={empty}
          likeIds={empty}
          historyIds={empty}
          readingListIds={saved}
          dismissedIds={dismissed}
          onClose={() => setOpen(false)}
          onSelectArticle={(article) => setSelected(article.id)}
          onToggleReadingList={(id) =>
            setSaved((previous) => {
              const next = new Set(previous);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          onDismiss={(id) => setDismissed((previous) => new Set([...previous, id]))}
          onRestore={(id) =>
            setDismissed((previous) => {
              const next = new Set(previous);
              next.delete(id);
              return next;
            })
          }
        />
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
