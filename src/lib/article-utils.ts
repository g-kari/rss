/**
 * テキストが日本語（CJK 文字を一定割合以上含む）かどうかを判定する。
 * 自動翻訳のトリガー判断に使用する。
 * - 短すぎる文字列（20文字未満）は判定不能のため日本語扱いとする
 * - CJK 文字が全体の 3% 以上 → 日本語と判定
 */
export function isLikelyJapanese(text: string): boolean {
  const plain = text.replace(/<[^>]+>/g, "").trim();
  if (plain.length < 20) return true;
  const cjk = (plain.match(/[\u4e00-\u9fff\u3040-\u30ff\u3400-\u4dbf\uff00-\uffef]/g) ?? []).length;
  return cjk / plain.length > 0.03;
}

/** 推定読了時間（分）。HTML タグを除去して文字数・語数から算出 */
export function readingTime(html: string): number {
  const text = html.replace(/<[^>]+>/g, "").trim();
  if (!text) return 0;
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\u3400-\u4dbf]/g) ?? []).length;
  const mins =
    cjk / text.length > 0.3
      ? Math.ceil(text.length / 400) // 日本語: 約400字/分
      : Math.ceil(text.split(/\s+/).filter(Boolean).length / 200); // 英語: 約200語/分
  return Math.max(1, mins);
}

/**
 * ISO 日時文字列を「〇分前」形式の相対時間に変換する。
 * - 未来日時（時計のズレ等）は「たった今」として扱う
 * - 1分未満は「たった今」
 * - 1時間未満は「〇分前」
 * - 24時間未満は「〇時間前」
 * - 7日未満は「〇日前」
 * - それ以上は「M月D日」形式
 */
export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "たった今";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}日前`;
  return new Date(iso).toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}
