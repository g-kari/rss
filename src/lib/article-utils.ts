import type {
  Article,
  DateRange,
  FontFamily,
  FontSize,
  Layout,
  ReadingTimeRange,
  SortOrder,
} from "../types";
import { stripHtml, toPlainText } from "./html";
import { extractYouTubeVideoId } from "./youtube";

/**
 * `isStoredContentJapanese` で参照する HTML 本文先頭の sample char 数。
 *
 * 200 char だと英文 abstract / byline を含む記事冒頭で日本語判定 false → 自動翻訳誤発動 / TTS 言語選定誤り
 * が起きる罠を防ぐため、canonical (`browser-translator.ts#detectSourceLanguage`) の 500 char sample に統一。
 */
const JAPANESE_SAMPLE_CHARS = 500;

/** CJK 統合漢字・ひらがな・カタカナ・拡張A（読了速度判定用） */
const CJK_PATTERN = /[\u4e00-\u9fff\u3040-\u30ff\u3400-\u4dbf]/g;

/** 全角文字を含む広義の CJK（日本語判定用。全角英数記号 \uff00-\uffef を含む） */
const CJK_WIDE_PATTERN = /[\u4e00-\u9fff\u3040-\u30ff\u3400-\u4dbf\uff00-\uffef]/g;

function countMatches(text: string, pattern: RegExp): number {
  let count = 0;
  for (const _match of text.matchAll(pattern)) count++;
  return count;
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
  const cjk = countMatches(plain, CJK_WIDE_PATTERN);
  return cjk / plain.length > 0.03;
}

/**
 * storedContent (HTML) を `toPlainText` + 先頭 `JAPANESE_SAMPLE_CHARS` で sampling してから
 * `isLikelyJapanese` 判定するヘルパー。useArticleViewShortcuts / useArticleViewState の sibling drift 解消。
 *
 * `null` / 空文字列は `false` を返す (= 日本語でないとして扱う、自動翻訳 trigger スキップ条件)。
 */
export function isStoredContentJapanese(storedContent: string | null | undefined): boolean {
  if (!storedContent) return false;
  return isLikelyJapanese(toPlainText(storedContent).slice(0, JAPANESE_SAMPLE_CHARS));
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
  const cjkChars = countMatches(text, CJK_PATTERN);
  // CJK 文字を空白に置換して英語の語数を算出（CJK が英語カウントに混入しないよう除去）
  const englishText = text.replace(CJK_PATTERN, " ").trim();
  const enWords = englishText ? englishText.split(/\s+/).length : 0;
  const mins = cjkChars / 500 + enWords / 200;
  return Math.max(1, Math.ceil(mins));
}

/**
 * 記事の代表タイムスタンプ（ISO 文字列）を返す。publishedAt を優先し、null なら createdAt に
 * フォールバックする。`isArticleRead` (article-filter.ts) / `pruneOldReadIds` (read-state-prune.ts) /
 * `filterExpiredArticles` (article-ttl.ts) / `compareByDateDesc` など「記事の日時を判定軸にする
 * sibling 純粋関数」はすべてこの fallback chain を共有し、publishedAt が null の手動保存記事
 * (`feedHash: "__saved__"`) や RSS で publishedAt 抜けの記事で挙動が乖離しないようにする
 * (fallback-derivation.md「sibling 純粋関数は fallback chain を完全に揃える」)。
 */
export function getArticleTimestamp(article: {
  publishedAt: string | null;
  createdAt: string;
}): string {
  return article.publishedAt ?? article.createdAt;
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
  const aDate = getArticleTimestamp(a);
  const bDate = getArticleTimestamp(b);
  if (bDate < aDate) return -1;
  if (bDate > aDate) return 1;
  // 同日付の場合は id で安定ソート（id は sha256 由来の決定論的な値）
  if (a.id && b.id) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return 0;
}

/** publishedAt のみを持つオブジェクト（ParsedItem 等）の降順比較。null は末尾 */
/**
 * `ParsedItem` (xml-parser) など `createdAt` を持たない型を sort する用途。
 * `compareByDateDesc` (`Article` 向け) と異なり fallback chain は `publishedAt ?? ""` のみで
 * `createdAt` fallback と id tiebreak を意図的に持たない。`ParsedItem` 型に `createdAt` が
 * 存在しないため (#862 Finding A 案 A)、規範違反ではなく意図的相違として明文化している。
 * RSS parse 直後の上限切り捨て (`fetchAndParseFeed` の `FEED_MAX_ITEMS` 超え時 sort) など、
 * `publishedAt` だけで安定降順すれば十分なケースで使う。
 */
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
  if (cycle.length === 0) throw new Error("cycle must not be empty");
  const currentIndex = cycle.indexOf(current);
  if (currentIndex < 0) return cycle[0];
  return cycle[(currentIndex + 1) % cycle.length];
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

