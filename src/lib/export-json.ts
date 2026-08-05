import type { Article, Feed } from "@/types";
import { downloadBlob } from "@/lib/download";
import { buildFeedTitleMap, clampSummaryText } from "@/lib/export-shared";

/** 保存済み検索条件 JSON エクスポートの 1 エントリ */
export interface SavedSearchJsonEntry {
  id: string;
  name: string;
  query: string;
  createdAt: string;
}

/** 保存済み検索条件 JSON エクスポートのトップレベル構造 */
export interface SavedSearchesJsonExport {
  exportedAt: string;
  count: number;
  searches: SavedSearchJsonEntry[];
}

/** 保存済み検索条件を表示順のまま構造化 JSON オブジェクトへ変換する純粋関数。 */
export function buildSavedSearchesJson(
  searches: readonly SavedSearchJsonEntry[],
  now: Date = new Date(),
): SavedSearchesJsonExport {
  return {
    exportedAt: now.toISOString(),
    count: searches.length,
    searches: searches.map(({ id, name, query, createdAt }) => ({ id, name, query, createdAt })),
  };
}

/** 保存済み検索条件の JSON 本文と日付付きファイル名を組み立てる純粋関数。 */
export function buildSavedSearchesJsonFile(
  searches: readonly SavedSearchJsonEntry[],
  now: Date = new Date(),
): { content: string; filename: string } {
  const data = buildSavedSearchesJson(searches, now);
  return {
    content: JSON.stringify(data, null, 2),
    filename: `saved-searches_${data.exportedAt.slice(0, 10)}.json`,
  };
}

/** JSON エクスポートの 1 記事エントリ */
export interface ExportedArticleJson {
  title: string;
  url: string;
  feedTitle: string;
  author: string | null;
  publishedAt: string | null;
  /** summary を HTML 除去 + 300 文字 clamp したプレーンテキスト */
  summary: string;
}

/** JSON エクスポートのトップレベル構造 */
export interface ArticlesJsonExport {
  exportedAt: string;
  label: string;
  count: number;
  articles: ExportedArticleJson[];
}

/**
 * ブックマーク / 後で読む記事を構造化 JSON オブジェクトに変換する純粋関数。
 *
 * @param articles 全記事一覧
 * @param ids エクスポート対象の記事 ID セット
 * @param feeds フィード一覧（フィード名の解決用、`Feed.id === feedHash`）
 * @param mode 出力ラベルに使うモード
 * @param now exportedAt に使う現在時刻（テスト容易化のため引数化、既定は実行時刻）
 */
export function buildArticlesJson(
  articles: Article[],
  ids: Set<string>,
  feeds: Feed[],
  mode: "bookmark" | "reading_list",
  now: Date = new Date(),
  labelOverride?: string,
): ArticlesJsonExport {
  const feedTitleMap = buildFeedTitleMap(feeds);
  const selected = articles.filter((a) => ids.has(a.id));
  const label = labelOverride ?? (mode === "reading_list" ? "後で読む" : "ブックマーク");
  return {
    exportedAt: now.toISOString(),
    label,
    count: selected.length,
    articles: selected.map((a) => ({
      title: a.title,
      url: a.link,
      feedTitle: feedTitleMap.get(a.feedHash) ?? "不明なフィード",
      author: a.author ?? null,
      publishedAt: a.publishedAt ?? null,
      summary: clampSummaryText(a.summary),
    })),
  };
}

/**
 * ブックマーク / 後で読む記事を JSON ファイルとしてダウンロードする。
 * 対象が 0 件のときは何もしない。
 */
export function exportArticlesToJson(
  articles: Article[],
  ids: Set<string>,
  feeds: Feed[],
  mode: "bookmark" | "reading_list",
  labelOverride?: string,
): void {
  const data = buildArticlesJson(articles, ids, feeds, mode, new Date(), labelOverride);
  if (data.count === 0) return;
  const content = JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: "application/json; charset=utf-8" });
  downloadBlob(blob, `${data.label}_${data.exportedAt.slice(0, 10)}.json`);
}

/** メモ JSON エクスポートの 1 エントリ */
export interface ExportedNoteJson {
  title: string;
  url: string;
  feedTitle: string;
  note: string;
}

/** メモ JSON エクスポートのトップレベル構造 */
export interface NotesJsonExport {
  exportedAt: string;
  count: number;
  notes: ExportedNoteJson[];
}

/**
 * メモ付き記事を構造化 JSON オブジェクトに変換する純粋関数。
 *
 * @param articles 全記事一覧
 * @param notes articleId → メモ本文 のマップ
 * @param feeds フィード一覧（フィード名の解決用、`Feed.id === feedHash`）
 * @param now exportedAt に使う現在時刻（テスト容易化のため引数化、既定は実行時刻）
 */
export function buildNotesJson(
  articles: Article[],
  notes: Record<string, string>,
  feeds: Feed[],
  now: Date = new Date(),
): NotesJsonExport {
  const noteIds = new Set(Object.keys(notes));
  const feedTitleMap = buildFeedTitleMap(feeds);
  const selected = articles.filter((a) => noteIds.has(a.id));
  return {
    exportedAt: now.toISOString(),
    count: selected.length,
    notes: selected.map((a) => ({
      title: a.title,
      url: a.link,
      feedTitle: feedTitleMap.get(a.feedHash) ?? "不明なフィード",
      note: notes[a.id] ?? "",
    })),
  };
}

/**
 * メモ付き記事を JSON ファイルとしてダウンロードする。
 * 対象が 0 件のときは何もしない。
 */
export function exportNotesToJson(
  articles: Article[],
  notes: Record<string, string>,
  feeds: Feed[],
): void {
  const data = buildNotesJson(articles, notes, feeds);
  if (data.count === 0) return;
  const content = JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: "application/json; charset=utf-8" });
  downloadBlob(blob, `メモ_${data.exportedAt.slice(0, 10)}.json`);
}
