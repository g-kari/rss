/**
 * アイソレート内のペンディング操作を管理する Map。
 *
 * ⚠️  Edge Runtime (Cloudflare Workers / Next.js) では、リクエストをまたいでモジュールスコープの
 * 変数が再初期化されることがある（アイソレートが使い捨てにされる場合）。
 * そのため、この Map は同一アイソレート内の並行リクエスト間でのみ有効な最適化であり、
 * 異なるアイソレート間での直列化は保証されない。
 * （同一アイソレート内のリクエストが read-modify-write 競合を起こすのを防ぐ用途に限定）
 */
const pendingOps = new Map<string, Promise<unknown>>();

/**
 * 同一キーの非同期操作を直列化する。
 * 同一アイソレート内で同じキーの並行リクエストが read-modify-write 競合を起こすのを防ぐ。
 * 異なるキーの操作は並列実行される。
 */
export function serialized<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = pendingOps.get(key) ?? Promise.resolve();
  // prev のエラーを明示的に無視してから fn を実行する。
  // prev.then(fn, fn) だと fn がエラーハンドラーとして呼ばれた場合に
  // 前段のエラー値が引数として渡り、型シグネチャ上の混乱が生じやすいため
  // catch().then() パターンを使う。
  const current = prev.catch(() => {}).then(fn);
  pendingOps.set(key, current);
  return current.finally(() => {
    if (pendingOps.get(key) === current) {
      pendingOps.delete(key);
    }
  });
}
