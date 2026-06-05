/** count を 0〜4 のレベルに変換（0=なし, 1=少, 2=中, 3=多, 4=最多）。ヒートマップのセル濃淡レベル算出用。 */
export function countToLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0 || max === 0) return 0;
  const ratio = count / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}
