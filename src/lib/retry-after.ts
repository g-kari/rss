/**
 * HTTP `Retry-After` ヘッダーをミリ秒に変換する。
 *
 * 仕様:
 * - delta-seconds 形式（例: `"60"`）→ 秒 × 1000
 * - HTTP-date 形式（例: `"Wed, 21 Oct 2026 07:28:00 GMT"`）→ 現在時刻との差分 ms
 * - null / 空文字 / パース失敗 → `fallbackMs`
 * - 常に `maxMs` 以下にクランプ（悪意のある超長期待機を防止）
 * - `nowMs` を指定すると HTTP-date の基準時刻を固定できる（テスト・再現性向け）
 */
export function parseRetryAfter(
  header: string | null | undefined,
  opts?: { fallbackMs?: number; maxMs?: number; nowMs?: number },
): number {
  const fallback = opts?.fallbackMs ?? 60_000;
  const max = opts?.maxMs ?? 24 * 60 * 60 * 1000;
  if (!header) return fallback;
  const trimmed = header.trim();
  if (trimmed === "") return fallback;

  // delta-seconds
  if (/^\d+$/.test(trimmed)) {
    const seconds = parseInt(trimmed, 10);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, max);
    }
  }

  // HTTP-date
  const date = new Date(trimmed);
  const time = date.getTime();
  if (Number.isFinite(time)) {
    const diff = time - (opts?.nowMs ?? Date.now());
    if (diff > 0) return Math.min(diff, max);
  }

  return fallback;
}
