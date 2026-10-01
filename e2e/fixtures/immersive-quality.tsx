// Actual immersive components, synthetic feed/body variants, no account or read-state writes.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { VisualModeProvider } from "../../src/contexts/VisualModeContext";
import ImmersiveArticleMode from "../../src/components/ImmersiveArticleMode";
import { makeArticle } from "../helpers/article";
import { contentLruCache } from "../../src/lib/lru-cache";
import { getProviderContentCacheId } from "../../src/lib/slide-providers";

const scenario = new URLSearchParams(location.search).get("case");
const sentence =
  "日本コロムビアは1日、YouTubeチャンネル登録者数11.5万人を超えたクリエイターの新しい活動について発表しました。";
const paragraphs = Array.from(
  { length: 9 },
  (_, index) => `<p>${index + 1}段落目。${sentence}</p>`,
).join("");
const article = makeArticle({
  id: "quality-fixture",
  feedHash: "quality",
  title: "大きな画像と説明を文の終わりまで読む",
  link: "https://publisher.test/article",
  ogImage: "https://publisher.test/cover-300x168.webp",
  summary: "フィードにある短い説明です。",
  content:
    scenario === "failure"
      ? paragraphs
      : `${paragraphs}<img src="https://publisher.test/cover-300x168.webp" srcset="https://publisher.test/cover-1600x900.webp 1600w, https://publisher.test/cover-768x432.webp 768w, https://publisher.test/cover-300x168.webp 300w" width="300" height="168">`,
});
if (scenario === "cached")
  contentLruCache.set(
    getProviderContentCacheId(article.id, article.link),
    "<p>すでに取得した記事本文です。</p>",
  );
const empty = new Set<string>();
function Fixture() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>ドパガキモードを開く</button>
      {open && (
        <ImmersiveArticleMode
          candidates={[article]}
          articles={[article]}
          feeds={[
            {
              id: "quality",
              title: "品質テスト",
              url: "https://publisher.test/feed",
              siteUrl: "https://publisher.test",
              lastFetchedAt: null,
              fetchError: null,
            },
          ]}
          now={Date.now()}
          readIds={empty}
          bookmarkIds={empty}
          likeIds={empty}
          historyIds={empty}
          readingListIds={empty}
          dismissedIds={empty}
          onClose={() => setOpen(false)}
          onSelectArticle={() => {}}
          onDismiss={() => {}}
          onRestore={() => {}}
        />
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <VisualModeProvider>
    <Fixture />
  </VisualModeProvider>,
);
