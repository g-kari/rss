import type {
  Article,
  DateRange,
  FontFamily,
  FontSize,
  Layout,
  ReadingTimeRange,
  SortOrder,
} from "../types";
import { stripHtml } from "./html";

/** CJK 統合漢字・ひらがな・カタカナ・拡張A（読了速度判定用） */
const CJK_PATTERN = /[\u4e00-\u9fff\u3040-\u30ff\u3400-\u4dbf]/g;

/** 全角文字を含む広義の CJK（日本語判定用。全角英数記号 \uff00-\uffef を含む） */
const CJK_WIDE_PATTERN = /[\u4e00-\u9fff\u3040-\u30ff\u3400-\u4dbf\uff00-\uffef]/g;

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

/**
 * 推定読了時間（分）。HTML タグを除去して文字数・語数から算出。
 * 日本語（CJK）と英語を個別に計算して合算することで、日英混在記事でも正確な推定を実現する。
 * - 日本語黙読: 約500字/分
 * - 英語黙読: 約200語/分
 */
export function readingTime(html: string): number {
  const text = stripHtml(html);
  if (!text) return 0;
  const cjkChars = (text.match(CJK_PATTERN) ?? []).length;
  // CJK 文字を空白に置換して英語の語数を算出（CJK が英語カウントに混入しないよう除去）
  const enWords = text.replace(CJK_PATTERN, " ").split(/\s+/).filter(Boolean).length;
  const mins = cjkChars / 500 + enWords / 200;
  return Math.max(1, Math.ceil(mins));
}

/**
 * publishedAt（なければ createdAt にフォールバック）で降順比較。
 * Array.prototype.sort のコンパレータとして使用する。
 * publishedAt が null のアイテムは createdAt を基準に並ぶ。
 */
export function compareByDateDesc(
  a: { publishedAt: string | null; createdAt: string; id?: string },
  b: { publishedAt: string | null; createdAt: string; id?: string },
): number {
  const aDate = a.publishedAt ?? a.createdAt;
  const bDate = b.publishedAt ?? b.createdAt;
  if (bDate < aDate) return -1;
  if (bDate > aDate) return 1;
  // 同日付の場合は id で安定ソート（id は sha256 由来の決定論的な値）
  if (a.id && b.id) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return 0;
}

/** publishedAt のみを持つオブジェクト（ParsedItem 等）の降順比較。null は末尾 */
export function compareByPublishedAtDesc(
  a: { publishedAt: string | null },
  b: { publishedAt: string | null },
): number {
  const ap = a.publishedAt ?? "";
  const bp = b.publishedAt ?? "";
  return bp > ap ? 1 : bp < ap ? -1 : 0;
}

/**
 * サイクル配列の次の値を返す。
 * 末尾の次は先頭に戻る（ループ）。
 */
export function cycleValue<T>(cycle: readonly T[], current: T): T {
  return cycle[(cycle.indexOf(current) + 1) % cycle.length];
}

export const FONT_SIZE_CYCLE: FontSize[] = ["small", "medium", "large"];
export const FONT_SIZE_LABELS: Record<FontSize, string> = {
  small: "小",
  medium: "中",
  large: "大",
};

/** 記事本文に適用する Tailwind クラス（ArticleView / UserSettingsModal で共有） */
export const FONT_SIZE_CLASSES: Record<FontSize, string> = {
  small: "text-[14px] leading-[1.75]",
  medium: "text-[16px] leading-[1.9]",
  large: "text-[19px] leading-[2.0]",
};

export const FONT_FAMILY_CYCLE: FontFamily[] = ["sans", "serif", "mono"];
export const FONT_FAMILY_LABELS: Record<FontFamily, string> = {
  sans: "サンセリフ",
  serif: "セリフ",
  mono: "等幅",
};

export const FONT_FAMILY_CLASSES: Record<FontFamily, string> = {
  sans: "font-sans",
  serif: "font-serif",
  mono: "font-mono",
};

export const LAYOUT_CYCLE: Layout[] = ["compact", "list", "card", "magazine", "gallery"];
export const LAYOUT_LABELS: Record<Layout, string> = {
  compact: "コンパクト",
  list: "リスト",
  card: "カード",
  magazine: "マガジン",
  gallery: "ギャラリー",
};

export const SORT_ORDER_CYCLE: SortOrder[] = ["newest", "oldest"];
export const SORT_ORDER_LABELS: Record<SortOrder, string> = {
  newest: "新しい順",
  oldest: "古い順",
};

export const DATE_RANGE_CYCLE: DateRange[] = ["all", "today", "week", "month"];

export const READING_TIME_RANGE_CYCLE: ReadingTimeRange[] = ["all", "short", "medium", "long"];
export const READING_TIME_RANGE_LABELS: Record<ReadingTimeRange, string> = {
  all: "時間",
  short: "〜5分",
  medium: "〜15分",
  long: "15分〜",
};

export const DATE_RANGE_LABELS: Record<DateRange, string> = {
  all: "全期間",
  today: "今日",
  week: "今週",
  month: "今月",
};

/**
 * 日付範囲の開始日を返す。"all" の場合は null。
 * - today: 今日の 00:00:00
 * - week: 7 日前
 * - month: 1 ヶ月前
 */
export function getDateRangeStart(range: DateRange): Date | null {
  if (range === "all") return null;
  const now = new Date();
  if (range === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (range === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  // month
  const d = new Date(now);
  d.setMonth(d.getMonth() - 1);
  return d;
}

/**
 * ISO 日時文字列を「〇分前」形式の相対時間に変換する。
 * - 未来日時（時計のズレ等）は「たった今」として扱う
 * - 1分未満は「たった今」
 * - 1時間未満は「〇分前」
 * - 24時間未満は「〇時間前」
 * - 7日未満は「〇日前」
 * - 同一年: 「M月D日」形式
 * - 異なる年: 「YYYY年M月D日」形式（年が明確になるよう年を付与）
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
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("ja-JP", {
    ...(sameYear ? {} : { year: "numeric" }),
    month: "short",
    day: "numeric",
  });
}

/** 未読カウントを表示用文字列に変換する（100以上は "99+" と表示） */
export function formatCount(n: number): string {
  return n > 99 ? "99+" : String(n);
}

/** OGP キャッシュ → フィード画像 → YouTube URL の順でサムネイルを解決 */
export function resolveThumbnail(
  article: Article,
  ogpCache: Record<string, string>,
): string | undefined {
  // OGP 画像を優先（実際のページメタデータから取得した画像）
  if (article.link && ogpCache[article.link]) return ogpCache[article.link];
  if (article.ogImage) return article.ogImage;
  const yt = article.link?.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  if (yt) return `https://i.ytimg.com/vi/${yt[1]}/mqdefault.jpg`;
  return undefined;
}
