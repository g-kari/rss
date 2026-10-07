// Real acquisition hook and thumbnail rendering; all data and responses are synthetic.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ArticleThumbnail } from "../../src/components/article-items/shared";
import { useOgpCache } from "../../src/hooks/useOgpCache";
import { resolveThumbnailSources } from "../../src/lib/article-utils";
import { makeArticle } from "../helpers/article";

const initial = Array.from({ length: 14 }, (_, index) =>
  makeArticle({
    id: `article-${index}`,
    link: `https://articles.example.test/${index}`,
    title: `Synthetic article ${index}`,
    ogImage: index === 0 ? "https://images.example.test/feed.svg" : undefined,
  }),
);
// The old count:last-id sentinel sees these two lists as identical.
const changed = initial.map((article, index) =>
  index === 0 ? { ...article, link: "https://articles.example.test/replacement" } : article,
);

function Reader() {
  const [mode, setMode] = useState<"initial" | "changed" | "empty">("initial");
  const articles = mode === "initial" ? initial : mode === "changed" ? changed : [];
  const { ogpCache } = useOgpCache(articles);
  return (
    <>
      <nav aria-label="Synthetic list changes">
        <button onClick={() => setMode("changed")}>Replace first link</button>
        <button onClick={() => setMode("empty")}>Clear list</button>
        <button onClick={() => setMode("initial")}>Return to list</button>
      </nav>
      <output aria-label="Resolved thumbnails">{Object.keys(ogpCache).length}</output>
      <ul className="grid gap-2 sm:grid-cols-2">
        {articles.map((article) => {
          const sources = resolveThumbnailSources(article, ogpCache);
          return (
            <li key={article.id} data-testid={article.id}>
              <p>{article.title}</p>
              <ArticleThumbnail
                thumb={sources[0]}
                fallbacks={sources.slice(1)}
                className="w-24 h-16 object-cover"
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}

function App() {
  const [mounted, setMounted] = useState(true);
  return (
    <main className="p-4 max-w-4xl mx-auto">
      <h1>Thumbnail acquisition fixture</h1>
      <button onClick={() => setMounted(false)}>Unmount reader</button>
      {mounted && <Reader />}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
