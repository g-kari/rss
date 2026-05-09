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
    // isArticleRead (article-filter.ts) と同じく publishedAt → createdAt の
    // フォールバックチェーンを採る。これがないと `feedHash: "__saved__"` の
    // 手動保存記事 (publishedAt が null) などで isArticleRead は createdAt で
    // 既読扱いするのに pruneOldReadIds は何もせず、readIds が永久に蓄積する。
    const tsRaw = article.publishedAt ?? article.createdAt;
    if (!tsRaw) continue;
    const ts = Date.parse(tsRaw);
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

/**
 * 自動 prune に使う「実効カットオフ時刻」を計算する純粋関数 (#635 設定可能化)。
 *
 * ユーザーが手動設定する `readBeforeTimestamp` と、`ttlDays` から算出した
 * 「N 日以上前」のカットオフのうち、**より新しい時刻** を採用する。
 * 「より新しい時刻」を採用する理由: cutoff は「これ以前を削除する」基準なので、
 * 新しい時刻ほど削除対象が広く（=より積極的に削除）なる。ユーザーの意図を
 * 取りこぼさないよう、両方の基準を OR で組み合わせる。
 *
 * @param readBeforeTimestamp ユーザー手動の cutoff（ISO 8601）または null
 * @param ttlDays `ReadState.ttlDays`（null/0=無効、1〜365）
 * @param now 現在時刻のミリ秒タイムスタンプ（テスト容易性のため引数化）
 * @returns 実効カットオフ ISO 8601、または null（どちらも未設定）
 */
export function computeEffectiveReadBeforeCutoff(
  readBeforeTimestamp: string | null,
  ttlDays: number | null,
  now: number,
): string | null {
  const ttlCutoffIso =
    ttlDays != null && ttlDays > 0
      ? new Date(now - ttlDays * 24 * 60 * 60 * 1000).toISOString()
      : null;
  const candidates = [readBeforeTimestamp, ttlCutoffIso].filter((x): x is string => !!x);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a > b ? a : b));
}
