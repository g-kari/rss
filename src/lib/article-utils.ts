/** CJK 統合漢字・ひらがな・カタカナ・拡張A（読了速度判定用） */
const CJK_PATTERN = /[\u4e00-\u9fff\u3040-\u30ff\u3400-\u4dbf]/g;

/** 全角文字を含む広義の CJK（日本語判定用。全角英数記号 \uff00-\uffef を含む） */
const CJK_WIDE_PATTERN = /[\u4e00-\u9fff\u3040-\u30ff\u3400-\u4dbf\uff00-\uffef]/g;

/** HTML タグを除去してプレーンテキストを返す */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

/**
 * テキストが日本語（CJK 文字を一定割合以上含む）かどうかを判定する。
 * 自動翻訳のトリガー判断に使用する。
 * - 短すぎる文字列（20文字未満）は判定不能のため日本語扱いとする
 * - CJK 文字が全体の 3% 以上 → 日本語と判定
 */
export function isLikelyJapanese(text: string): boolean {
  const plain = stripHtml(text);
  if (plain.length < 20) return true;
  const cjk = (plain.match(CJK_WIDE_PATTERN) ?? []).length;
  return cjk / plain.length > 0.03;
}

/** 推定読了時間（分）。HTML タグを除去して文字数・語数から算出 */
export function readingTime(html: string): number {
  const text = stripHtml(html);
  if (!text) return 0;
  const cjk = (text.match(CJK_PATTERN) ?? []).length;
  const mins =
    cjk / text.length > 0.3
      ? Math.ceil(text.length / 400) // 日本語: 約400字/分
      : Math.ceil(text.split(/\s+/).filter(Boolean).length / 200); // 英語: 約200語/分
  return Math.max(1, mins);
}

/**
 * 記事が検索クエリにマッチするか判定する。
 * スペース区切りで複数ワード AND 検索。
 * title・summary のほか author・categories も対象とする。
 * クエリが空のときは常に true を返す。
 */
export function articleMatchesQuery(
  article: {
    title: string;
    summary: string;
    author?: string;
    categories?: string[];
  },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const terms = q.split(/\s+/).filter(Boolean);
  const titleL = article.title.toLowerCase();
  const summaryL = article.summary.toLowerCase();
  const authorL = (article.author ?? "").toLowerCase();
  const categoriesL = (article.categories ?? []).join(" ").toLowerCase();
  return terms.every(
    (t) =>
      titleL.includes(t) || summaryL.includes(t) || authorL.includes(t) || categoriesL.includes(t),
  );
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
