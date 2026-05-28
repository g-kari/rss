import { test, expect } from "@playwright/test";
import {
  equalDigestLimitMap,
  equalStringMap,
  equalCompiledFilterMap,
} from "../src/lib/article-filter-equality";
import type { CompiledKeywordFilter } from "../src/lib/keyword-filter";

/**
 * `src/lib/article-filter-equality.ts` の構造的等価判定純粋関数群の TDD spec。
 * 旧 `useFilteredArticles.ts` 内 inline 定義から canonical lib pattern
 * (`unread-stats-merge.ts` / `read-state-merge.ts`) に切り出した sweep。
 */

test.describe("equalDigestLimitMap", () => {
  test("同一 reference は true", () => {
    const m = new Map([["a", 5]]);
    expect(equalDigestLimitMap(m, m)).toBe(true);
  });

  test("空 Map 同士は true", () => {
    expect(equalDigestLimitMap(new Map(), new Map())).toBe(true);
  });

  test("内容が同じ別 reference は true", () => {
    const a = new Map([
      ["x", 3],
      ["y", 7],
    ]);
    const b = new Map([
      ["x", 3],
      ["y", 7],
    ]);
    expect(equalDigestLimitMap(a, b)).toBe(true);
  });

  test("size が違うと false", () => {
    const a = new Map([["x", 3]]);
    const b = new Map([
      ["x", 3],
      ["y", 7],
    ]);
    expect(equalDigestLimitMap(a, b)).toBe(false);
  });

  test("値が違うと false", () => {
    const a = new Map([["x", 3]]);
    const b = new Map([["x", 4]]);
    expect(equalDigestLimitMap(a, b)).toBe(false);
  });

  test("キーが違うと false", () => {
    const a = new Map([["x", 3]]);
    const b = new Map([["y", 3]]);
    expect(equalDigestLimitMap(a, b)).toBe(false);
  });
});

test.describe("equalStringMap", () => {
  test("同一 reference は true", () => {
    const m = new Map([["a", "x"]]);
    expect(equalStringMap(m, m)).toBe(true);
  });

  test("内容が同じ別 reference は true", () => {
    const a = new Map([
      ["a", "x"],
      ["b", "y"],
    ]);
    const b = new Map([
      ["a", "x"],
      ["b", "y"],
    ]);
    expect(equalStringMap(a, b)).toBe(true);
  });

  test("値が違うと false", () => {
    const a = new Map([["a", "x"]]);
    const b = new Map([["a", "y"]]);
    expect(equalStringMap(a, b)).toBe(false);
  });

  test("size が違うと false", () => {
    const a = new Map([["a", "x"]]);
    const b = new Map([
      ["a", "x"],
      ["b", "y"],
    ]);
    expect(equalStringMap(a, b)).toBe(false);
  });
});

test.describe("equalCompiledFilterMap", () => {
  // CompiledKeywordFilter は internal interface のため最小限の構造で mock する。
  const mockFilter1 = {
    compiled: { include: [], exclude: [] },
  } as unknown as CompiledKeywordFilter;
  const mockFilter2 = {
    compiled: { include: [], exclude: [] },
  } as unknown as CompiledKeywordFilter;

  test("同一 reference は true", () => {
    const m = new Map([["a", mockFilter1]]);
    expect(equalCompiledFilterMap(m, m)).toBe(true);
  });

  test("同じ filter reference を含む別 Map は true", () => {
    const a = new Map([["a", mockFilter1]]);
    const b = new Map([["a", mockFilter1]]);
    expect(equalCompiledFilterMap(a, b)).toBe(true);
  });

  test("filter reference が異なれば false (buildFilterMap の cache miss を表現)", () => {
    const a = new Map([["a", mockFilter1]]);
    const b = new Map([["a", mockFilter2]]);
    expect(equalCompiledFilterMap(a, b)).toBe(false);
  });

  test("size が違うと false", () => {
    const a = new Map([["a", mockFilter1]]);
    const b = new Map([
      ["a", mockFilter1],
      ["b", mockFilter2],
    ]);
    expect(equalCompiledFilterMap(a, b)).toBe(false);
  });
});
