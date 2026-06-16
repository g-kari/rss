import type { Article, Feed } from "@/types";
import { stripHtml } from "@/lib/html";

/**
 * feeds から `feedHash (= Feed.id)` → `title` の Map を構築する。
 * export-markdown / export-readwise / export-json の重複を集約 (helper-drift 解消)。
 * fallback (「不明なフィード」/ 空文字) は呼び出し側が用途別に適用する。
 */
export function buildFeedTitleMap(feeds: Feed[]): Map<string, string> {
  return new Map(feeds.map((f) => [f.id, f.title]));
}

/** summary を HTML 除去 + 先頭 max 文字に clamp する (既定 300、未設定は空文字)。 */
export function clampSummaryText(summary: string | undefined, max = 300): string {
  return summary ? stripHtml(summary).slice(0, max) : "";
}

/**
 * 記事配列を feedHash 単位の Map にグルーピングする。
 * export-markdown の `exportArticlesToMarkdown` / `exportNotesToMarkdown` で
 * 同形 byFeed 集約ロジックが重複していたものを集約。
 */
export function groupArticlesByFeed(articles: Article[]): Map<string, Article[]> {
  const byFeed = new Map<string, Article[]>();
  for (const article of articles) {
    const list = byFeed.get(article.feedHash) ?? [];
    list.push(article);
    byFeed.set(article.feedHash, list);
  }
  return byFeed;
}

/**
 * `**公開日**: YYYY/MM/DD | **著者**: Foo` 形式の Markdown meta 行を構築する。
 * publishedAt / author いずれも未指定なら空文字を返す (呼出側で `if (meta) push` ガード推奨)。
 */
export function buildArticleMetaLine(article: Article): string {
  const meta: string[] = [];
  if (article.publishedAt) {
    meta.push(`**公開日**: ${new Date(article.publishedAt).toLocaleDateString("ja-JP")}`);
  }
  if (article.author) {
    meta.push(`**著者**: ${article.author}`);
  }
  return meta.join(" | ");
}
