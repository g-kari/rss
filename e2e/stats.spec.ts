import { test, expect } from "@playwright/test";
import { toDateStr, buildDayList } from "../src/lib/stats-helpers";

test.describe("toDateStr", () => {
  test("ISO 8601 の先頭 10 文字を返す", () => {
    expect(toDateStr("2024-11-01T12:34:56Z")).toBe("2024-11-01");
  });

  test("midnight UTC も正しく切り出す", () => {
    expect(toDateStr("2024-11-01T00:00:00.000Z")).toBe("2024-11-01");
  });
});

test.describe("buildDayList", () => {
  test("days=1 のとき今日だけ返す", () => {
    const now = new Date("2024-11-15T12:00:00Z");
    const result = buildDayList(now, 1);
    expect(result).toEqual(["2024-11-15"]);
  });

  test("days=3 のとき 3 日分を昇順で返す", () => {
    const now = new Date("2024-11-15T12:00:00Z");
    const result = buildDayList(now, 3);
    expect(result).toEqual(["2024-11-13", "2024-11-14", "2024-11-15"]);
  });

  test("月をまたぐ場合も正しい日付を返す", () => {
    const now = new Date("2024-12-02T00:00:00Z");
    const result = buildDayList(now, 4);
    expect(result).toEqual(["2024-11-29", "2024-11-30", "2024-12-01", "2024-12-02"]);
  });

  test("年をまたぐ場合も正しい日付を返す", () => {
    const now = new Date("2025-01-02T00:00:00Z");
    const result = buildDayList(now, 3);
    expect(result).toEqual(["2024-12-31", "2025-01-01", "2025-01-02"]);
  });

  test("days=7 のとき 7 要素の配列を返す", () => {
    const now = new Date("2024-11-15T12:00:00Z");
    expect(buildDayList(now, 7)).toHaveLength(7);
  });

  test("days=365 のとき 365 要素の配列を返す", () => {
    const now = new Date("2024-11-15T12:00:00Z");
    expect(buildDayList(now, 365)).toHaveLength(365);
  });

  test("リストの末尾が today になる", () => {
    const now = new Date("2024-11-15T23:59:59Z");
    const result = buildDayList(now, 10);
    expect(result[result.length - 1]).toBe("2024-11-15");
  });

  test("リストは昇順（古い日が先）", () => {
    const now = new Date("2024-11-15T12:00:00Z");
    const result = buildDayList(now, 5);
    for (let i = 1; i < result.length; i++) {
      expect(result[i] > result[i - 1]).toBe(true);
    }
  });
});
