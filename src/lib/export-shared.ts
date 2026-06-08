import type { Feed } from "@/types";
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
