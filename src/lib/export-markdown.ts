import type { Article, Feed } from "@/types";

/** Markdown のリンク構文を壊す文字をエスケープする */
function escapeMarkdown(s: string): string {
  return s.replace(/[[\]()\\`*_{}#|>]/g, "\\$&");
}

/**
 * ブックマーク / 読書リスト記事を Markdown ファイルとしてダウンロードする。
 *
 * @param articles 全記事一覧
 * @param ids エクスポート対象の記事 ID セット
 * @param feeds フィード一覧（フィード名の解決用）
 * @param mode 出力ファイル名に使うラベル
 */
export function exportArticlesToMarkdown(
  articles: Article[],
  ids: Set<string>,
  feeds: Feed[],
  mode: "bookmark" | "reading_list",
): void {
  const feedMap = new Map(feeds.map((f) => [f.id, f]));
  const selected = articles.filter((a) => ids.has(a.id));

  if (selected.length === 0) return;

  const today = new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const label = mode === "reading_list" ? "後で読む" : "ブックマーク";
  const lines: string[] = [`# ${label} — ${today}`, "", `> ${selected.length} 件`, ""];

  // フィードごとにグループ化
  const byFeed = new Map<string, Article[]>();
  for (const article of selected) {
    const list = byFeed.get(article.feedHash) ?? [];
    list.push(article);
    byFeed.set(article.feedHash, list);
  }

  for (const [feedHash, feedArticles] of byFeed) {
    const feed = feedMap.get(feedHash);
    lines.push(`## ${escapeMarkdown(feed?.title ?? "不明なフィード")}`, "");

    for (const article of feedArticles) {
      lines.push(`### [${escapeMarkdown(article.title)}](${article.link})`, "");

      const meta: string[] = [];
      if (article.publishedAt) {
        meta.push(`**公開日**: ${new Date(article.publishedAt).toLocaleDateString("ja-JP")}`);
      }
      if (article.author) {
        meta.push(`**著者**: ${article.author}`);
      }
      if (meta.length > 0) lines.push(meta.join(" | "), "");

      if (article.summary) {
        const plain = article.summary
          .replace(/<[^>]*>/g, "")
          .trim()
          .slice(0, 300);
        if (plain) lines.push(plain, "");
      }

      lines.push("---", "");
    }
  }

  const content = lines.join("\n");
  const blob = new Blob([content], { type: "text/markdown; charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${label}_${today.replace(/\//g, "-")}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * メモ付き記事をメモ本文ごと Markdown ファイルとしてダウンロードする。
 *
 * @param articles 全記事一覧
 * @param notes articleId → メモ本文 のマップ
 * @param feeds フィード一覧（フィード名の解決用）
 */
export function exportNotesToMarkdown(
  articles: Article[],
  notes: Record<string, string>,
  feeds: Feed[],
): void {
  const noteIds = new Set(Object.keys(notes));
  const feedMap = new Map(feeds.map((f) => [f.id, f]));
  const selected = articles.filter((a) => noteIds.has(a.id));

  if (selected.length === 0) return;

  const today = new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const lines: string[] = [`# メモ — ${today}`, "", `> ${selected.length} 件`, ""];

  // フィードごとにグループ化
  const byFeed = new Map<string, Article[]>();
  for (const article of selected) {
    const list = byFeed.get(article.feedHash) ?? [];
    list.push(article);
    byFeed.set(article.feedHash, list);
  }

  for (const [feedHash, feedArticles] of byFeed) {
    const feed = feedMap.get(feedHash);
    lines.push(`## ${escapeMarkdown(feed?.title ?? "不明なフィード")}`, "");

    for (const article of feedArticles) {
      lines.push(`### [${escapeMarkdown(article.title)}](${article.link})`, "");

      const meta: string[] = [];
      if (article.publishedAt) {
        meta.push(`**公開日**: ${new Date(article.publishedAt).toLocaleDateString("ja-JP")}`);
      }
      if (article.author) {
        meta.push(`**著者**: ${article.author}`);
      }
      if (meta.length > 0) lines.push(meta.join(" | "), "");

      const noteText = notes[article.id];
      if (noteText) {
        lines.push("> " + noteText.replace(/\n/g, "\n> "), "");
      }

      lines.push("---", "");
    }
  }

  const content = lines.join("\n");
  const blob = new Blob([content], { type: "text/markdown; charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `メモ_${today.replace(/\//g, "-")}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
