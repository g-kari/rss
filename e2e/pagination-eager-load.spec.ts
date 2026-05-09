import { test, expect } from "@playwright/test";
import { shouldEagerLoad } from "../src/lib/pagination-eager-load";

test.describe("shouldEagerLoad (#636)", () => {
  test("sentinel が交差中 + hasMore → true", () => {
    expect(
      shouldEagerLoad({
        isIntersecting: true,
        isContentShort: false,
        hasMore: true,
        count: 0,
        max: 20,
      }),
    ).toBe(true);
  });

  test("コンテンツが短い + hasMore → true (sentinel に届かなくても発火)", () => {
    expect(
      shouldEagerLoad({
        isIntersecting: false,
        isContentShort: true,
        hasMore: true,
        count: 0,
        max: 20,
      }),
    ).toBe(true);
  });

  test("両方 true でも 1 回として発火 → true", () => {
    expect(
      shouldEagerLoad({
        isIntersecting: true,
        isContentShort: true,
        hasMore: true,
        count: 0,
        max: 20,
      }),
    ).toBe(true);
  });

  test("両方 false → false (発火しない)", () => {
    expect(
      shouldEagerLoad({
        isIntersecting: false,
        isContentShort: false,
        hasMore: true,
        count: 0,
        max: 20,
      }),
    ).toBe(false);
  });

  test("hasMore=false なら常に false (読み込み完了)", () => {
    expect(
      shouldEagerLoad({
        isIntersecting: true,
        isContentShort: true,
        hasMore: false,
        count: 0,
        max: 20,
      }),
    ).toBe(false);
  });

  test("count が max に到達したら false (暴走防止)", () => {
    expect(
      shouldEagerLoad({
        isIntersecting: true,
        isContentShort: true,
        hasMore: true,
        count: 20,
        max: 20,
      }),
    ).toBe(false);
  });

  test("count が max を超えても false", () => {
    expect(
      shouldEagerLoad({
        isIntersecting: true,
        isContentShort: false,
        hasMore: true,
        count: 25,
        max: 20,
      }),
    ).toBe(false);
  });

  test("count < max 境界 → 発火する", () => {
    expect(
      shouldEagerLoad({
        isIntersecting: true,
        isContentShort: false,
        hasMore: true,
        count: 19,
        max: 20,
      }),
    ).toBe(true);
  });
});
