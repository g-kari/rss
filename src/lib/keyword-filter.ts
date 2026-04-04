import type { Article, KeywordFilter } from "../types";

const MAX_KEYWORD_LENGTH = 100;
const MAX_KEYWORDS_PER_ARRAY = 500;
/** ReDoS 対策: スラッシュを除いたパターン部分の最大文字数 */
const MAX_REGEX_PATTERN_LENGTH = 50;

/**
 * ReDoS（正規表現サービス拒否）を引き起こす壊滅的バックトラッキングパターンを検出する。
 * 典型的なパターン:
 * - ネストした量指定子: (a+)+ / (a{2,})+
 * - 交互化を含むグループへの量指定子: (a|aa)+ / (foo|foobar)*
 * - 文字クラス内に ) を含む量指定子グループ: ([a-z)]+)+
 */
function hasCatastrophicBacktracking(pattern: string): boolean {
  // 文字クラス [abc] の中身を除去することで、) を含む文字クラスによる検出バイパスを防ぐ
  // 例: ([a-z)]+)+ は文字クラス除去前は ) で検出が打ち切られるが、除去後は (X+)+ として正しく検出される
  // エスケープシーケンス \) \( 等も X に置換して誤検知を防ぐ
  const stripped = pattern.replace(/\[(?:[^\]\\]|\\.)*\]/g, "X").replace(/\\./g, "X");
  // {n,} / {n,m} を + に正規化してから検査することで、(a{2,})+ のような
  // 上限なし繰り返しをネストした量指定子として検出できるようにする
  const normalized = stripped.replace(/\{\d+,\d*\}/g, "+");
  // グループ内に量指定子があり、そのグループ自体にも量指定子がある構造を検出
  // ※ {n,} / {n,m} は正規化済みで + になっているため + と * のみ検査すれば十分
  if (/\([^)]*[+*][^)]*\)[+*?]/.test(normalized)) return true;
  // 交互化 (a|b) を含むグループに量指定子がある構造を検出
  // V8 でも (a|aa)+ のような重複オーバーラップする交互化は指数的バックトラッキングを引き起こす
  // 正規化後に残る { は固定繰り返し {n} のみで安全なため除外
  if (/\([^)]*\|[^)]*\)[+*]/.test(normalized)) return true;
  return false;
}

/** `/pattern/` 形式の正規表現キーワードかどうかを判定する */
function isRegexKeyword(kw: string): boolean {
  return (
    kw.startsWith("/") &&
    kw.endsWith("/") &&
    kw.length > 2 &&
    kw.length - 2 <= MAX_REGEX_PATTERN_LENGTH
  );
}

/** キーワードが記事テキストにマッチするかを判定する。正規表現キーワードは大文字小文字を無視して評価する */
function matchesText(kw: string, text: string): boolean {
  if (isRegexKeyword(kw)) {
    const pattern = kw.slice(1, -1);
    if (hasCatastrophicBacktracking(pattern)) return false;
    try {
      return new RegExp(pattern, "i").test(text);
    } catch {
      return false;
    }
  }
  return text.includes(kw);
}

/**
 * ユーザー入力のキーワード配列をサニタイズする。
 * - 文字列以外の要素を除去
 * - トリム・最大文字数でスライス
 * - 空文字・重複を除去
 * - 最大件数でスライス
 */
export function sanitizeKeywords(arr: unknown[]): string[] {
  return [
    ...new Set(
      arr
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim().slice(0, MAX_KEYWORD_LENGTH))
        .filter(Boolean),
    ),
  ].slice(0, MAX_KEYWORDS_PER_ARRAY);
}

/** KeywordFilter のキーワードを正規化する。正規表現キーワードはそのまま保持し、それ以外は小文字化する */
export function normalizeFilter(filter: KeywordFilter): KeywordFilter {
  return {
    ...filter,
    include: filter.include.map((kw) => (isRegexKeyword(kw) ? kw : kw.toLowerCase())),
    exclude: filter.exclude.map((kw) => (isRegexKeyword(kw) ? kw : kw.toLowerCase())),
  };
}

/**
 * filter フィールドを持つオブジェクト配列からフィルターマップを構築する。
 * getKey で各要素の ID を取得し、キーワードが空のフィルターは除外する。
 */
export function buildFilterMap<T extends { filter?: KeywordFilter }>(
  items: T[],
  getKey: (item: T) => string,
): Map<string, KeywordFilter> {
  const map = new Map<string, KeywordFilter>();
  for (const item of items) {
    const f = item.filter;
    if (f && (f.include.length > 0 || f.exclude.length > 0)) {
      map.set(getKey(item), normalizeFilter(f));
    }
  }
  return map;
}

/**
 * 記事がキーワードフィルターにマッチするかを判定する。
 *
 * マッチ対象フィールド: title・summary・metadata の value 値、
 * `matchCategories` が true の場合は categories も含む。
 *
 * マッチ条件:
 * - `exclude` に含まれるキーワードが **どれにもマッチしない**
 * - `include` が空、または `include` のうち **いずれか 1 件以上**がマッチする
 *
 * @param article - 対象記事（`normalizeFilter` 適用済みフィルターと組み合わせること）
 * @param filter - `normalizeFilter` で正規化済みの KeywordFilter
 */
export function matchesKeywordFilter(article: Article, filter: KeywordFilter): boolean {
  const { include, exclude, matchCategories } = filter;

  const fields = [article.title, article.summary];
  if (matchCategories && article.categories) {
    fields.push(...article.categories);
  }
  if (article.metadata) {
    fields.push(...article.metadata.map((m) => m.value));
  }
  const text = fields.join(" ").toLowerCase();
  return (
    exclude.every((kw) => !matchesText(kw, text)) &&
    (include.length === 0 || include.some((kw) => matchesText(kw, text)))
  );
}

/**
 * 記事リストにキーワードフィルターを適用して返す。
 * `filter` が未指定、または include/exclude が両方空の場合は元のリストをそのまま返す。
 * 内部で `normalizeFilter` を呼び出すため、呼び出し側での正規化は不要。
 */
export function applyKeywordFilter(articles: Article[], filter?: KeywordFilter): Article[] {
  if (!filter) return articles;
  if (filter.include.length === 0 && filter.exclude.length === 0) return articles;
  const normalized = normalizeFilter(filter);
  return articles.filter((a) => matchesKeywordFilter(a, normalized));
}

/**
 * 任意の入力値から KeywordFilter をパースする。
 * null / undefined / 不正な形式の場合は null を返す。
 * include / exclude が配列でない場合は空配列として扱う。
 */
export function parseKeywordFilter(raw: unknown): KeywordFilter | null {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const filter: KeywordFilter = {
    include: sanitizeKeywords(Array.isArray(obj.include) ? obj.include : []),
    exclude: sanitizeKeywords(Array.isArray(obj.exclude) ? obj.exclude : []),
  };
  if (obj.matchCategories === true) filter.matchCategories = true;
  return filter;
}

/**
 * feedHash → KeywordFilter のマップを使って記事リストをフィルタリングする。
 * 各記事の feedHash に対応するフィルターが存在しない場合は通過させる。
 */
export function applyKeywordFilterMap(
  articles: Article[],
  filterMap: Map<string, KeywordFilter>,
): Article[] {
  if (filterMap.size === 0) return articles;
  return articles.filter((a) => {
    const filter = filterMap.get(a.feedHash);
    return !filter || matchesKeywordFilter(a, filter);
  });
}
