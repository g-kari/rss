import type { Article, Feed } from "@/types";
import { downloadBlob } from "@/lib/download";
import {
  buildArticleMetaLine,
  buildFeedTitleMap,
  clampSummaryText,
  groupArticlesByFeed,
} from "@/lib/export-shared";

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
 * @param labelOverride 指定時は mode 由来ラベルの代わりに使う（コレクション名等）。見出し / ファイル名に反映
 */
export function exportArticlesToMarkdown(
  articles: Article[],
  ids: Set<string>,
  feeds: Feed[],
  mode: "bookmark" | "reading_list",
  labelOverride?: string,
): void {
  const feedTitleMap = buildFeedTitleMap(feeds);
  const selected = articles.filter((a) => ids.has(a.id));

  if (selected.length === 0) return;

  const today = new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const label = labelOverride ?? (mode === "reading_list" ? "後で読む" : "ブックマーク");
  const lines: string[] = [`# ${label} — ${today}`, "", `> ${selected.length} 件`, ""];

  for (const [feedHash, feedArticles] of groupArticlesByFeed(selected)) {
    lines.push(`## ${escapeMarkdown(feedTitleMap.get(feedHash) ?? "不明なフィード")}`, "");

    for (const article of feedArticles) {
      lines.push(`### [${escapeMarkdown(article.title)}](${article.link})`, "");

      const metaLine = buildArticleMetaLine(article);
      if (metaLine) lines.push(metaLine, "");

      const plain = clampSummaryText(article.summary);
      if (plain) lines.push(plain, "");

      lines.push("---", "");
    }
  }

  const content = lines.join("\n");
  const blob = new Blob([content], { type: "text/markdown; charset=utf-8" });
  downloadBlob(blob, `${label}_${today.replace(/\//g, "-")}.md`);
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
  const feedTitleMap = buildFeedTitleMap(feeds);
  const selected = articles.filter((a) => noteIds.has(a.id));

  if (selected.length === 0) return;

  const today = new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const lines: string[] = [`# メモ — ${today}`, "", `> ${selected.length} 件`, ""];

  for (const [feedHash, feedArticles] of groupArticlesByFeed(selected)) {
    lines.push(`## ${escapeMarkdown(feedTitleMap.get(feedHash) ?? "不明なフィード")}`, "");

    for (const article of feedArticles) {
      lines.push(`### [${escapeMarkdown(article.title)}](${article.link})`, "");

      const metaLine = buildArticleMetaLine(article);
      if (metaLine) lines.push(metaLine, "");

      const noteText = notes[article.id];
      if (noteText) {
        lines.push("> " + noteText.replace(/\n/g, "\n> "), "");
      }

      lines.push("---", "");
    }
  }

  const content = lines.join("\n");
  const blob = new Blob([content], { type: "text/markdown; charset=utf-8" });
  downloadBlob(blob, `メモ_${today.replace(/\//g, "-")}.md`);
}
