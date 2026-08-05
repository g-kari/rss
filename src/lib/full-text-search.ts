/**
 * 全フィード横断のフルテキスト検索 (Issue #102)
 *
 * - フィールド指定: title:foo / author:bar / feed:baz / category:qux / summary:hello / content:hello / url:example.com / guid:urn:uuid / language:ja / metadata:source
 * - フレーズ検索: "hello world"
 * - 否定: -foo / -title:foo
 * - 暗黙 AND, 明示 OR ("foo OR bar")
 * - 大文字小文字無視
 * - 構文を含まない単純クエリは title / summary / author / categories / content を横断 (既存互換)
 */

import { stripHtml } from "./html";

export type SearchField =
  | "title"
  | "author"
  | "feed"
  | "category"
  | "summary"
  | "content"
  | "tag"
  | "url"
  | "guid"
  | "language"
  | "metadata";

const FIELD_NAMES: ReadonlySet<SearchField> = new Set([
  "title",
  "author",
  "feed",
  "category",
  "summary",
  "content",
  "tag",
  "url",
  "guid",
  "language",
  "metadata",
]);

const LANGUAGE_METADATA_KEYS: ReadonlySet<string> = new Set(["language", "dc:language"]);

export type SearchNode =
  | { kind: "TERM"; field?: SearchField; value: string }
  | { kind: "NOT"; child: SearchNode }
  | { kind: "AND"; children: SearchNode[] }
  | { kind: "OR"; children: SearchNode[] };

export interface SearchableArticle {
  id: string;
  feedHash: string;
  title: string;
  link?: string;
  guid?: string;
  summary: string;
  content?: string;
  author?: string;
  categories?: string[];
  metadata?: ReadonlyArray<{ key: string; value: string }>;
}

export interface SearchContext {
  /** feedHash → フィード表示名 (feed: 検索に使用) */
  feedTitleByHash: ReadonlyMap<string, string>;
  /** articleId → タグ配列 (tag: 検索に使用) */
  tagsByArticleId?: Readonly<Record<string, readonly string[]>>;
  /** defaultHaystack 結果キャッシュ。クエリ変更ごとの stripHtml 重複実行を回避 (#1000) */
  haystackCache?: Map<string, string>;
  /**
   * content: フィールド検索の stripHtml 結果キャッシュ (#1091)。
   * `defaultHaystack` (haystackCache) は title/summary/author/categories/content/feed を結合した
   * 全体を保持するのに対し、こちらは content フィールド単体の stripHtml 済みテキストを保持する
   * (別 source なので per-field で別 Map に持つ)。`content:<term>` 検索のキーストロークごとの
   * 重複 stripHtml を回避する。
   */
  contentHaystackCache?: Map<string, string>;
}

/* -------------------------------------------------------------------------- */
/*                                  Tokenizer                                 */
/* -------------------------------------------------------------------------- */

interface Token {
  /** 元の文字列。`title:foo` や `"hello world"` を含む 1 つの単位 */
  text: string;
}

/**
 * クエリ文字列をトークン化する。
 *
 * - フレーズ ("..."): クォートで囲まれた範囲を 1 トークン。クォート前にフィールド指定 (title:) が
 *   付く場合はそれを保持する: title:"foo bar" → text='title:"foo bar"'
 * - それ以外: 空白区切り
 */
function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = query.length;
  while (i < n) {
    // 空白スキップ
    while (i < n && /\s/.test(query[i]!)) i++;
    if (i >= n) break;

    let start = i;
    // フィールド接頭辞 (title:, content: 等) を含む可能性。 ":" まで読み込んだあと "..." なら拾う
    let foundQuote = false;
    while (i < n && !/\s/.test(query[i]!)) {
      if (query[i] === '"') {
        foundQuote = true;
        // 接頭辞 + クォート、または単独クォート
        i++; // skip opening quote
        while (i < n && query[i] !== '"') i++;
        if (i < n) i++; // skip closing quote
        break;
      }
      i++;
    }
    // foundQuote が無く、かつ末尾がクォートで終わってない通常語の場合
    // (上のループで i は次の空白かクォート開始位置で止まっている)
    if (!foundQuote) {
      // 通常語: 既に i は次の空白の位置
    }
    tokens.push({ text: query.slice(start, i) });
  }
  return tokens;
}

/* -------------------------------------------------------------------------- */
/*                                   Parser                                   */
/* -------------------------------------------------------------------------- */

/**
 * 1 トークンを TERM / NOT(TERM) ノードへ変換する。
 *
 * - 先頭の `-` は否定
 * - `field:value` 形式で field が既知ならフィールド指定 TERM
 * - `field:"phrase"` 形式に対応
 * - 値内のクォートは剥がす
 */
function tokenToNode(token: string): SearchNode | null {
  let text = token;
  let negate = false;
  if (text.startsWith("-")) {
    negate = true;
    text = text.slice(1);
  }
  if (!text) return null;

  let field: SearchField | undefined;
  // field: 部分を識別
  const colonIdx = text.indexOf(":");
  if (colonIdx > 0) {
    const candidate = text.slice(0, colonIdx).toLowerCase();
    if (FIELD_NAMES.has(candidate as SearchField)) {
      field = candidate as SearchField;
      text = text.slice(colonIdx + 1);
    }
  }

  // クォートを剥がす（未閉鎖クォートは閉じたものとして扱う）
  if (text.startsWith('"')) {
    text = text.endsWith('"') && text.length >= 2 ? text.slice(1, -1) : text.slice(1);
  }
  if (!text) return null;

  const node: SearchNode = field
    ? { kind: "TERM", field, value: text }
    : { kind: "TERM", value: text };
  return negate ? { kind: "NOT", child: node } : node;
}

