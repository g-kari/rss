import type { Article, ReadState } from "@/types";
import { getArticleTimestamp } from "@/lib/article-utils";

/** 既読以外のアクションがない記事を除外するデフォルト TTL 日数 */
export const ARTICLE_TTL_DAYS = 30;

/** 非アクティブフィードの cron スキップ閾値（日数） */
export const INACTIVE_FEED_DAYS = 7;

/**
 * ReadState から保護対象の記事 ID セットを構築する。
 * bookmark / readingList / like / snooze / notes がある記事は削除しない。
 * readIds のみは保護対象外（既読だけでは保護しない）。
 */
export function buildProtectedIds(readState: ReadState): Set<string> {
  const ids = new Set<string>();
  for (const id of readState.bookmarkIds) ids.add(id);
  for (const id of readState.readingListIds) ids.add(id);
  for (const id of readState.likeIds) ids.add(id);
  if (readState.snoozedUntil) {
    for (const id of Object.keys(readState.snoozedUntil)) ids.add(id);
  }
  if (readState.notes) {
    for (const id of Object.keys(readState.notes)) ids.add(id);
  }
  return ids;
}

/**
 * TTL 超過かつ非保護の記事を除外する。
 * publishedAt が null の場合は createdAt を使用する。
 * どちらも判定できない場合は安全側（保持）に倒す。
 */
export function filterExpiredArticles(
  articles: Article[],
  protectedIds: Set<string>,
  ttlDays: number = ARTICLE_TTL_DAYS,
): Article[] {
  const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  return articles.filter((a) => {
    if (protectedIds.has(a.id)) return true;
    const dateStr = getArticleTimestamp(a);
    if (!dateStr) return true; // 日時不明は安全側（保持）
    const age = now - new Date(dateStr).getTime();
    return age <= ttlMs;
  });
}
