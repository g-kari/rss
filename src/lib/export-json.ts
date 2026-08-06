import type { Article, Feed } from "@/types";
import { downloadBlob } from "@/lib/download";
import { buildFeedTitleMap, clampSummaryText, selectArticlesByIds } from "@/lib/export-shared";
import { parseThemePresets, type ThemePreset } from "@/lib/theme-preset";

/** テーマプリセットJSONエクスポートのトップレベル構造。 */
export interface ThemePresetsJsonExport {
  exportedAt: string;
  count: number;
  presets: ThemePreset[];
}

/** テーマプリセットを表示順のまま構造化JSONオブジェクトへ変換する純粋関数。 */
export function buildThemePresetsJson(
  presets: readonly ThemePreset[],
  now: Date = new Date(),
): ThemePresetsJsonExport {
  return {
    exportedAt: now.toISOString(),
    count: presets.length,
    presets: presets.map(
      ({ id, name, theme, fontSize, fontFamily, lineHeight, contentWidth, createdAt }) => ({
        id,
        name,
        theme,
        fontSize,
        fontFamily,
        lineHeight,
        contentWidth,
        createdAt,
      }),
    ),
  };
}

/** テーマプリセットのJSON本文と日付付きファイル名を組み立てる純粋関数。 */
export function buildThemePresetsJsonFile(
  presets: readonly ThemePreset[],
  now: Date = new Date(),
): { content: string; filename: string } {
  const data = buildThemePresetsJson(presets, now);
  return {
    content: JSON.stringify(data, null, 2),
    filename: `theme-presets_${data.exportedAt.slice(0, 10)}.json`,
  };
}

/** テーマプリセットの JSON バックアップを検証・正規化して取り込む純粋関数。 */
export function parseThemePresetsJson(text: string): ThemePreset[] {
  try {
    const parsed = JSON.parse(text) as { presets?: unknown };
    if (!Array.isArray(parsed.presets)) return [];
    return parseThemePresets(JSON.stringify(parsed.presets));
  } catch {
    return [];
  }
}

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
    searches: [...searches],
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

/** 保存済み検索条件 JSON を検証・正規化して取り込む純粋関数。 */
export function parseSavedSearchesJson(text: string): SavedSearchJsonEntry[] {
  try {
    const parsed = JSON.parse(text) as { searches?: unknown };
    if (!Array.isArray(parsed.searches)) return [];
    const result: SavedSearchJsonEntry[] = [];
    const names = new Set<string>();
    for (const value of parsed.searches) {
      if (typeof value !== "object" || value === null) continue;
      const entry = value as Record<string, unknown>;
      const name = typeof entry.name === "string" ? entry.name.trim() : "";
      const query = typeof entry.query === "string" ? entry.query.trim() : "";
      const id = typeof entry.id === "string" ? entry.id : "";
      const createdAt = typeof entry.createdAt === "string" ? entry.createdAt : "";
      if (!name || !query || !id || !createdAt || names.has(name)) continue;
      names.add(name);
      result.push({ id, name, query, createdAt });
    }
    return result;
  } catch {
    return [];
  }
}

/** JSON エクスポートの 1 記事エントリ */
export interface ExportedArticleJson {
  title: string;
  url: string;
  guid: string;
  feedTitle: string;
  feedUrl: string | null;
  author: string | null;
  publishedAt: string | null;
  categories: string[];
  metadata: Array<{ key: string; value: string }>;
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
  const feedUrlMap = new Map<string, string>();
  for (const feed of feeds) feedUrlMap.set(feed.id, feed.url);
  const selected = selectArticlesByIds(articles, ids);
  const label = labelOverride ?? (mode === "reading_list" ? "後で読む" : "ブックマーク");
  return {
    exportedAt: now.toISOString(),
    label,
    count: selected.length,
    articles: selected.map((a) => ({
      title: a.title,
      url: a.link,
      guid: a.guid,
      feedTitle: feedTitleMap.get(a.feedHash) ?? "不明なフィード",
      feedUrl: feedUrlMap.get(a.feedHash) ?? null,
      author: a.author ?? null,
      publishedAt: a.publishedAt ?? null,
      categories: [...(a.categories ?? [])],
      metadata: (a.metadata ?? []).map(({ key, value }) => ({ key, value })),
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
  const selected = selectArticlesByIds(articles, noteIds);
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

/** メモ JSON バックアップを検証・正規化して取り込む純粋関数。 */
export function parseNotesJson(text: string): ExportedNoteJson[] {
  try {
    const parsed = JSON.parse(text) as { notes?: unknown };
    if (!Array.isArray(parsed.notes)) return [];
    const result: ExportedNoteJson[] = [];
    const urls = new Set<string>();
    for (const value of parsed.notes) {
      if (typeof value !== "object" || value === null) continue;
      const entry = value as Record<string, unknown>;
      const url = typeof entry.url === "string" ? entry.url.trim() : "";
      const note = typeof entry.note === "string" ? entry.note.trim() : "";
      if (!url || !note || urls.has(url)) continue;
      urls.add(url);
      result.push({
        title: typeof entry.title === "string" ? entry.title : "",
        url,
        feedTitle: typeof entry.feedTitle === "string" ? entry.feedTitle : "",
        note,
      });
    }
    return result;
  } catch {
    return [];
  }
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
