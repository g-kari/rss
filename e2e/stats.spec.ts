import { test, expect } from "@playwright/test";
import {
  toDateStr,
  buildDayList,
  getMondayIso,
  computeCurrentStreak,
  computeWeeklyTotal,
} from "../src/lib/stats-helpers";

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

test.describe("getMondayIso", () => {
  test("月曜日の場合はその日の 00:00:00 UTC を返す", () => {
    // 2024-11-11 は月曜
    const now = new Date("2024-11-11T15:00:00Z");
    expect(getMondayIso(now)).toBe("2024-11-11T00:00:00.000Z");
  });

  test("水曜日の場合は 2 日前の月曜を返す", () => {
    // 2024-11-13 は水曜
    const now = new Date("2024-11-13T08:00:00Z");
    expect(getMondayIso(now)).toBe("2024-11-11T00:00:00.000Z");
  });

  test("日曜日の場合は 6 日前の月曜を返す", () => {
    // 2024-11-17 は日曜
    const now = new Date("2024-11-17T23:59:59Z");
    expect(getMondayIso(now)).toBe("2024-11-11T00:00:00.000Z");
  });

  test("月をまたぐ場合も正しい月曜を返す", () => {
    // 2024-12-04 は水曜 → 月曜は 2024-12-02
    const now = new Date("2024-12-04T10:00:00Z");
    expect(getMondayIso(now)).toBe("2024-12-02T00:00:00.000Z");
  });

  test("年をまたぐ場合も正しい月曜を返す", () => {
    // 2025-01-01 は水曜 → 月曜は 2024-12-30
    const now = new Date("2025-01-01T12:00:00Z");
    expect(getMondayIso(now)).toBe("2024-12-30T00:00:00.000Z");
  });
});

test.describe("computeCurrentStreak", () => {
  test("アクティブな日がない場合は 0 を返す", () => {
    const now = new Date("2024-11-15T12:00:00Z");
    expect(computeCurrentStreak(new Set(), now)).toBe(0);
  });

  test("今日のみアクティブの場合は 1 を返す", () => {
    const now = new Date("2024-11-15T12:00:00Z");
    const activeDays = new Set(["2024-11-15"]);
    expect(computeCurrentStreak(activeDays, now)).toBe(1);
  });

  test("今日がアクティブでなく昨日のみの場合は 1 を返す", () => {
    const now = new Date("2024-11-15T12:00:00Z");
    const activeDays = new Set(["2024-11-14"]);
    expect(computeCurrentStreak(activeDays, now)).toBe(1);
  });

  test("連続 7 日アクティブの場合は 7 を返す", () => {
    const now = new Date("2024-11-15T12:00:00Z");
    const activeDays = new Set([
      "2024-11-09",
      "2024-11-10",
      "2024-11-11",
      "2024-11-12",
      "2024-11-13",
      "2024-11-14",
      "2024-11-15",
    ]);
    expect(computeCurrentStreak(activeDays, now)).toBe(7);
  });

  test("途中に空白日があるとその前で途切れる", () => {
    const now = new Date("2024-11-15T12:00:00Z");
    // 11/13 が欠けている → 11/14〜11/15 の 2 日のみ
    const activeDays = new Set(["2024-11-11", "2024-11-12", "2024-11-14", "2024-11-15"]);
    expect(computeCurrentStreak(activeDays, now)).toBe(2);
  });

  test("今日も昨日もアクティブでない場合は 0 を返す", () => {
    const now = new Date("2024-11-15T12:00:00Z");
    // 11/13 以前のみ
    const activeDays = new Set(["2024-11-10", "2024-11-11", "2024-11-12", "2024-11-13"]);
    expect(computeCurrentStreak(activeDays, now)).toBe(0);
  });

  test("月をまたぐ連続日数を正しくカウントする", () => {
    const now = new Date("2024-12-02T12:00:00Z");
    const activeDays = new Set(["2024-11-29", "2024-11-30", "2024-12-01", "2024-12-02"]);
    expect(computeCurrentStreak(activeDays, now)).toBe(4);
  });
});

test.describe("computeWeeklyTotal", () => {
  // 今週月曜 = 2024-11-11
  const now = new Date("2024-11-14T12:00:00Z"); // 木曜

  test("エントリがない場合は 0 を返す", () => {
    expect(computeWeeklyTotal([], now)).toBe(0);
  });

  test("今週の fetch_full / open_original のみカウントする", () => {
    const entries = [
      { timestamp: "2024-11-11T08:00:00Z", action: "fetch_full" },
      { timestamp: "2024-11-12T10:00:00Z", action: "open_original" },
      { timestamp: "2024-11-13T15:00:00Z", action: "fetch_full" },
    ];
    expect(computeWeeklyTotal(entries, now)).toBe(3);
  });

  test("先週のエントリは含まない", () => {
    const entries = [
      { timestamp: "2024-11-10T23:59:59Z", action: "fetch_full" }, // 先週日曜
      { timestamp: "2024-11-11T00:00:00Z", action: "fetch_full" }, // 今週月曜 00:00
    ];
    expect(computeWeeklyTotal(entries, now)).toBe(1);
  });

  test("ai_feedback や bookmark などは含まない", () => {
    const entries = [
      { timestamp: "2024-11-12T09:00:00Z", action: "bookmark" },
      { timestamp: "2024-11-12T09:00:00Z", action: "reading_list" },
      { timestamp: "2024-11-12T09:00:00Z", action: "ai_feedback" },
      { timestamp: "2024-11-12T09:00:00Z", action: "like" },
      { timestamp: "2024-11-12T09:00:00Z", action: "fetch_full" }, // これのみカウント
    ];
    expect(computeWeeklyTotal(entries, now)).toBe(1);
  });

  test("今週月曜 00:00:00Z ぴったりのエントリは含む", () => {
    const entries = [{ timestamp: "2024-11-11T00:00:00.000Z", action: "fetch_full" }];
    expect(computeWeeklyTotal(entries, now)).toBe(1);
  });

  test("日曜が今日の場合は 6 日前の月曜から集計する", () => {
    const sunday = new Date("2024-11-17T20:00:00Z"); // 日曜
    const entries = [
      { timestamp: "2024-11-11T00:00:00Z", action: "fetch_full" }, // 今週月曜
      { timestamp: "2024-11-10T23:59:59Z", action: "fetch_full" }, // 先週
    ];
    expect(computeWeeklyTotal(entries, sunday)).toBe(1);
  });
});
