/**
 * 並行度制限付きの非同期マッピングユーティリティ。
 * cron (allSettled セマンティクス) と R2 操作 (all セマンティクス) の両方で使用される。
 */

/** Promise.all セマンティクス — エラーは即座に伝播する */
export async function pMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results = Array.from<R>({ length: items.length });
  let next = 0;
  const workerCount = normalizeConcurrency(concurrency, items.length);
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/** Promise.allSettled セマンティクス — 個々のエラーを PromiseSettledResult に収集する */
export async function pMapSettled<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = Array.from({ length: items.length });
  let next = 0;
  const workerCount = normalizeConcurrency(concurrency, items.length);
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

function normalizeConcurrency(concurrency: number, itemCount: number): number {
  if (itemCount === 0) return 0;
  if (!Number.isFinite(concurrency)) return 1;
  return Math.min(Math.max(1, Math.floor(concurrency)), itemCount);
}
