import { SPECIAL_FEED_IDS } from "./storage";

const SPECIAL_TITLES: Record<string, string> = {
  [SPECIAL_FEED_IDS.BOOKMARKS]: "ブックマーク",
  [SPECIAL_FEED_IDS.READING_LIST]: "後で読む",
  [SPECIAL_FEED_IDS.LIKES]: "いいね",
  [SPECIAL_FEED_IDS.HISTORY]: "読書履歴",
  [SPECIAL_FEED_IDS.DIGEST]: "ダイジェスト",
};

/** Name the actual combined scope without changing its filtering/selection behavior. */
export function articleListScopeTitle({
  feedId,
  feedTitle,
  groupTitle,
  tag,
  collectionTitle,
}: {
  feedId?: string | null;
  feedTitle?: string;
  groupTitle?: string;
  tag?: string | null;
  collectionTitle?: string;
}): string {
  // The feed predicate takes precedence over the group predicate when both are set.
  const primary = feedId ? SPECIAL_TITLES[feedId] || feedTitle || "フィード" : groupTitle;
  const scopes = [
    primary,
    tag && `タグ: ${tag}`,
    collectionTitle && `コレクション: ${collectionTitle}`,
  ].filter(Boolean);
  return scopes.length ? scopes.join(" · ") : "すべての記事";
}