export const SORT_ORDER_CYCLE: SortOrder[] = ["newest", "oldest", "readingTimeAsc"];
export const SORT_ORDER_LABELS: Record<SortOrder, string> = {
  newest: "新しい順",
  oldest: "古い順",
  readingTimeAsc: "読了時間順",
};

export const DATE_RANGE_CYCLE: DateRange[] = ["all", "today", "week", "month", "year"];

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
  year: "過去1年",
};

/**
 * 日付範囲の開始日を返す。"all" の場合は null。
 * - today: 今日の 00:00:00
 * - week: 7 日前
 * - month: 1 ヶ月前
 * - year: 1 年前
 */
export function getDateRangeStart(range: DateRange, now = new Date()): Date | null {
  if (range === "all") return null;
  if (range === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (range === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (range === "month") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    return d;
  }
  // year
  const d = new Date(now);
  d.setFullYear(d.getFullYear() - 1);
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
export function timeAgo(iso: string | null, now = new Date()): string {
  if (!iso) return "";
  // 不正 date (corrupt R2 lastErrorAt 等) は toLocaleDateString が "Invalid Date" を
  // 表示してしまうため、空文字で返す (#811/#812 の unknown 受け defensive と同方針)。
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = now.getTime() - t;
  if (diff < 60_000) return "たった今";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}日前`;
  const d = new Date(iso);
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("ja-JP", {
    ...(sameYear ? {} : { year: "numeric" }),
    month: "short",
    day: "numeric",
  });
}

/** 未読カウントを表示用文字列に変換する（100以上は "99+" と表示） */
export function formatCount(n: number): string {
  if (Number.isNaN(n) || n < 0) return "0";
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
  const videoId = article.link ? extractYouTubeVideoId(article.link) : null;
  if (videoId) return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
  return undefined;
}

/**
 * 記事の読了時間 (分) をメモ化付きで返すキャッシュインスタンスを作成する (#685)。
 *
 * `readingTime()` は内部で `stripHtml()` を呼び、これは正規表現を 8 回まで反復実行する
 * 重い処理。記事フィルター (`matchesReadingTimeRange`) はフィルター条件変更や記事リスト
 * 更新のたびに全記事に対して再計算するため、500+ 記事 × 5-15KB HTML × 8 regex pass で
 * 体感ラグになる。
 *
 * 使い方:
 * ```typescript
 * const cache = useMemo(() => createReadingTimeCache(), [readingTimeRange]);
 * // ↑ #746: deps に articles を含めない。`mergeUniqueArticles` (#693) の immutability 契約により
 * //   既存 article object identity が polling 横断で保たれるため、article.id ベースの cache は
 * //   articles reference 変化で破棄する必要なし (5 分 polling での無用な再計算を防ぐ)。
 * cache(article); // 同じ articleId で 2 回目以降はキャッシュ済の値を返す
 * ```
 *
 * キャッシュキー: `article.id` (記事の content / summary は ID が同じなら不変前提)。
 * 戻り値の関数は副作用ありなのでテストでは新規インスタンスを毎回作る。
 *
 * **不変性契約 (#693)**: 本キャッシュは「同じ article.id を持つ記事オブジェクトは
 * content / summary が変わらない」前提で動く。`useArticleData` の merge ロジックが
 * 既存記事をオブジェクト mutation で更新すると、ID が同じなのに content が変わって
 * stale な readingTime が返るバグになる。merge 側は必ず新しいオブジェクト reference
 * を生成すること (今のところ `mergeUniqueArticles` は新オブジェクトを生成している)。
 */
export function createReadingTimeCache(): (article: Article) => number {
  const cache = new Map<string, number>();
  return (article: Article): number => {
    const cached = cache.get(article.id);
    if (cached !== undefined) return cached;
    const mins = readingTime(article.content ?? article.summary);
    cache.set(article.id, mins);
    return mins;
  };
}
