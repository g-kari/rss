/** 読了統計計算用の純粋関数 */

/**
 * 統計に「読了」としてカウントするエンゲージメントアクション。
 * `computeWeeklyTotal` / `aggregateStatsForFeed` から共通参照される。
 */
export const READ_ACTIONS: ReadonlySet<string> = new Set(["fetch_full", "open_original"]);

const READING_HISTORY_CSV_HEADER = "日付,読了数";

/** 過去の読了件数を UTF-8 BOM + CRLF の CSV に変換する。 */
export function buildReadingHistoryCsv(
  dailyReadCounts: readonly { date: string; count: number }[],
): string {
  const lines = [
    READING_HISTORY_CSV_HEADER,
    ...dailyReadCounts.map(({ date, count }) => `${date},${count}`),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** 読書履歴 CSV の本文とエクスポート日入りファイル名を組み立てる。 */
export function buildReadingHistoryCsvFile(
  dailyReadCounts: readonly { date: string; count: number }[],
  exportedAt: Date,
): { content: string; filename: string } {
  return {
    content: buildReadingHistoryCsv(dailyReadCounts),
    filename: `reading-history_${exportedAt.toISOString().slice(0, 10)}.csv`,
  };
}

/** ISO 8601 文字列から "YYYY-MM-DD" 部分を返す */
export function toDateStr(ts: string): string {
  return ts.slice(0, 10);
}

/** `now` から過去 `days` 日分の日付文字列配列を昇順で返す（末尾が today） */
export function buildDayList(now: Date, days: number): string[] {
  const result: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    result.push(toDateStr(d.toISOString()));
  }
  return result;
}

/**
 * 今週（UTC 月曜始まり）の開始 ISO 文字列を返す。
 * weeklyTotal の判定に使用する（`entry.timestamp >= mondayIso` で比較）。
 */
export function getMondayIso(now: Date): string {
  const dayOfWeek = now.getUTCDay(); // 0=Sun
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() - daysFromMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString();
}

/**
 * アクティブな日付文字列の Set と現在日時から連続活動日数（streak）を計算する。
 * 今日活動がなければ昨日から遡る。
 */
export function computeCurrentStreak(activeDays: Set<string>, now: Date): number {
  const todayStr = toDateStr(now.toISOString());
  let streak = 0;
  const checkDate = new Date(now);
  if (!activeDays.has(todayStr)) checkDate.setUTCDate(checkDate.getUTCDate() - 1);
  while (activeDays.has(toDateStr(checkDate.toISOString()))) {
    streak++;
    checkDate.setUTCDate(checkDate.getUTCDate() - 1);
  }
  return streak;
}

/** アクティブな日付文字列の Set から最長連続活動日数を計算する。 */
export function computeLongestStreak(activeDays: ReadonlySet<string>): number {
  const dayMs = 24 * 60 * 60 * 1000;
  const timestamps = [...activeDays]
    .map((day) => Date.parse(`${day}T00:00:00Z`))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  let longest = 0;
  let current = 0;
  let previous: number | undefined;

  for (const timestamp of timestamps) {
    current = previous !== undefined && timestamp === previous + dayMs ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = timestamp;
  }

  return longest;
}

/**
 * エントリリストと現在日時から weeklyTotal（今週 UTC 月曜以降のアクション数）を計算する。
 * READ_ACTIONS（fetch_full / open_original）のみカウントする。
 */
export function computeWeeklyTotal(
  entries: { timestamp: string; action: string }[],
  now: Date,
): number {
  const mondayIso = getMondayIso(now);
  return entries.filter((e) => READ_ACTIONS.has(e.action) && e.timestamp >= mondayIso).length;
}

/**
 * 特定フィード向けに dailyReadCounts (7日) / yearlyHeatmap (365日) / weeklyTotal を集計する純粋関数。
 * READ_ACTIONS（fetch_full / open_original）のみカウントする。
 *
 * 注意: ここで返す weeklyTotal は READ_ACTIONS のみの集計のため、
 * `app/api/stats/route.ts` 側の topFeeds スコア（ai_feedback を除く全アクション集計）とは定義が異なる。
 */
export function aggregateStatsForFeed(
  entries: { feedHash: string; action: string; timestamp: string }[],
  feedHash: string,
  now: Date,
): {
  dailyReadCounts: { date: string; count: number }[];
  yearlyHeatmap: { date: string; count: number }[];
  weeklyTotal: number;
} {
  const filtered = entries.filter((e) => e.feedHash === feedHash && READ_ACTIONS.has(e.action));

  const dailyMap = new Map<string, number>();
  const yearlyMap = new Map<string, number>();
  for (const e of filtered) {
    const day = toDateStr(e.timestamp);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
    yearlyMap.set(day, (yearlyMap.get(day) ?? 0) + 1);
  }

  const dailyReadCounts = buildDayList(now, 7).map((date) => ({
    date,
    count: dailyMap.get(date) ?? 0,
  }));
  const yearlyHeatmap = buildDayList(now, 365).map((date) => ({
    date,
    count: yearlyMap.get(date) ?? 0,
  }));
  const weeklyTotal = computeWeeklyTotal(filtered, now);

  return { dailyReadCounts, yearlyHeatmap, weeklyTotal };
}
