import type { Article, KeywordFilter } from "../types";
import { isPlainObject } from "./type-guards";

const MAX_KEYWORD_LENGTH = 100;
const MAX_KEYWORDS_PER_ARRAY = 500;
/** ReDoS 対策: スラッシュを除いたパターン部分の最大文字数 */
const MAX_REGEX_PATTERN_LENGTH = 50;

/**
 * `normalizeFilter` が返す実行時表現。
 * 正規表現キーワード (`/pattern/` 形式) はコンパイル済み `RegExp` に変換され、
 * フィルタリング時に記事ごとの再コンパイルを回避する。
 * 不正なパターン / ReDoS リスクがある場合は対応する要素が `null` になり、マッチしない扱いになる。
 */
export interface CompiledKeywordFilter {
  include: string[];
  exclude: string[];
  matchCategories?: boolean;
  /** include の各エントリに対応するコンパイル済み RegExp（正規表現でない / 不正な場合は null） */
  includePatterns: (RegExp | null)[];
  /** exclude の各エントリに対応するコンパイル済み RegExp（正規表現でない / 不正な場合は null） */
  excludePatterns: (RegExp | null)[];
}

/**
 * ReDoS（正規表現サービス拒否）を引き起こす壊滅的バックトラッキングパターンを検出する。
 * 典型的なパターン:
 * - ネストした量指定子: (a+)+ / (a{2,})+ / ((ab)+)+
 * - 交互化を含むグループへの量指定子: (a|aa)+ / (foo|foobar)*
 * - 文字クラス内に ) を含む量指定子グループ: ([a-z)]+)+
 *
 * 危険と判定した場合は `normalizeFilter` がその RegExp を null にする（マッチしない扱い）。
 *
 * @param pattern - スラッシュを除いた正規表現パターン文字列（`/pattern/` の内側）
 * @returns 壊滅的バックトラッキングの恐れがあれば true
 */
function hasCatastrophicBacktracking(pattern: string): boolean {
  // 文字クラス [abc] の中身を除去することで、) を含む文字クラスによる検出バイパスを防ぐ
  // 例: ([a-z)]+)+ は文字クラス除去前は ) で検出が打ち切られるが、除去後は (X+)+ として正しく検出される
  // エスケープシーケンス \) \( 等も X に置換して誤検知を防ぐ
  const stripped = pattern.replace(/\[(?:[^\]\\]|\\.)*\]/g, "X").replace(/\\./g, "X");
  // {n,} / {n,m} を + に正規化してから検査することで、(a{2,})+ のような
  // 上限なし繰り返しをネストした量指定子として検出できるようにする
  const normalized = stripped.replace(/\{\d+,\d*\}/g, "+");
  // グループ化されていない隣接同一アトムの上限なし量指定子 (a*a* / \d*\d* / .*.* 等) を検出。
  // 以降のチェックは全て括弧グループ `(...)` を前提とするため、ungrouped な
  // `a*a*a*...c` 型 (同一文字に複数の量指定子が連続) の指数的バックトラッキングを
  // 取りこぼす。stripped 後 (char class / escape は X) の文字列で「アトム + 量指定子」が
  // 同一アトムで隣接する構造を backreference で検出する。
  if (/([^()|])[+*]\1[+*]/.test(normalized)) return true;
  // グループ内に量指定子があり、そのグループ自体にも量指定子がある構造を検出
  // ※ {n,} / {n,m} は正規化済みで + になっているため + と * のみ検査すれば十分
  if (/\([^)]*[+*][^)]*\)[+*?]/.test(normalized)) return true;
  // 交互化 (a|b) を含むグループに量指定子がある構造を検出
  // V8 でも (a|aa)+ のような重複オーバーラップする交互化は指数的バックトラッキングを引き起こす
  // 正規化後に残る { は固定繰り返し {n} のみで安全なため除外
  if (/\([^)]*\|[^)]*\)[+*]/.test(normalized)) return true;
  // ネストされた量指定子グループを検出: ((ab)+)+ のように内部グループに量指定子があり外部にも
  // 量指定子がある構造は上記チェックでは捕捉できない。
  // 括弧を含まない最内グループを X+ に平坦化しながら各ステップで検査する。
  // 例: ((ab)+)+ → 1回目フラット化で (X+)+ → チェックで検出
  let flattened = normalized;
  for (let i = 0; i < 5; i++) {
    flattened = flattened.replace(/\([^()]*\)[+*?]/g, "X+");
    if (/\([^)]*[+*][^)]*\)[+*?]/.test(flattened)) return true;
    if (/\([^)]*\|[^)]*\)[+*]/.test(flattened)) return true;
  }
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

