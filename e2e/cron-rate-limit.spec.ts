import { test, expect } from '@playwright/test';
import { parseRetryAfter, RateLimitError } from '../src/cron/fetch';

/**
 * cron/fetch.ts の 429 レートリミット処理のユニットテスト。
 *
 * parseRetryAfter: Retry-After ヘッダー値をミリ秒に変換する関数
 * RateLimitError: 429 レスポンスを表すカスタムエラークラス
 */

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

test.describe('parseRetryAfter — 整数秒形式', () => {
  test('null を渡すとデフォルト 1 時間を返す', () => {
    expect(parseRetryAfter(null)).toBe(ONE_HOUR_MS);
  });

  test('空文字はデフォルト 1 時間を返す', () => {
    // parseInt('') は NaN → デフォルト値
    expect(parseRetryAfter('')).toBe(ONE_HOUR_MS);
  });

  test('"3600" → 1 時間のミリ秒', () => {
    expect(parseRetryAfter('3600')).toBe(3600 * 1000);
  });

  test('"60" → 60 秒のミリ秒', () => {
    expect(parseRetryAfter('60')).toBe(60 * 1000);
  });

  test('"1" → 1 秒のミリ秒', () => {
    expect(parseRetryAfter('1')).toBe(1000);
  });

  test('"0" はデフォルト 1 時間を返す（0 秒は無効値）', () => {
    expect(parseRetryAfter('0')).toBe(ONE_HOUR_MS);
  });

  test('負の値はデフォルト 1 時間を返す', () => {
    expect(parseRetryAfter('-1')).toBe(ONE_HOUR_MS);
  });

  test('24 時間超えは 24 時間にクランプされる', () => {
    // 25 時間 = 90000 秒 → 24 時間 = 86400 * 1000 ms
    expect(parseRetryAfter('90000')).toBe(ONE_DAY_MS);
  });

  test('ちょうど 24 時間 (86400 秒) は許容される', () => {
    expect(parseRetryAfter('86400')).toBe(ONE_DAY_MS);
  });
});

test.describe('parseRetryAfter — HTTP-date 形式', () => {
  test('未来の HTTP-date → 残り時間のミリ秒', () => {
    const futureDate = new Date(Date.now() + 2 * ONE_HOUR_MS);
    const retryAfter = futureDate.toUTCString();
    const result = parseRetryAfter(retryAfter);
    // 約 2 時間 (500ms 以内の誤差を許容: Date 生成から parseRetryAfter 呼び出しまでの実行時間)
    expect(result).toBeGreaterThan(2 * ONE_HOUR_MS - 500);
    expect(result).toBeLessThanOrEqual(2 * ONE_HOUR_MS);
  });

  test('過去の HTTP-date はデフォルト 1 時間を返す', () => {
    const pastDate = new Date(Date.now() - ONE_HOUR_MS);
    expect(parseRetryAfter(pastDate.toUTCString())).toBe(ONE_HOUR_MS);
  });

  test('25 時間後の HTTP-date は 24 時間にクランプされる', () => {
    const farFuture = new Date(Date.now() + 25 * ONE_HOUR_MS);
    expect(parseRetryAfter(farFuture.toUTCString())).toBe(ONE_DAY_MS);
  });

  test('不正な日付文字列はデフォルト 1 時間を返す', () => {
    expect(parseRetryAfter('not-a-date')).toBe(ONE_HOUR_MS);
  });
});

test.describe('RateLimitError', () => {
  test('retryAfterMs を保持する', () => {
    const err = new RateLimitError(3600_000);
    expect(err.retryAfterMs).toBe(3600_000);
  });

  test('Error のサブクラスである', () => {
    const err = new RateLimitError(60_000);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RateLimitError);
  });

  test('name が "RateLimitError"', () => {
    expect(new RateLimitError(0).name).toBe('RateLimitError');
  });

  test('message に秒数が含まれる', () => {
    const err = new RateLimitError(3600_000);
    expect(err.message).toContain('3600');
  });

  test('instanceof チェックが通常の Error と区別できる', () => {
    const rateLimitErr = new RateLimitError(1000);
    const genericErr = new Error('generic');
    expect(rateLimitErr instanceof RateLimitError).toBe(true);
    expect(genericErr instanceof RateLimitError).toBe(false);
  });
});
