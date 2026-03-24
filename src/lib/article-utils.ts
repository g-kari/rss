/** 推定読了時間（分）。HTML タグを除去して文字数・語数から算出 */
export function readingTime(html: string): number {
  const text = html.replace(/<[^>]+>/g, '').trim();
  if (!text) return 0;
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\u3400-\u4dbf]/g) ?? []).length;
  const mins =
    cjk / text.length > 0.3
      ? Math.ceil(text.length / 400) // 日本語: 約400字/分
      : Math.ceil(text.split(/\s+/).filter(Boolean).length / 200); // 英語: 約200語/分
  return Math.max(1, mins);
}
