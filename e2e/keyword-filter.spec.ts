import { test, expect } from "@playwright/test";
import {
  sanitizeKeywords,
  normalizeFilter,
  matchesKeywordFilter,
  buildFilterMap,
  type CompiledKeywordFilter,
} from "../src/lib/keyword-filter";
import type { Article, KeywordFilter } from "../src/types";
import { makeArticle as makeBaseArticle } from "./helpers/article";

const makeArticle = (id: string, feedHash: string, overrides: Partial<Article> = {}) =>
  makeBaseArticle({
    id,
    feedHash,
    guid: id,
    title: `記事 ${id}`,
    link: `https://example.com/${id}`,
    summary: `サマリー ${id}`,
    publishedAt: "2024-06-01T00:00:00Z",
    createdAt: "2024-06-01T00:00:00Z",
    ...overrides,
  });

function makeFilter(
  include: string[] = [],
  exclude: string[] = [],
  matchCategories?: boolean,
): KeywordFilter {
  return { include, exclude, ...(matchCategories !== undefined ? { matchCategories } : {}) };
}

// ── hasCatastrophicBacktracking (normalizeFilter 経由) ──────────
//
// 以下の test は normalizeFilter() の ReDoS 検出ロジックを検証するための fixture で、
// 意図的に catastrophic backtracking 可能な regex を文字列として渡す。
// normalizeFilter() 内の hasCatastrophicBacktracking() が事前検出して null を返すため、
// これら fixture が実際に RegExp として compile される経路は存在しない。
// GitHub code-scanning (js/redos) は文字列内の regex を解析して警告するが、
// 本 spec の意図 (= ReDoS 検出機能の入力) であるため意図的に維持する。

test.describe("hasCatastrophicBacktracking", () => {
  test("ネストした量指定子 (a+)+ を検出して null にする", () => {
    // lgtm[js/redos] — intentional fixture for ReDoS detection test
    // codeql[js/redos] — intentional fixture (production 経路で compile されない、hasCatastrophicBacktracking 検証用)
    const compiled = normalizeFilter(makeFilter(["/(a+)+/"]));
    expect(compiled.includePatterns[0]).toBeNull();
  });

  test("ネストした量指定子 (a{2,})+ を検出して null にする", () => {
    // lgtm[js/redos] — intentional fixture for ReDoS detection test
    // codeql[js/redos] — intentional fixture (production 経路で compile されない、hasCatastrophicBacktracking 検証用)
    const compiled = normalizeFilter(makeFilter(["/(a{2,})+/"]));
    expect(compiled.includePatterns[0]).toBeNull();
  });

  test("ネストした量指定子 ((ab)+)+ を検出して null にする", () => {
    // lgtm[js/redos] — intentional fixture for ReDoS detection test
    // codeql[js/redos] — intentional fixture (production 経路で compile されない、hasCatastrophicBacktracking 検証用)
    const compiled = normalizeFilter(makeFilter(["/((ab)+)+/"]));
    expect(compiled.includePatterns[0]).toBeNull();
  });

  test("交互化グループ (a|aa)+ を検出して null にする", () => {
    // lgtm[js/redos] — intentional fixture for ReDoS detection test
    // codeql[js/redos] — intentional fixture (production 経路で compile されない、hasCatastrophicBacktracking 検証用)
    const compiled = normalizeFilter(makeFilter(["/(a|aa)+/"]));
    expect(compiled.includePatterns[0]).toBeNull();
  });

  test("交互化グループ (foo|foobar)* を検出して null にする", () => {
    // lgtm[js/redos] — intentional fixture for ReDoS detection test
    // codeql[js/redos] — intentional fixture (production 経路で compile されない、hasCatastrophicBacktracking 検証用)
    const compiled = normalizeFilter(makeFilter(["/(foo|foobar)*/"]));
    expect(compiled.includePatterns[0]).toBeNull();
  });

  test("文字クラス内 ) を含むパターン ([a-z)]+)+ を検出して null にする", () => {
    // lgtm[js/redos] — intentional fixture for ReDoS detection test
    // codeql[js/redos] — intentional fixture (production 経路で compile されない、hasCatastrophicBacktracking 検証用)
    const compiled = normalizeFilter(makeFilter(["/([a-z)]+)+/"]));
    expect(compiled.includePatterns[0]).toBeNull();
  });

  test("安全なパターン [a-z]+ は正常にコンパイルされる", () => {
    const compiled = normalizeFilter(makeFilter(["/[a-z]+/"]));
    expect(compiled.includePatterns[0]).toBeInstanceOf(RegExp);
  });

  test("安全なパターン (abc) は正常にコンパイルされる", () => {
    const compiled = normalizeFilter(makeFilter(["/(abc)/"]));
    expect(compiled.includePatterns[0]).toBeInstanceOf(RegExp);
  });

  test("安全なパターン \\d{3}-\\d{4} は正常にコンパイルされる", () => {
    const compiled = normalizeFilter(makeFilter(["/\\d{3}-\\d{4}/"]));
    expect(compiled.includePatterns[0]).toBeInstanceOf(RegExp);
  });

  test("(a|b) に量指定子なしは安全", () => {
    const compiled = normalizeFilter(makeFilter(["/(a|b)/"]));
    expect(compiled.includePatterns[0]).toBeInstanceOf(RegExp);
  });

  test("(a+) に量指定子なしは安全", () => {
    const compiled = normalizeFilter(makeFilter(["/(a+)/"]));
    expect(compiled.includePatterns[0]).toBeInstanceOf(RegExp);
  });

  test("グループなし隣接量指定子 a*a*a*c を検出して null にする (ReDoS)", () => {
    // lgtm[js/redos] — intentional fixture for ReDoS detection test
    // codeql[js/redos] — intentional fixture (production 経路で compile されない)
    const compiled = normalizeFilter(makeFilter(["/a*a*a*c/"]));
    expect(compiled.includePatterns[0]).toBeNull();
  });

  test("グループなし隣接量指定子 \\d*\\d* を検出して null にする (ReDoS)", () => {
    // lgtm[js/redos] — intentional fixture for ReDoS detection test
    const compiled = normalizeFilter(makeFilter(["/\\d*\\d*/"]));
    expect(compiled.includePatterns[0]).toBeNull();
  });

  test("異なるアトムの隣接量指定子 a*b* は安全 (オーバーラップなし)", () => {
    const compiled = normalizeFilter(makeFilter(["/a*b*/"]));
    expect(compiled.includePatterns[0]).toBeInstanceOf(RegExp);
  });

  test("セパレータで区切られた量指定子 \\d+-\\d+ は安全", () => {
    const compiled = normalizeFilter(makeFilter(["/\\d+-\\d+/"]));
    expect(compiled.includePatterns[0]).toBeInstanceOf(RegExp);
  });
});

