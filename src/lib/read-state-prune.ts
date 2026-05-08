import type { Article } from "../types";

/**
 * `readBeforeTimestamp` 以前の publishedAt を持つ既知記事の readId を物理削除する純粋関数。
 *
 * 背景 (#635 A1): `users/{userId}/read-state.json` の `readIds` がヘビーユーザーで
 * 数万件規模に肥大化し、R2 GET / PUT / クライアント localStorage を圧迫している。
 * `readBeforeTimestamp` が設定されているとき、その時点以前の記事は `isArticleRead`
 * で一括既読扱いされるため、個別 ID を保持する必要がない。
 *
 * 注意: knownArticles に存在しない readId は publishedAt が判定不能なため保持する
 * （誤って未読復帰を引き起こすのを避ける）。判定対象になるのは「クライアントが
 * 現在のセッションで取得済みの記事」だけだが、それらが大半なので実用上 readIds の
 * かなりの割合を物理削除できる。
 *
 * @param readIds 既読記事 ID の Set
 * @param knownArticles 現セッションで既知の記事メタデータ
 * @param readBeforeTimestamp ISO 8601 文字列または null
 * @returns 削除対象がない場合は元の Set インスタンスを返す（参照同一性維持で再レンダー抑制）
 */
export function pruneOldReadIds(
  readIds: Set<string>,
  knownArticles: Article[],
  readBeforeTimestamp: string | null,
): Set<string> {
  if (!readBeforeTimestamp) return readIds;
  const cutoff = Date.parse(readBeforeTimestamp);
  if (isNaN(cutoff)) return readIds;

  const removeSet = new Set<string>();
  for (const article of knownArticles) {
    if (!article.publishedAt) continue;
    const ts = Date.parse(article.publishedAt);
    if (isNaN(ts)) continue;
    if (ts < cutoff && readIds.has(article.id)) {
      removeSet.add(article.id);
    }
  }
  if (removeSet.size === 0) return readIds;

  const next = new Set<string>();
  for (const id of readIds) {
    if (!removeSet.has(id)) next.add(id);
  }
  return next;
}
