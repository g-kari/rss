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

export interface ConcurrencyLimiter {
  <T>(fn: () => Promise<T>): Promise<T>;
  /** Take a slot without waiting. False leaves the limiter unchanged. */
  tryAcquire(): boolean;
  /** Wait for a FIFO slot. Pair every success with release, including tryAcquire. */
  acquire(): Promise<void>;
  release(): void;
}

/** バッチ単位の FIFO リミッター。ネットワーク待ちとメモリを使う処理を別々に制限する。 */
export function createConcurrencyLimiter(concurrency: number): ConcurrencyLimiter {
  const limit = normalizeConcurrency(concurrency, Number.MAX_SAFE_INTEGER);
  let active = 0;
  const waiting: Array<() => void> = [];
  // A waiter inherits the releasing holder's slot, so active is not incremented again.
  function acquire(): Promise<void> {
    if (active < limit) {
      active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => waiting.push(resolve));
  }
  function tryAcquire(): boolean {
    if (active >= limit) return false;
    active++;
    return true;
  }
  function release(): void {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
  const run = async <T>(fn: () => Promise<T>): Promise<T> => {
    await acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  };
  return Object.assign(run, { acquire, tryAcquire, release });
}

/** Rotate a bounded-maintenance batch fairly across cycles without persistent state. */
export function rotateBatchStart<T>(items: T[], cycle: number): T[] {
  if (items.length < 2) return [...items];
  let stride = Math.floor(items.length / 2) + 1;
  const gcd = (left: number, right: number): number => {
    while (right) [left, right] = [right, left % right];
    return left;
  };
  while (gcd(stride, items.length) !== 1) stride++;
  const offset =
    ((((Math.floor(cycle) % items.length) * stride) % items.length) + items.length) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}