// ── isRegexKeyword (normalizeFilter 経由) ──────────────────────

test.describe("isRegexKeyword", () => {
  test("/pattern/ 形式は正規表現として扱われる", () => {
    const compiled = normalizeFilter(makeFilter(["/test/"]));
    expect(compiled.includePatterns[0]).toBeInstanceOf(RegExp);
    expect(compiled.include[0]).toBe("/test/");
  });

  test("通常文字列は小文字化されパターンは null", () => {
    const compiled = normalizeFilter(makeFilter(["Hello"]));
    expect(compiled.include[0]).toBe("hello");
    expect(compiled.includePatterns[0]).toBeNull();
  });

  test("スラッシュが片方だけの文字列は通常文字列扱い", () => {
    const compiled = normalizeFilter(makeFilter(["/hello"]));
    expect(compiled.include[0]).toBe("/hello");
    expect(compiled.includePatterns[0]).toBeNull();
  });

  test("// (空パターン) は正規表現として扱われない", () => {
    const compiled = normalizeFilter(makeFilter(["//"]));
    expect(compiled.includePatterns[0]).toBeNull();
  });

  test("パターンが長すぎる場合は正規表現として扱われない", () => {
    const longPattern = "/" + "a".repeat(51) + "/";
    const compiled = normalizeFilter(makeFilter([longPattern]));
    expect(compiled.includePatterns[0]).toBeNull();
    expect(compiled.include[0]).toBe(longPattern.toLowerCase());
  });

  test("パターンが上限ちょうどの長さなら正規表現としてコンパイルされる", () => {
    const exactPattern = "/" + "a".repeat(50) + "/";
    const compiled = normalizeFilter(makeFilter([exactPattern]));
    expect(compiled.includePatterns[0]).toBeInstanceOf(RegExp);
  });
});

// ── normalizeFilter ────────────────────────────────────────────