/**
 * `normalizeFilter` で事前コンパイルされた単一エントリでマッチ判定する。
 * - 正規表現エントリ: コンパイル済み `pattern` を使用（null = 不正 / ReDoS リスク → 不マッチ扱い）
 * - 文字列エントリ: `includes` で部分一致（`normalizeFilter` で小文字化済み）
 */
function matchesCompiledEntry(kw: string, pattern: RegExp | null, text: string): boolean {
  if (isRegexKeyword(kw)) return pattern !== null && pattern.test(text);
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
  if (arr.length === 0) return [];
  const keywords: string[] = [];
  const seen = new Set<string>();
  for (const value of arr) {
    if (typeof value !== "string") continue;
    const keyword = value.trim().slice(0, MAX_KEYWORD_LENGTH);
    if (!keyword || seen.has(keyword)) continue;
    if (isRegexKeyword(keyword)) {
      // サーバー側でも ReDoS パターンを除外する
      const pattern = keyword.slice(1, -1);
      if (hasCatastrophicBacktracking(pattern)) continue;
    }
    seen.add(keyword);
    keywords.push(keyword);
    if (keywords.length >= MAX_KEYWORDS_PER_ARRAY) break;
  }
  return keywords;
}

/**
 * KeywordFilter のキーワードを正規化し、正規表現をコンパイルした `CompiledKeywordFilter` を返す。
 * - 文字列キーワードは小文字化する
 * - 正規表現キーワード (`/pattern/` 形式) はコンパイル済み `RegExp` に変換する
 * - ReDoS リスクがあるパターンや不正な構文は `null` として保持し、マッチしない扱いにする
 */
export function normalizeFilter(filter: KeywordFilter): CompiledKeywordFilter {
  if (filter.include.length === 0 && filter.exclude.length === 0) {
    return { ...filter, includePatterns: [], excludePatterns: [] };
  }
  const compileKeyword = (kw: string): [normalized: string, pattern: RegExp | null] => {
    if (!isRegexKeyword(kw)) return [kw.toLowerCase(), null];
    const pattern = kw.slice(1, -1);
    if (hasCatastrophicBacktracking(pattern)) return [kw, null];
    try {
      return [kw, new RegExp(pattern, "i")];
    } catch {
      return [kw, null];
    }
  };
  const includeCompiled = filter.include.map(compileKeyword);
  const excludeCompiled = filter.exclude.map(compileKeyword);
  return {
    ...filter,
    include: includeCompiled.map(([kw]) => kw),
    exclude: excludeCompiled.map(([kw]) => kw),
    includePatterns: includeCompiled.map(([, p]) => p),
    excludePatterns: excludeCompiled.map(([, p]) => p),
  };
}

/**
 * filter フィールドを持つオブジェクト配列からフィルターマップを構築する。
 * getKey で各要素の ID を取得し、キーワードが空のフィルターは除外する。
 * 返されるマップの値は `normalizeFilter` 適用済みの `CompiledKeywordFilter`。
 */
