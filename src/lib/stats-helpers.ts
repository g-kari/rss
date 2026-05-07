/** 読了統計計算用の純粋関数 */

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

/**
 * エントリリストと現在日時から weeklyTotal（今週 UTC 月曜以降のアクション数）を計算する。
 * READ_ACTIONS（fetch_full / open_original）のみカウントする。
 */
export function computeWeeklyTotal(
  entries: { timestamp: string; action: string }[],
  now: Date,
): number {
  const mondayIso = getMondayIso(now);
  const READ_ACTIONS = new Set(["fetch_full", "open_original"]);
  return entries.filter((e) => READ_ACTIONS.has(e.action) && e.timestamp >= mondayIso).length;
}
