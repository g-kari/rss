/**
 * OGP cache の true-LRU eviction 純粋関数 (#1088 Finding 2)。
 *
 * 旧実装は `{ ...prev, [key]: entry }` + `keys.slice(-MAX)` だった。JS object spread は
 * 既存 key の挿入位置を保持する (末尾移動しない) ため、`slice(-MAX)` は挿入順末尾 MAX を
 * 残す = **FIFO** であって LRU ではなかった。古い記事 link を再表示して entry を更新しても
 * recency が反映されず、cache 上限到達時に「最初に見た」entry から evict され、直近アクセス
 * した古記事 entry が優先的に捨てられて再 fetch 多発 (`/api/ogp` 負荷増) を招いていた。
 *
 * 本関数は更新時に key を末尾へ移動 (delete → 再代入) して recency を反映し、上限超過時は
 * 先頭 (= 最も古くアクセスされた) entry から evict する true-LRU 化を行う。
 */
export function mergeWithLruEviction<V>(
  prev: Record<string, V>,
  key: string,
  entry: V,
  max: number,
): Record<string, V> {
  // max <= 0 は cache 無効化扱い (slice(-0) が全件コピーになる罠を避ける)。
  if (max <= 0) return {};

  // 既存 key を末尾へ移動して recency を反映 (true-LRU)。object spread は既存 key の挿入
  // 位置を保持するため、delete してから再代入することで末尾移動を実現する。
  const next: Record<string, V> = { ...prev };
  delete next[key];
  next[key] = entry;

  const keys = Object.keys(next);
  if (keys.length <= max) return next;
  // 上限超過 → 先頭 (最も古くアクセスされた) entry から evict して末尾 max 件を残す。
  const evicted: Record<string, V> = {};
  for (let i = Math.max(0, keys.length - max); i < keys.length; i++) {
    const k = keys[i];
    if (k !== undefined) evicted[k] = next[k]!;
  }
  return evicted;
}
