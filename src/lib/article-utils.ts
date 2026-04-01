import type { DateRange, FontSize, Layout, SortOrder } from "../types";
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

export function compareByDateDesc(
  a: { publishedAt: string | null; createdAt: string },
  b: { publishedAt: string | null; createdAt: string },
): number {
  const aDate = a.publishedAt ?? a.createdAt;
  const bDate = b.publishedAt ?? b.createdAt;
  return bDate < aDate ? -1 : bDate > aDate ? 1 : 0;
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

export const LAYOUT_CYCLE: Layout[] = ["compact", "list", "card", "magazine"];
export const LAYOUT_LABELS: Record<Layout, string> = {
  compact: "コンパクト",
  list: "リスト",
  card: "カード",
  magazine: "マガジン",
};

export const SORT_ORDER_CYCLE: SortOrder[] = ["newest", "oldest"];
export const SORT_ORDER_LABELS: Record<SortOrder, string> = {
  newest: "新しい順",
  oldest: "古い順",
};

export const DATE_RANGE_CYCLE: DateRange[] = ["all", "today", "week", "month"];

/**
 * srcset 属性文字列の最後のエントリ（最高解像度）の URL を返す。
 * 例: "/api/image-proxy?url=...jpg 1x, /api/image-proxy?url=...jpg@2x 2x" → 後者の URL
 * srcset が空のときは空文字を返す。
 */
export function bestSrcFromSrcset(srcset: string): string {
  if (!srcset) return "";
  const last = srcset.split(",").at(-1)?.trim() ?? "";
  return last.split(/\s+/)[0] ?? "";
}

/** data: URI・重複・非 http/proxy URL を除外して収集対象かどうかを判定する */
function isCollectableUrl(src: string, seen: Set<string>): boolean {
  return (
    !!src &&
    !seen.has(src) &&
    !src.startsWith("data:") &&
    (src.startsWith("/api/image-proxy?") || src.startsWith("http"))
  );
}

/**
 * HTML 文字列から画像 URL を重複なしで抽出する。
 * useMemo など DOM 操作が不要なコンテキスト向け。
 *
 * - src 属性を優先し、data: の場合は srcset からフォールバック
 * - data: URI / 非 proxy・非絶対 URL は除外
 */
export function collectImageUrlsFromHtml(html: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const imgRe = /<img\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const attrs = m[1];
    let src = /\bsrc=["']([^"']+)["']/i.exec(attrs)?.[1] ?? "";
    if (!src || src.startsWith("data:")) {
      const srcset = /\bsrcset=["']([^"']+)["']/i.exec(attrs)?.[1] ?? "";
      src = bestSrcFromSrcset(srcset);
    }
    if (!isCollectableUrl(src, seen)) continue;
    seen.add(src);
    result.push(src);
  }
  return result;
}

/**
 * コンテナ内の全 img 要素から画像 URL を重複なしで抽出する。
 * live DOM（useImageDownload 等）向け。
 *
 * - live DOM では currentSrc（srcset 解決済み）を優先
 * - data: プレースホルダーは srcset からフォールバック
 * - data: URI / .svg / 非画像 URL は除外
 */
export function collectImageUrls(container: Element, seen?: Set<string>): string[] {
  const s = seen ?? new Set<string>();
  const result: string[] = [];
  for (const img of container.querySelectorAll("img")) {
    let src = (img as HTMLImageElement).currentSrc || img.getAttribute("src") || "";
    if (!src || src.startsWith("data:")) {
      src = bestSrcFromSrcset(img.getAttribute("srcset") ?? "");
    }
    if (!isCollectableUrl(src, s)) continue;
    s.add(src);
    result.push(src);
  }
  return result;
}

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
