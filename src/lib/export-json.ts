import type { Article, Feed } from "@/types";
import { downloadBlob } from "@/lib/download";
import { stripHtml } from "@/lib/html";

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
): ArticlesJsonExport {
  const feedMap = new Map(feeds.map((f) => [f.id, f]));
  const selected = articles.filter((a) => ids.has(a.id));
  const label = mode === "reading_list" ? "後で読む" : "ブックマーク";
  return {
    exportedAt: now.toISOString(),
    label,
    count: selected.length,
    articles: selected.map((a) => ({
      title: a.title,
      url: a.link,
      feedTitle: feedMap.get(a.feedHash)?.title ?? "不明なフィード",
      author: a.author ?? null,
      publishedAt: a.publishedAt ?? null,
      summary: a.summary ? stripHtml(a.summary).slice(0, 300) : "",
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
): void {
  const data = buildArticlesJson(articles, ids, feeds, mode);
  if (data.count === 0) return;
  const content = JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: "application/json; charset=utf-8" });
  downloadBlob(blob, `${data.label}_${data.exportedAt.slice(0, 10)}.json`);
}
