const pendingOps = new Map<string, Promise<unknown>>();

/**
 * 同一キーの非同期操作を直列化する。
 * 同一アイソレート内で同じキーの並行リクエストが read-modify-write 競合を起こすのを防ぐ。
 * 異なるキーの操作は並列実行される。
 */
export function serialized<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = pendingOps.get(key) ?? Promise.resolve();
  const current = prev.then(fn, fn);
  pendingOps.set(key, current);
  return current.finally(() => {
    if (pendingOps.get(key) === current) {
      pendingOps.delete(key);
    }
  });
}