test.describe("normalizeFilter", () => {
  test("文字列キーワードを小文字化する", () => {
    const compiled = normalizeFilter(makeFilter(["TypeScript", "REACT"]));
    expect(compiled.include).toEqual(["typescript", "react"]);
  });

  test("正規表現キーワードはそのまま保持する", () => {
    const compiled = normalizeFilter(makeFilter(["/Test/"]));
    expect(compiled.include[0]).toBe("/Test/");
  });

  test("不正な正規表現構文は null にする", () => {
    const compiled = normalizeFilter(makeFilter(["/[invalid/"]));
    expect(compiled.includePatterns[0]).toBeNull();
  });

  test("exclude も正しくコンパイルされる", () => {
    const compiled = normalizeFilter(makeFilter([], ["/spam/", "ads"]));
    expect(compiled.excludePatterns[0]).toBeInstanceOf(RegExp);
    expect(compiled.exclude[1]).toBe("ads");
    expect(compiled.excludePatterns[1]).toBeNull();
  });

  test("matchCategories が引き継がれる", () => {
    const compiled = normalizeFilter(makeFilter(["test"], [], true));
    expect(compiled.matchCategories).toBe(true);
  });
});

// ── sanitizeKeywords ───────────────────────────────────────────

test.describe("sanitizeKeywords", () => {
  test("空文字を除去する", () => {
    expect(sanitizeKeywords(["hello", "", "  ", "world"])).toEqual(["hello", "world"]);
  });

  test("文字列以外の要素を除去する", () => {
    expect(sanitizeKeywords(["valid", 123, null, undefined, true, "ok"] as unknown[])).toEqual([
      "valid",
      "ok",
    ]);
  });

  test("前後の空白をトリムする", () => {
    expect(sanitizeKeywords(["  hello  ", "  world  "])).toEqual(["hello", "world"]);
  });

  test("重複を除去する", () => {
    expect(sanitizeKeywords(["foo", "bar", "foo", "baz", "bar"])).toEqual(["foo", "bar", "baz"]);
  });

  test("最大文字数で切り詰める", () => {
    const long = "a".repeat(200);
    const result = sanitizeKeywords([long]);
    expect(result[0].length).toBe(100);
  });

  test("配列上限 500 件で切り詰める", () => {
    const keywords = Array.from({ length: 600 }, (_, i) => `kw${i}`);
    const result = sanitizeKeywords(keywords);
    expect(result.length).toBe(500);
  });

  test("ReDoS パターンを除去する", () => {
    // lgtm[js/redos] — intentional fixture for sanitizeKeywords ReDoS removal test
    const result = sanitizeKeywords(["/(a+)+/", "safe", "/hello/"]);
    expect(result).toEqual(["safe", "/hello/"]);
  });
});

// ── matchesKeywordFilter ───────────────────────────────────────

