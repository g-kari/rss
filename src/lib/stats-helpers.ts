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