/**
 * クエリ文字列を AST に変換する。
 *
 * 文法 (擬似 EBNF):
 *   query   = or-expr
 *   or-expr = and-expr ("OR" and-expr)*
 *   and-expr = term+
 *   term    = ["-"] [field ":"] (word | phrase)
 *
 * OR は AND より優先度が低い。
 *
 * 空クエリ・全部 OR/`-` のみは null を返す。
 */
export function parseSearchQuery(query: string): SearchNode | null {
  const tokens = tokenize(query.trim());
  if (tokens.length === 0) return null;

  const orGroups: SearchNode[][] = [[]];
  for (const t of tokens) {
    if (t.text.toUpperCase() === "OR") {
      // 区切り。次の AND グループを開始
      if (orGroups[orGroups.length - 1]!.length > 0) {
        orGroups.push([]);
      }
      continue;
    }
    const node = tokenToNode(t.text);
    if (node) orGroups[orGroups.length - 1]!.push(node);
  }

  // 末尾が空グループだった場合 (例: "foo OR ") は除去
  const groups = orGroups.filter((g) => g.length > 0);
  if (groups.length === 0) return null;

  const andOf = (nodes: SearchNode[]): SearchNode =>
    nodes.length === 1 ? nodes[0]! : { kind: "AND", children: nodes };

  if (groups.length === 1) return andOf(groups[0]!);
  return { kind: "OR", children: groups.map(andOf) };
}

/* -------------------------------------------------------------------------- */
/*                                  Evaluator                                 */
/* -------------------------------------------------------------------------- */

function fieldHaystack(article: SearchableArticle, field: SearchField, ctx: SearchContext): string {
  switch (field) {
    case "title":
      return article.title.toLowerCase();
    case "author":
      return (article.author ?? "").toLowerCase();
    case "category":
      return (article.categories ?? []).join(" ").toLowerCase();
    case "summary":
      return article.summary.toLowerCase();
    case "feed":
      return (ctx.feedTitleByHash.get(article.feedHash) ?? "").toLowerCase();
    case "content": {
      if (ctx.contentHaystackCache) {
        const cached = ctx.contentHaystackCache.get(article.id);
        if (cached !== undefined) return cached;
      }
      const result = stripHtml(article.content ?? "").toLowerCase();
      ctx.contentHaystackCache?.set(article.id, result);
      return result;
    }
    case "tag":
      return (ctx.tagsByArticleId?.[article.id] ?? []).join(" ").toLowerCase();
    case "url":
      return (article.link ?? "").toLowerCase();
    case "guid":
      return (article.guid ?? "").toLowerCase();
    case "language":
      return (article.metadata ?? [])
        .filter((entry) => LANGUAGE_METADATA_KEYS.has(entry.key.toLowerCase()))
        .map((entry) => entry.value)
        .join(" ")
        .toLowerCase();
    case "metadata":
      return (article.metadata ?? [])
        .map((entry) => `${entry.key} ${entry.value}`)
        .join(" ")
        .toLowerCase();
  }
}

function defaultHaystack(article: SearchableArticle, ctx: SearchContext): string {
  if (ctx.haystackCache) {
    const cached = ctx.haystackCache.get(article.id);
    if (cached !== undefined) return cached;
  }
  // 既存 articleMatchesQuery 互換 + content も対象に
  const parts = [
    article.title,
    article.summary,
    article.author ?? "",
    (article.categories ?? []).join(" "),
    stripHtml(article.content ?? ""),
    ctx.feedTitleByHash.get(article.feedHash) ?? "",
  ];
  const result = parts.join("  ").toLowerCase();
  ctx.haystackCache?.set(article.id, result);
  return result;
}

function evaluate(node: SearchNode, article: SearchableArticle, ctx: SearchContext): boolean {
  switch (node.kind) {
    case "TERM": {
      const needle = node.value.toLowerCase();
      if (!needle) return true;
      const haystack = node.field
        ? fieldHaystack(article, node.field, ctx)
        : defaultHaystack(article, ctx);
      return haystack.includes(needle);
    }
    case "NOT":
      return !evaluate(node.child, article, ctx);
    case "AND":
      return node.children.every((c) => evaluate(c, article, ctx));
    case "OR":
      return node.children.some((c) => evaluate(c, article, ctx));
  }
}

/**
 * 高度クエリで記事をマッチング判定する。
 *
 * 空クエリは true。パース失敗 (構文がほぼ無効) も true にフォールバックして UI を空状態にしない。
 */
export function matchesAdvancedQuery(
  article: SearchableArticle,
  query: string,
  ctx: SearchContext,
): boolean {
  const ast = parseSearchQuery(query);
  if (!ast) return true;
  return evaluate(ast, article, ctx);
}

/**
 * クエリを 1 度だけパースして evaluator 関数を返す (perf 最適化)。
 *
 * `matchesAdvancedQuery` を per-article に呼ぶと `parseSearchQuery` が
 * 記事数分実行されてしまうため、フィルタリングのループ外で `compileSearchQuery`
 * で AST を bind した evaluator を作り、それをループ内で再利用する。
 *
 * 空クエリ / パース失敗は `null` を返す。呼び出し側で「クエリ述語なし」として
 * 早期 return する設計を想定。
 */
export function compileSearchQuery(
  query: string,
): ((article: SearchableArticle, ctx: SearchContext) => boolean) | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const ast = parseSearchQuery(trimmed);
  if (!ast) return null;
  return (article, ctx) => evaluate(ast, article, ctx);
}