test.describe("matchesKeywordFilter", () => {
  test("include キーワードがタイトルにマッチすれば通過", () => {
    const article = makeArticle("1", "f1", { title: "TypeScript入門" });
    const compiled = normalizeFilter(makeFilter(["typescript"]));
    expect(matchesKeywordFilter(article, compiled)).toBe(true);
  });

  test("include キーワードがサマリーにマッチすれば通過", () => {
    const article = makeArticle("1", "f1", { summary: "Reactの基礎を学ぶ" });
    const compiled = normalizeFilter(makeFilter(["react"]));
    expect(matchesKeywordFilter(article, compiled)).toBe(true);
  });

  test("include キーワードがどのフィールドにもマッチしなければ除外", () => {
    const article = makeArticle("1", "f1", { title: "Python入門", summary: "基礎" });
    const compiled = normalizeFilter(makeFilter(["rust"]));
    expect(matchesKeywordFilter(article, compiled)).toBe(false);
  });

  test("include が空の場合は全て通過", () => {
    const article = makeArticle("1", "f1");
    const compiled = normalizeFilter(makeFilter([]));
    expect(matchesKeywordFilter(article, compiled)).toBe(true);
  });

  test("exclude キーワードにマッチすれば除外", () => {
    const article = makeArticle("1", "f1", { title: "広告記事" });
    const compiled = normalizeFilter(makeFilter([], ["広告"]));
    expect(matchesKeywordFilter(article, compiled)).toBe(false);
  });

  test("exclude が include より優先される", () => {
    const article = makeArticle("1", "f1", { title: "生成AIの未来" });
    const compiled = normalizeFilter(makeFilter(["ai"], ["生成ai"]));
    expect(matchesKeywordFilter(article, compiled)).toBe(false);
  });

  test("正規表現 include がマッチすれば通過", () => {
    const article = makeArticle("1", "f1", { title: "TypeScript 5.0 リリース" });
    const compiled = normalizeFilter(makeFilter(["/typescript \\d+/"]));
    expect(matchesKeywordFilter(article, compiled)).toBe(true);
  });

  test("正規表現 exclude がマッチすれば除外", () => {
    const article = makeArticle("1", "f1", { title: "PR #123 更新" });
    const compiled = normalizeFilter(makeFilter([], ["/PR #\\d+/"]));
    expect(matchesKeywordFilter(article, compiled)).toBe(false);
  });

  test("matchCategories が true のとき categories もマッチ対象になる", () => {
    const article = makeArticle("1", "f1", {
      title: "普通の記事",
      summary: "普通の内容",
      categories: ["tech", "javascript"],
    });
    const compiled = normalizeFilter(makeFilter(["javascript"], [], true));
    expect(matchesKeywordFilter(article, compiled)).toBe(true);
  });

  test("matchCategories が未設定のとき categories はマッチ対象外", () => {
    const article = makeArticle("1", "f1", {
      title: "普通の記事",
      summary: "普通の内容",
      categories: ["javascript"],
    });
    const compiled = normalizeFilter(makeFilter(["javascript"]));
    expect(matchesKeywordFilter(article, compiled)).toBe(false);
  });

  test("metadata の value もマッチ対象になる", () => {
    const article = makeArticle("1", "f1", {
      title: "求人情報",
      summary: "概要",
      metadata: [{ key: "company", value: "Google" }],
    });
    const compiled = normalizeFilter(makeFilter(["google"]));
    expect(matchesKeywordFilter(article, compiled)).toBe(true);
  });

  test("include の OR 条件: いずれか1つマッチすれば通過", () => {
    const article = makeArticle("1", "f1", { title: "Rustの紹介" });
    const compiled = normalizeFilter(makeFilter(["typescript", "rust", "go"]));
    expect(matchesKeywordFilter(article, compiled)).toBe(true);
  });

  test("exclude の OR 条件: いずれか1つマッチすれば除外", () => {
    const article = makeArticle("1", "f1", { title: "スポンサー記事" });
    const compiled = normalizeFilter(makeFilter([], ["広告", "スポンサー", "pr"]));
    expect(matchesKeywordFilter(article, compiled)).toBe(false);
  });

  test("ReDoS パターン (null) は不マッチ扱い", () => {
    const compiled: CompiledKeywordFilter = {
      // lgtm[js/redos] — intentional fixture: includePatterns[0] is pre-set to null
      include: ["/(a+)+/"],
      exclude: [],
      includePatterns: [null],
      excludePatterns: [],
    };
    const article = makeArticle("1", "f1", { title: "aaaaaaa" });
    expect(matchesKeywordFilter(article, compiled)).toBe(false);
  });
});

// ── buildFilterMap ─────────────────────────────────────────────

test.describe("buildFilterMap", () => {
  test("複数フィードのフィルタマップを構築する", () => {
    const items = [
      { id: "feed1", filter: makeFilter(["ai"]) },
      { id: "feed2", filter: makeFilter([], ["spam"]) },
    ];
    const map = buildFilterMap(items, (item) => item.id);
    expect(map.size).toBe(2);
    expect(map.get("feed1")?.include).toEqual(["ai"]);
    expect(map.get("feed2")?.exclude).toEqual(["spam"]);
  });

  test("フィルタなしフィードはマップに含まれない", () => {
    const items = [
      { id: "feed1", filter: makeFilter(["ai"]) },
      { id: "feed2" },
      { id: "feed3", filter: makeFilter([], []) },
    ];
    const map = buildFilterMap(items, (item) => item.id);
    expect(map.size).toBe(1);
    expect(map.has("feed1")).toBe(true);
    expect(map.has("feed2")).toBe(false);
    expect(map.has("feed3")).toBe(false);
  });

  test("compiledCache を渡すと同一フィルターをキャッシュする", () => {
    const cache = new Map<string, CompiledKeywordFilter>();
    const filter = makeFilter(["test"]);
    const items = [
      { id: "feed1", filter },
      { id: "feed2", filter },
    ];
    const map = buildFilterMap(items, (item) => item.id, cache);
    expect(map.get("feed1")).toBe(map.get("feed2"));
    expect(cache.size).toBe(1);
  });

  test("空の items でも空のマップを返す", () => {
    const map = buildFilterMap([], (item: { id: string }) => item.id);
    expect(map.size).toBe(0);
  });

  test("正規表現フィルターを含むフィードも正しくコンパイルされる", () => {
    const items = [{ id: "feed1", filter: makeFilter(["/\\d+/"]) }];
    const map = buildFilterMap(items, (item) => item.id);
    const compiled = map.get("feed1");
    expect(compiled?.includePatterns[0]).toBeInstanceOf(RegExp);
  });
});