/**
 * filter フィールドを持つオブジェクト配列からフィルターマップを構築する。
 * getKey で各要素の ID を取得し、キーワードが空のフィルターは除外する。
 * 返されるマップの値は `normalizeFilter` 適用済みの `CompiledKeywordFilter`。
 *
 * @param compiledCache - オプション。フィルター JSON をキーとするコンパイル済みキャッシュ。
 *   同一フィルターが再度登場した場合に `normalizeFilter`（RegExp 再生成）をスキップできる。
 *   クライアントサイドでは `useRef` で保持した `Map` を渡すことで、
 *   `feeds` 配列の参照が変わっても変更のないフィルターの再コンパイルを回避する。
 *   Edge Runtime（Route Handler）では各リクエストが独立しているため渡す必要はない。
 */
export function buildFilterMap<T extends { filter?: KeywordFilter }>(
  items: T[],
  getKey: (item: T) => string,
  compiledCache?: Map<string, CompiledKeywordFilter>,
): Map<string, CompiledKeywordFilter> {
  const map = new Map<string, CompiledKeywordFilter>();
  for (const item of items) {
    const f = item.filter;
    if (f && (f.include.length > 0 || f.exclude.length > 0)) {
      const key = getKey(item);
      if (compiledCache) {
        const cacheKey = JSON.stringify([f.include, f.exclude, f.matchCategories ?? false]);
        let compiled = compiledCache.get(cacheKey);
        if (!compiled) {
          compiled = normalizeFilter(f);
          compiledCache.set(cacheKey, compiled);
        }
        map.set(key, compiled);
      } else {
        map.set(key, normalizeFilter(f));
      }
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
 * マッチ条件（exclude が include より優先）:
 * - `exclude` に含まれるキーワードが **どれにもマッチしない**（1 件でもマッチすれば除外）
 * - `include` が空、または `include` のうち **いずれか 1 件以上**がマッチする
 *
 * 例: include=["AI"], exclude=["生成AI"] のとき
 *   "生成AIの未来" → include にマッチするが exclude でブロック → 除外
 *
 * @param article - 対象記事
 * @param filter - `normalizeFilter` で正規化・コンパイル済みの CompiledKeywordFilter
 */
export function matchesKeywordFilter(article: Article, filter: CompiledKeywordFilter): boolean {
  const { include, exclude, includePatterns, excludePatterns, matchCategories } = filter;
  if (include.length === 0 && exclude.length === 0) return true;

  const fields = [article.title, article.summary];
  if (matchCategories && article.categories) {
    fields.push(...article.categories);
  }
  if (article.metadata) {
    fields.push(...article.metadata.map((m) => m.value));
  }
  const text = fields.join(" ").toLowerCase();
  return (
    exclude.every((kw, i) => !matchesCompiledEntry(kw, excludePatterns[i], text)) &&
    (include.length === 0 ||
      include.some((kw, i) => matchesCompiledEntry(kw, includePatterns[i], text)))
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
  const compiled = normalizeFilter(filter);
  return articles.filter((a) => matchesKeywordFilter(a, compiled));
}

/**
 * 任意の入力値から KeywordFilter をパースする。
 * null / undefined / 不正な形式の場合は null を返す。
 * include / exclude が配列でない場合は空配列として扱う。
 */
export function parseKeywordFilter(raw: unknown): KeywordFilter | null {
  if (!isPlainObject(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const filter: KeywordFilter = {
    include: sanitizeKeywords(Array.isArray(obj.include) ? obj.include : []),
    exclude: sanitizeKeywords(Array.isArray(obj.exclude) ? obj.exclude : []),
  };
  if (obj.matchCategories === true) filter.matchCategories = true;
  return filter;
}

/**
 * feedHash → CompiledKeywordFilter のマップを使って記事リストをフィルタリングする。
 * 各記事の feedHash に対応するフィルターが存在しない場合は通過させる。
 */
export function applyKeywordFilterMap(
  articles: Article[],
  filterMap: Map<string, CompiledKeywordFilter>,
): Article[] {
  if (filterMap.size === 0) return articles;
  return articles.filter((a) => {
    const filter = filterMap.get(a.feedHash);
    return !filter || matchesKeywordFilter(a, filter);
  });
}
