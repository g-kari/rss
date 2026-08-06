import { test, expect } from "@playwright/test";
import { parseRetryAfter } from "../src/lib/retry-after";

const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 60 * 60_000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

// ── delta-seconds 形式 ────────────────────────────────────────

test.describe("parseRetryAfter — delta-seconds 形式", () => {
  test("null を渡すとデフォルト fallbackMs（60秒）を返す", () => {
    expect(parseRetryAfter(null)).toBe(ONE_MINUTE_MS);
  });

  test("undefined を渡すとデフォルト fallbackMs を返す", () => {
    expect(parseRetryAfter(undefined)).toBe(ONE_MINUTE_MS);
  });

  test("空文字はデフォルト fallbackMs を返す", () => {
    expect(parseRetryAfter("")).toBe(ONE_MINUTE_MS);
  });

  test('"30" → 30 秒のミリ秒', () => {
    expect(parseRetryAfter("30")).toBe(30_000);
  });

  test('"60" → 60 秒のミリ秒', () => {
    expect(parseRetryAfter("60")).toBe(60_000);
  });

  test('"0" → 0 ミリ秒（即再試行）', () => {
    expect(parseRetryAfter("0")).toBe(0);
  });

  test("負の差分は fallbackMs を返す（負は parseInt で正になるが無効）", () => {
    // "-1" は /^\d+$/ にマッチしないので fallback
    expect(parseRetryAfter("-1")).toBe(ONE_MINUTE_MS);
  });

  test("デフォルト maxMs（24時間）を超えると 24 時間にクランプされる", () => {
    // 25 時間 = 90000 秒
    expect(parseRetryAfter("90000")).toBe(ONE_DAY_MS);
  });

  test("ちょうど 24 時間（86400 秒）は許容される", () => {
    expect(parseRetryAfter("86400")).toBe(ONE_DAY_MS);
  });

  test("前後の空白は無視される", () => {
    expect(parseRetryAfter("  30  ")).toBe(30_000);
  });
});

// ── opts.fallbackMs カスタム ──────────────────────────────────

test.describe("parseRetryAfter — opts.fallbackMs", () => {
  test("null のとき opts.fallbackMs が使われる", () => {
    expect(parseRetryAfter(null, { fallbackMs: 5_000 })).toBe(5_000);
  });

  test("パース失敗時に opts.fallbackMs が使われる", () => {
    expect(parseRetryAfter("not-a-number", { fallbackMs: 10_000 })).toBe(10_000);
  });

  test("過去の HTTP-date のとき opts.fallbackMs が使われる", () => {
    const past = new Date(Date.now() - ONE_HOUR_MS).toUTCString();
    expect(parseRetryAfter(past, { fallbackMs: 2_000 })).toBe(2_000);
  });
});

// ── opts.maxMs カスタム ───────────────────────────────────────

test.describe("parseRetryAfter — opts.maxMs", () => {
  test("delta-seconds が opts.maxMs を超えるとクランプされる", () => {
    // 120 秒 → maxMs=30000 → 30 秒
    expect(parseRetryAfter("120", { maxMs: 30_000 })).toBe(30_000);
  });

  test("delta-seconds が opts.maxMs 以内はそのまま返す", () => {
    expect(parseRetryAfter("10", { maxMs: 30_000 })).toBe(10_000);
  });

  test("未来の HTTP-date が opts.maxMs を超えるとクランプされる", () => {
    const future = new Date(Date.now() + 2 * ONE_HOUR_MS).toUTCString();
    const result = parseRetryAfter(future, { maxMs: ONE_HOUR_MS });
    expect(result).toBe(ONE_HOUR_MS);
  });
});

// ── HTTP-date 形式 ────────────────────────────────────────────

test.describe("parseRetryAfter — HTTP-date 形式", () => {
  test("opts.nowMs で基準時刻を固定できる", () => {
    const nowMs = Date.parse("2026-08-06T12:00:00Z");
    const header = "Thu, 06 Aug 2026 12:05:00 GMT";
    expect(parseRetryAfter(header, { nowMs })).toBe(5 * 60_000);
  });

  test("未来の HTTP-date → 残り時間のミリ秒（±2秒の誤差を許容）", () => {
    const future = new Date(Date.now() + ONE_HOUR_MS);
    const result = parseRetryAfter(future.toUTCString());
    expect(result).toBeGreaterThan(ONE_HOUR_MS - 2000);
    expect(result).toBeLessThanOrEqual(ONE_HOUR_MS);
  });

  test("過去の HTTP-date は fallbackMs を返す", () => {
    const past = new Date(Date.now() - ONE_HOUR_MS);
    expect(parseRetryAfter(past.toUTCString())).toBe(ONE_MINUTE_MS);
  });

  test("25 時間後の HTTP-date は 24 時間にクランプされる", () => {
    const farFuture = new Date(Date.now() + 25 * ONE_HOUR_MS);
    expect(parseRetryAfter(farFuture.toUTCString())).toBe(ONE_DAY_MS);
  });

  test("不正な日付文字列は fallbackMs を返す", () => {
    expect(parseRetryAfter("not-a-date")).toBe(ONE_MINUTE_MS);
  });

  test("数字でも日付でもない文字列は fallbackMs を返す", () => {
    expect(parseRetryAfter("abc xyz")).toBe(ONE_MINUTE_MS);
  });
});
