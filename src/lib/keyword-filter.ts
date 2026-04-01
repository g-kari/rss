import type { Article, KeywordFilter } from "../types";

const MAX_KEYWORD_LENGTH = 100;
const MAX_KEYWORDS_PER_ARRAY = 99999;

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

/** KeywordFilter のキーワードを小文字化して正規化する */
export function normalizeFilter(filter: KeywordFilter): KeywordFilter {
  return {
    ...filter,
    include: filter.include.map((kw) => kw.toLowerCase()),
    exclude: filter.exclude.map((kw) => kw.toLowerCase()),
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
    exclude.every((kw) => !text.includes(kw)) &&
    (include.length === 0 || include.some((kw) => text.includes(kw)))
  );
}

export function applyKeywordFilter(articles: Article[], filter?: KeywordFilter): Article[] {
  if (!filter) return articles;
  if (filter.include.length === 0 && filter.exclude.length === 0) return articles;
  const normalized = normalizeFilter(filter);
  return articles.filter((a) => matchesKeywordFilter(a, normalized));
}

/**
 * feedHash → KeywordFilter のマップを使って記事リストをフィルタリングする。
 * 各記事の feedHash に対応するフィルターが存在しない場合は通過させる。
 */
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
