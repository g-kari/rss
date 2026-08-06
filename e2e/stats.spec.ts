import { test, expect } from "@playwright/test";
import {
  toDateStr,
  buildDayList,
  getMondayIso,
  computeCurrentStreak,
  computeLongestStreak,
  countActiveReadingDays,
  findBestReadingDay,
  computeWeeklyTotal,
  buildReadingStatsSummary,
  buildReadingHistoryCsv,
  buildReadingHistoryCsvFile,
} from "../src/lib/stats-helpers";

test("buildReadingStatsSummary は主要指標を共有用テキストに整形する", () => {
  expect(
    buildReadingStatsSummary({
      weeklyTotal: 12,
      allTimeTotal: 345,
      currentStreak: 4,
      longestStreak: 21,
      exportedAt: new Date("2026-08-07T12:00:00Z"),
    }),
  ).toBe("読書統計 (2026-08-07)\n今週: 12件\n累計: 345件\n連続: 4日\n1年最長: 21日");

  expect(
    buildReadingStatsSummary({
      weeklyTotal: 2,
      allTimeTotal: 345,
      currentStreak: 1,
      longestStreak: 3,
      exportedAt: new Date("2026-08-07T12:00:00Z"),
      scope: "Tech Feed",
    }),
  ).toContain("対象: Tech Feed\n");
  expect(
    buildReadingStatsSummary({
      weeklyTotal: 2,
      allTimeTotal: 345,
      currentStreak: 1,
      longestStreak: 3,
      exportedAt: new Date("2026-08-07T12:00:00Z"),
      scope: "Tech Feed",
    }),
  ).toContain("累計（全体）: 345件");
  expect(
    buildReadingStatsSummary({
      weeklyTotal: 1,
      allTimeTotal: 2,
      currentStreak: 1,
      longestStreak: 1,
      exportedAt: new Date("2026-08-07T12:00:00Z"),
      scope: "  Feed\nName  ",
    }),
  ).toContain("対象: Feed Name\n");
});

test.describe("buildReadingHistoryCsv", () => {
  test("UTF-8 BOM と CRLF 付きで日別読了件数を入力順に出力する", () => {
    const csv = buildReadingHistoryCsv([
      { date: "2026-08-03", count: 2 },
      { date: "2026-08-04", count: 0 },
      { date: "2026-08-05", count: 5 },
    ]);

    expect(csv).toBe("\uFEFF日付,読了数\r\n2026-08-03,2\r\n2026-08-04,0\r\n2026-08-05,5\r\n");
  });

  test("空配列ではヘッダーだけの有効な CSV を返す", () => {
    expect(buildReadingHistoryCsv([])).toBe("\uFEFF日付,読了数\r\n");
  });

  test("エクスポート日を含むファイル名と CSV 本文を返す", () => {
    const result = buildReadingHistoryCsvFile(
      [{ date: "2026-08-05", count: 1 }],
      new Date("2026-08-05T03:00:00Z"),
    );

    expect(result.filename).toBe("reading-history_2026-08-05.csv");
    expect(result.content).toContain("2026-08-05,1");
  });

  test("フィードスコープを指定すると安全化した名前をファイル名に含める", () => {
    const result = buildReadingHistoryCsvFile(
      [{ date: "2026-08-05", count: 1 }],
      new Date("2026-08-05T03:00:00Z"),
      "feed/example title",
    );

    expect(result.filename).toBe("reading-history_feed_example_title_2026-08-05.csv");
  });
});

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

  test("days=0 以下では空配列を返す", () => {
    const now = new Date("2024-11-15T12:00:00Z");
    expect(buildDayList(now, 0)).toEqual([]);
    expect(buildDayList(now, -1)).toEqual([]);
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

  test("年をまたぐ連続日数を正しくカウントする", () => {
    // setUTCDate(d - 1) チェーンで 1/01 → 12/31 への前月繰り上がりが正しく動作するかを担保
    const now = new Date("2025-01-02T12:00:00Z");
    const activeDays = new Set(["2024-12-30", "2024-12-31", "2025-01-01", "2025-01-02"]);
    expect(computeCurrentStreak(activeDays, now)).toBe(4);
  });
});

test.describe("computeLongestStreak", () => {
  test("アクティブな日がない場合は 0 を返す", () => {
    expect(computeLongestStreak(new Set())).toBe(0);
  });

  test("複数の連続期間から最長の日数を返す", () => {
    const activeDays = new Set([
      "2026-07-01",
      "2026-07-02",
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
    ]);

    expect(computeLongestStreak(activeDays)).toBe(4);
  });

  test("入力順に依存せず最長の日数を返す", () => {
    const activeDays = new Set(["2026-08-05", "2026-08-03", "2026-08-04"]);

    expect(computeLongestStreak(activeDays)).toBe(3);
  });

  test("月と年をまたぐ連続日数を正しく数える", () => {
    const activeDays = new Set(["2024-12-30", "2024-12-31", "2025-01-01", "2025-01-02"]);

    expect(computeLongestStreak(activeDays)).toBe(4);
  });
});

test.describe("countActiveReadingDays", () => {
  test("空データでは 0 日を返す", () => {
    expect(countActiveReadingDays([])).toBe(0);
  });

  test("読了件数が正の値の日だけを数える", () => {
    expect(
      countActiveReadingDays([
        { date: "2026-08-01", count: 2 },
        { date: "2026-08-02", count: 0 },
        { date: "2026-08-03", count: 5 },
        { date: "2026-08-04", count: -1 },
      ]),
    ).toBe(2);
  });

  test("入力順に依存せず読書日数を返す", () => {
    expect(
      countActiveReadingDays([
        { date: "2026-08-05", count: 1 },
        { date: "2026-08-03", count: 4 },
        { date: "2026-08-04", count: 0 },
      ]),
    ).toBe(2);
  });
});

test.describe("findBestReadingDay", () => {
  test("空データでは null を返す", () => {
    expect(findBestReadingDay([])).toBeNull();
  });

  test("すべて 0 件の場合は null を返す", () => {
    expect(
      findBestReadingDay([
        { date: "2026-08-04", count: 0 },
        { date: "2026-08-05", count: 0 },
      ]),
    ).toBeNull();
  });

  test("最大読了件数の日付と件数を返す", () => {
    expect(
      findBestReadingDay([
        { date: "2026-08-03", count: 2 },
        { date: "2026-08-04", count: 7 },
        { date: "2026-08-05", count: 4 },
      ]),
    ).toEqual({ date: "2026-08-04", count: 7 });
  });

  test("最大件数が同じ場合は入力順に依存せず直近日を返す", () => {
    expect(
      findBestReadingDay([
        { date: "2026-08-05", count: 3 },
        { date: "2026-08-02", count: 8 },
        { date: "2026-08-04", count: 8 },
      ]),
    ).toEqual({ date: "2026-08-04", count: 8 });
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
