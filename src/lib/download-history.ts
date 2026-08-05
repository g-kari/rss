/**
 * 画像ダウンロード履歴管理 (#648)。
 *
 * ギャラリービューで個別画像を保存するときに、既に DL 済みかどうかを
 * 判定して確認ダイアログを出すための URL リスト管理。
 *
 * 保存形式は配列（順序を保つため Set ではない）で、上限を超えたら
 * 先頭の最古要素を削除する FIFO 方式。LRU は実装コスト高で UX 改善幅も
 * 小さいため採用しない。マルチデバイス同期は不要（クライアントごとに独立）。
 */

/** 履歴の上限件数。これを超えたら先頭から削除される。 */
export const MAX_DOWNLOAD_HISTORY = 5000;

/**
 * URL 群のうち履歴に存在する件数を数える。
 * 履歴を一度だけ Set 化し、一括判定を O(urls × history) から O(urls + history) に抑える。
 */
export function countUrlsInHistory(
  urls: ReadonlyArray<string>,
  history: ReadonlyArray<string>,
): number {
  const historySet = new Set(history);
  let count = 0;
  for (const url of urls) {
    if (historySet.has(url)) count++;
  }
  return count;
}

/**
 * URL を履歴に追加する純粋関数。
 *
 * - 既に存在する URL は何もせず元の配列インスタンスを返す（参照同一性で再レンダー抑制）
 * - 空文字も同様に何もしない
 * - 上限超過時は先頭から削除して末尾に新規追加
 */
export function addUrlToHistory(history: string[], url: string, limit: number): string[] {
  if (!url) return history;
  if (history.includes(url)) return history;
  const next = [...history, url];
  if (next.length <= limit) return next;
  return next.slice(next.length - limit);
}
