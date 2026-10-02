// Production immersive UI with local data only; no login, AI, audio or external network.
import { VisualModeProvider } from "../../src/contexts/VisualModeContext";
import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import ImmersiveArticleMode, {
  type ImmersiveSessionSnapshot,
} from "../../src/components/ImmersiveArticleMode";
import type { Article, Feed } from "../../src/types";

const now = Date.now();
const fixtureCase = new URLSearchParams(location.search).get("case");
const nativeVideo = fixtureCase === "native-video";
const allArticles: Article[] = Array.from({ length: 23 }, (_, index) => ({
  id: String(index),
  feedHash: "preview",
  guid: String(index),
  title: `記事 ${index + 1}：気になるニュースを、自分のペースで読む`,
  link: `https://example.com/${index}`,
  ogImage: "https://rss-preview.test/image.svg",
  content:
    index === 0
      ? nativeVideo
        ? '<video src="https://rss-preview.test/movie.mp4"></video>'
        : '<p>読み込み済みの本文画像</p><img src="/api/image-proxy?url=%ZZ.jpg"><a href="/api/image-proxy?url=%ZZ.jpg">無効な画像候補</a><img src="https://rss-preview.test/body.svg" width="800" height="450">'
      : undefined,
  summary:
    "大きな画像と、フィードにある説明で記事を選べます。実際に表示した記事だけを既読にします。気になった記事は本文を開くか、後で読むに保存できます。",
  publishedAt: new Date(now - index * 60000).toISOString(),
  createdAt: new Date(now).toISOString(),
}));
const thumbnailArticles: Article[] = [
  { ogImage: undefined, content: '<img src="https://rss-preview.test/missing-og-body.svg">' },
  {
    ogImage: "https://rss-preview.test/broken-og-body.svg",
    content: '<img src="https://rss-preview.test/broken-og-good-body.svg">',
  },
  { ogImage: undefined, link: "https://www.youtube.com/watch?v=missingog01", content: undefined },
  {
    ogImage: "https://rss-preview.test/broken-og-youtube.svg",
    link: "https://www.youtube.com/watch?v=brokenog001",
    content: undefined,
  },
  {
    ogImage: "https://rss-preview.test/broken-og-placeholder.svg",
    content: '<img src="https://rss-preview.test/broken-body-placeholder.svg">',
  },
  { ogImage: undefined, content: undefined },
].map((overrides, index) => ({ ...allArticles[index], ...overrides }));
const articles = fixtureCase === "thumbnails" ? thumbnailArticles : allArticles;
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
  const [session, setSession] = useState<ImmersiveSessionSnapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(new Set<string>());
  const [dismissed, setDismissed] = useState(new Set<string>());
  const [selected, setSelected] = useState<string | null>(null);
  const [read, setRead] = useState(new Set<string>());
  const [readEvents, setReadEvents] = useState<string[]>([]);
  const [articleCount, setArticleCount] = useState(
    fixtureCase === "empty" ? 0 : fixtureCase === "dynamic" ? 2 : articles.length,
  );
  const available = articles.slice(0, articleCount);
  const markRead = useCallback((id: string) => {
    setRead((previous) => new Set([...previous, id]));
    setReadEvents((previous) => [...previous, id]);
  }, []);
  useEffect(() => {
    const fixture = window as typeof window & {
      immersiveFixture?: { setArticleCount: (count: number) => void };
    };
    fixture.immersiveFixture = { setArticleCount };
    return () => {
      delete fixture.immersiveFixture;
    };
  }, []);
  return (
    <main className="bg-surface-base p-6 text-text-strong">
      <button className="min-h-11" onClick={() => setOpen(true)}>
        ドパガキモードを開く
      </button>
      <p>開いた記事: {selected ?? "なし"}</p>
      <p data-testid="read-ids">{JSON.stringify([...read])}</p>
      <p data-testid="read-events">{JSON.stringify(readEvents)}</p>
      <p data-testid="session-remaining-ids">
        {JSON.stringify(session?.remaining.map(({ article }) => article.id) ?? [])}
      </p>
      <p data-testid="session-served-ids">
        {JSON.stringify(session?.served.map((article) => article.id) ?? [])}
      </p>
      <div data-testid="underlying-list" className="h-40 overflow-y-auto">
        <div className="h-[1200px]">一覧のスクロール位置を保ちます</div>
      </div>
      {open && (
        <ImmersiveArticleMode
          session={session}
          onSessionChange={setSession}
          candidates={available}
          articles={available}
          feeds={feeds}
          now={now}
          readIds={read}
          bookmarkIds={empty}
          likeIds={empty}
          historyIds={empty}
          readingListIds={saved}
          dismissedIds={dismissed}
          onClose={() => setOpen(false)}
          onSelectArticle={(article) => setSelected(article.id)}
          onMarkRead={markRead}
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
createRoot(document.getElementById("root")!).render(
  <VisualModeProvider>
    <Preview />
  </VisualModeProvider>,
);
