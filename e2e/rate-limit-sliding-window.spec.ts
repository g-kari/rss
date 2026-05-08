import { test, expect } from "@playwright/test";
import { evaluateSlidingWindow } from "../src/lib/rate-limit-logic";

test.describe("evaluateSlidingWindow — 通過/拒否判定", () => {
  test("空配列の初回呼び出しは許可・recent に now が追加される", () => {
    const now = 1_000_000;
    const r = evaluateSlidingWindow(now, [], 60_000, 3);
    expect(r.allowed).toBe(true);
    expect(r.recent).toEqual([now]);
    expect(r.retryAfterSec).toBeUndefined();
  });

  test("window 内呼び出しが maxCalls 未満なら許可", () => {
    const now = 1_000_000;
    const stored = [now - 10_000, now - 20_000]; // 2 件
    const r = evaluateSlidingWindow(now, stored, 60_000, 3);
    expect(r.allowed).toBe(true);
    expect(r.recent).toEqual([now - 10_000, now - 20_000, now]);
  });

  test("window 内呼び出しが maxCalls ちょうどなら拒否", () => {
    const now = 1_000_000;
    const stored = [now - 10_000, now - 20_000, now - 30_000]; // 3 件、maxCalls=3
    const r = evaluateSlidingWindow(now, stored, 60_000, 3);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
    expect(r.retryAfterSec).toBeLessThanOrEqual(60);
  });

  test("window 内呼び出しが maxCalls 超過でも拒否（recent は now 追加なし）", () => {
    const now = 1_000_000;
    const stored = [now - 5_000, now - 10_000, now - 15_000, now - 20_000]; // 4 件、maxCalls=3
    const r = evaluateSlidingWindow(now, stored, 60_000, 3);
    expect(r.allowed).toBe(false);
    expect(r.recent).not.toContain(now);
    expect(r.recent.length).toBe(4);
  });

  test("window 外の古い呼び出しは無視される", () => {
    const now = 1_000_000;
    const stored = [now - 70_000, now - 80_000, now - 5_000]; // 60s window 内は 1 件
    const r = evaluateSlidingWindow(now, stored, 60_000, 3);
    expect(r.allowed).toBe(true);
    // window 外の呼び出しは recent に含まれない
    expect(r.recent).not.toContain(now - 70_000);
    expect(r.recent).not.toContain(now - 80_000);
    expect(r.recent).toContain(now);
    expect(r.recent).toContain(now - 5_000);
  });

  test("window 境界 (now - windowMs ぴったり) は window 外として扱う", () => {
    const now = 1_000_000;
    // now - 60_000 は now - windowMs ぴったり → t < window 判定で除外される
    const stored = [now - 60_000, now - 60_001];
    const r = evaluateSlidingWindow(now, stored, 60_000, 3);
    expect(r.allowed).toBe(true);
    expect(r.recent).toEqual([now]); // どちらも window 外で除外
  });
});

test.describe("evaluateSlidingWindow — Retry-After 算出", () => {
  test("最も古い呼び出しが window から外れるまでの時間を秒で返す", () => {
    const now = 1_000_000;
    // 最古は 30 秒前 → window 60 秒なのであと 30 秒で外れる
    const stored = [now - 10_000, now - 20_000, now - 30_000];
    const r = evaluateSlidingWindow(now, stored, 60_000, 3);
    expect(r.allowed).toBe(false);
    // 60_000 - 30_000 = 30_000 ms → 30 秒
    expect(r.retryAfterSec).toBe(30);
  });

  test("最古がほぼ now の場合、Retry-After は windowMs に近い", () => {
    const now = 1_000_000;
    const stored = [now, now - 100, now - 200]; // 全部直近
    const r = evaluateSlidingWindow(now, stored, 60_000, 3);
    expect(r.allowed).toBe(false);
    // 60_000 - 0 = 60_000 ms → 60 秒
    expect(r.retryAfterSec).toBe(60);
  });
});

test.describe("evaluateSlidingWindow — エッジケース", () => {
  test("maxCalls=0 なら常に拒否", () => {
    const now = 1_000_000;
    const r = evaluateSlidingWindow(now, [], 60_000, 0);
    expect(r.allowed).toBe(false);
    // 空配列で拒否時の retryAfterSec は windowMs/1000 = 60 秒（最大値相当）
    expect(r.retryAfterSec).toBe(60);
  });

  test("stored が空でも maxCalls=1 なら 1 回目は許可", () => {
    const now = 1_000_000;
    const r = evaluateSlidingWindow(now, [], 60_000, 1);
    expect(r.allowed).toBe(true);
    expect(r.recent).toEqual([now]);
  });
});
