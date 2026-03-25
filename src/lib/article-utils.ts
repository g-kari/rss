/**
 * テキストが日本語（CJK 文字を一定割合以上含む）かどうかを判定する。
 * 自動翻訳のトリガー判断に使用する。
 * - 短すぎる文字列（20文字未満）は判定不能のため日本語扱いとする
 * - CJK 文字が全体の 3% 以上 → 日本語と判定
 */
export function isLikelyJapanese(text: string): boolean {
  const plain = text.replace(/<[^>]+>/g, '').trim();
  if (plain.length < 20) return true;
  const cjk = (plain.match(/[\u4e00-\u9fff\u3040-\u30ff\u3400-\u4dbf\uff00-\uffef]/g) ?? []).length;
  return cjk / plain.length > 0.03;
}

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
