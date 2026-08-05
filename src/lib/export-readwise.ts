import type { Article, Feed } from "@/types";
import { downloadBlob } from "@/lib/download";
import { buildFeedTitleMap } from "@/lib/export-shared";

/** RFC 4180 ベースの CSV エスケープ。すべての値を `"` で囲み、内部の `"` を二重化する */
function csvEscape(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

/** 日時を YYYY-MM-DD 形式に変換する。パース失敗時は空文字 */
function toYmd(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

const READWISE_HEADER = ["Highlight", "Title", "Author", "URL", "Note", "Date"].join(",");

/**
 * Readwise CSV (Highlight, Title, Author, URL, Note, Date) を組み立てる純粋関数。
 *
 * Highlight はメモの 1 行目、Note はメモ全文。メモが空の記事はスキップする。
 * Author は記事著者（無ければフィードタイトル）、Date は publishedAt（無ければ createdAt）の YYYY-MM-DD。
 */
export function buildReadwiseCsv(
  articles: Article[],
  notes: Record<string, string>,
  feeds: Feed[],
): string {
  const feedTitleMap = buildFeedTitleMap(feeds);
  const lines: string[] = [READWISE_HEADER];

  for (const article of articles) {
    const note = notes[article.id];
    if (!note || note.trim().length === 0) continue;

    const highlight = note.split(/\r?\n/)[0] ?? article.title;
    const author = article.author?.trim() || feedTitleMap.get(article.feedHash) || "";
    const date = toYmd(article.publishedAt) || toYmd(article.createdAt);

    lines.push(
      [highlight, article.title, author, article.link, note, date].map(csvEscape).join(","),
    );
  }

  return lines.join("\n") + (lines.length > 1 ? "\n" : "\n");
}

/**
 * メモ付き記事を Readwise CSV としてダウンロードする。
 *
 * @param articles 全記事一覧
 * @param notes articleId → メモ本文 のマップ
 * @param feeds フィード一覧（Author 列の解決用）
 */
export function exportNotesToReadwise(
  articles: Article[],
  notes: Record<string, string>,
  feeds: Feed[],
): void {
  const csv = buildReadwiseCsv(articles, notes, feeds);
  const dataLineCount = csv.split("\n").filter((l) => l.length > 0).length - 1;
  if (dataLineCount <= 0) return;

  const today = new Date().toISOString().slice(0, 10);
  const blob = new Blob([csv], { type: "text/csv; charset=utf-8" });
  downloadBlob(blob, `readwise_${today}.csv`);
}
