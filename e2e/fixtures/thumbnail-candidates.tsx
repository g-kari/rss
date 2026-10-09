// Production cache, props hook, and item renderers; article data is entirely synthetic.
import { createRoot } from "react-dom/client";
import { CardArticleItem } from "../../src/components/article-items/CardItem";
import { ListArticleItem } from "../../src/components/article-items/ListItem";
import { MagazineFeaturedArticleItem } from "../../src/components/article-items/MagazineItem";
import { useArticleListItemProps } from "../../src/hooks/useArticleListItemProps";
import { useOgpCache } from "../../src/hooks/useOgpCache";
import { STORAGE_KEYS } from "../../src/lib/storage";
import type { Feed } from "../../src/types";
import { makeArticle } from "../helpers/article";

const article = makeArticle({
  id: "thumbnail-candidate",
  title: "Existing feed thumbnail",
  link: "https://articles.example.test/thumbnail",
  ogImage: "https://images.example.test/feed.svg",
});
const articles = [article];
const feedMap = new Map<string, Feed>();
const emptyIds = new Set<string>();
const noop = () => {};
const renderer = new URLSearchParams(location.search).get("renderer") ?? "list";
const Renderer =
  renderer === "card"
    ? CardArticleItem
    : renderer === "magazine"
      ? MagazineFeaturedArticleItem
      : ListArticleItem;

localStorage.setItem(
  STORAGE_KEYS.OGP_CACHE,
  JSON.stringify({ [article.link!]: { image: "https://images.example.test/broken-ogp.png" } }),
);

function App() {
  const { ogpCache, cacheOgpEntry } = useOgpCache(articles);
  const { resolveItemProps } = useArticleListItemProps({
    articles,
    feedMap,
    readIds: emptyIds,
    readBeforeTimestamp: null,
    bookmarkIds: emptyIds,
    showFeedName: false,
    query: "",
    filteredCount: 1,
    ogpCache,
    onSelectArticle: noop,
    onToggleRead: noop,
    onToggleBookmark: noop,
    onContextMenu: noop,
  });
  return (
    <main className="p-4 max-w-xl mx-auto">
      <h1>Thumbnail candidate fixture: {renderer}</h1>
      <button
        onClick={() =>
          cacheOgpEntry(article.link!, { image: "https://images.example.test/late-ogp.png" })
        }
      >
        Publish late OGP cache entry
      </button>
      <output aria-label="Cached image">{ogpCache[article.link!]}</output>
      <section aria-label="Production article renderer" className="mt-4">
        <Renderer {...resolveItemProps(article, 0)} />
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
