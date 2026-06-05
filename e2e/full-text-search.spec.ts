import { test, expect } from "@playwright/test";
import {
  parseSearchQuery,
  matchesAdvancedQuery,
  compileSearchQuery,
  type SearchContext,
} from "../src/lib/full-text-search";

const BASE = {
  id: "a1",
  feedHash: "feed-hash-1",
  title: "TypeScript で始める関数型プログラミング",
  summary: "モナドとファンクターの使い方を解説します。",
  content: "<p>圏論の入り口となる Functor / Monad について本文で詳しく扱います。</p>",
  author: "山田 太郎",
  categories: ["TypeScript", "関数型", "プログラミング"],
  link: "https://example.com/a1",
  publishedAt: "2026-04-01T00:00:00.000Z",
  createdAt: "2026-04-01T00:00:00.000Z",
  guid: "g1",
};

const CTX: SearchContext = {
  feedTitleByHash: new Map([
    ["feed-hash-1", "Zenn Trend"],
    ["feed-hash-2", "DevelopersIO"],
  ]),
};

test.describe("parseSearchQuery — 基本", () => {
  test("空クエリは null", () => {
    expect(parseSearchQuery("")).toBeNull();
    expect(parseSearchQuery("   ")).toBeNull();
  });

  test("単一語は TERM", () => {
    const ast = parseSearchQuery("TypeScript");
    expect(ast?.kind).toBe("TERM");
  });

  test("空白区切りは AND", () => {
    const ast = parseSearchQuery("foo bar");
    expect(ast?.kind).toBe("AND");
  });

  test("OR キーワードで OR ノード", () => {
    const ast = parseSearchQuery("foo OR bar");
    expect(ast?.kind).toBe("OR");
  });

  test("フィールド指定 title:foo は TERM with field", () => {
    const ast = parseSearchQuery("title:foo");
    expect(ast).toEqual({ kind: "TERM", field: "title", value: "foo" });
  });

  test("否定 -foo は NOT", () => {
    const ast = parseSearchQuery("-foo");
    expect(ast?.kind).toBe("NOT");
  });

  test('フレーズ "hello world" は単一 TERM', () => {
    const ast = parseSearchQuery('"hello world"');
    expect(ast).toEqual({ kind: "TERM", value: "hello world" });
  });

  test("複合: title:foo OR author:bar", () => {
    const ast = parseSearchQuery("title:foo OR author:bar");
    expect(ast?.kind).toBe("OR");
  });
});

test.describe("matchesAdvancedQuery — 既存互換 (構文無し)", () => {
  test("空クエリは true", () => {
    expect(matchesAdvancedQuery(BASE, "", CTX)).toBe(true);
  });

  test("タイトル単語にマッチ", () => {
    expect(matchesAdvancedQuery(BASE, "TypeScript", CTX)).toBe(true);
  });

  test("サマリーにマッチ", () => {
    expect(matchesAdvancedQuery(BASE, "モナド", CTX)).toBe(true);
  });

  test("本文 (content) もマッチ対象", () => {
    expect(matchesAdvancedQuery(BASE, "圏論", CTX)).toBe(true);
  });

  test("content 内の HTML タグはマッチしない", () => {
    expect(matchesAdvancedQuery(BASE, "<p>", CTX)).toBe(false);
  });

  test("author にマッチ", () => {
    expect(matchesAdvancedQuery(BASE, "山田", CTX)).toBe(true);
  });

  test("category にマッチ", () => {
    expect(matchesAdvancedQuery(BASE, "関数型", CTX)).toBe(true);
  });

  test("マッチしない単語は false", () => {
    expect(matchesAdvancedQuery(BASE, "Rust", CTX)).toBe(false);
  });

  test("AND: 全語マッチで true", () => {
    expect(matchesAdvancedQuery(BASE, "TypeScript モナド", CTX)).toBe(true);
  });

  test("AND: 1 語ミスマッチで false", () => {
    expect(matchesAdvancedQuery(BASE, "TypeScript Rust", CTX)).toBe(false);
  });

  test("大文字小文字を無視", () => {
    expect(matchesAdvancedQuery(BASE, "typescript", CTX)).toBe(true);
  });
});

test.describe("matchesAdvancedQuery — フィールド指定", () => {
  test("title:TypeScript はタイトルにのみマッチ", () => {
    expect(matchesAdvancedQuery(BASE, "title:TypeScript", CTX)).toBe(true);
    expect(matchesAdvancedQuery(BASE, "title:モナド", CTX)).toBe(false);
  });

  test("author:山田 は著者にのみマッチ", () => {
    expect(matchesAdvancedQuery(BASE, "author:山田", CTX)).toBe(true);
    expect(matchesAdvancedQuery(BASE, "author:TypeScript", CTX)).toBe(false);
  });

  test("category:関数型 はカテゴリにのみマッチ", () => {
    expect(matchesAdvancedQuery(BASE, "category:関数型", CTX)).toBe(true);
    expect(matchesAdvancedQuery(BASE, "category:山田", CTX)).toBe(false);
  });

  test("feed:Zenn はフィード名にマッチ", () => {
    expect(matchesAdvancedQuery(BASE, "feed:Zenn", CTX)).toBe(true);
    expect(matchesAdvancedQuery(BASE, "feed:DevelopersIO", CTX)).toBe(false);
  });

  test("content:圏論 は本文にのみマッチ", () => {
    expect(matchesAdvancedQuery(BASE, "content:圏論", CTX)).toBe(true);
    expect(matchesAdvancedQuery(BASE, "content:TypeScript", CTX)).toBe(false);
  });

  test("不明なフィールドは普通の語として扱う", () => {
    // 'foo:bar' のような不明な接頭辞は、既存検索で 'foo:bar' という文字列を探す
    expect(matchesAdvancedQuery(BASE, "foo:bar", CTX)).toBe(false);
  });
});

test.describe("content: フィールド検索の haystack キャッシュ (#1091)", () => {
  test("content: 検索後に contentHaystackCache へ stripHtml 結果が書き込まれる", () => {
    const cache = new Map<string, string>();
    const ctx: SearchContext = { feedTitleByHash: new Map(), contentHaystackCache: cache };
    expect(matchesAdvancedQuery(BASE, "content:圏論", ctx)).toBe(true);
    // cache に article.id キーで stripHtml + toLowerCase 済みの本文が保存される
    const cached = cache.get(BASE.id);
    expect(cached).toBeDefined();
    expect(cached).not.toContain("<p>"); // タグは除去済み
    expect(cached).toContain("圏論");
    expect(cached).toContain("functor"); // toLowerCase 済み (元は Functor)
  });

  test("contentHaystackCache に既存値があればそれを使う (再 stripHtml しない)", () => {
    // cache を poison して「cache が読まれる」ことを証明する
    const cache = new Map<string, string>([[BASE.id, "poisoned-cached-value"]]);
    const ctx: SearchContext = { feedTitleByHash: new Map(), contentHaystackCache: cache };
    // cache 値にマッチ
    expect(matchesAdvancedQuery(BASE, "content:poisoned", ctx)).toBe(true);
    // 実際の本文 (圏論) は cache で上書きされているのでマッチしない (= 再計算していない証拠)
    expect(matchesAdvancedQuery(BASE, "content:圏論", ctx)).toBe(false);
  });

  test("contentHaystackCache 未指定でも従来通り content: 検索は機能する", () => {
    const ctx: SearchContext = { feedTitleByHash: new Map() };
    expect(matchesAdvancedQuery(BASE, "content:圏論", ctx)).toBe(true);
    expect(matchesAdvancedQuery(BASE, "content:TypeScript", ctx)).toBe(false);
  });
});

test.describe("matchesAdvancedQuery — OR / AND / NOT", () => {
  test("OR: どちらか一方マッチで true", () => {
    expect(matchesAdvancedQuery(BASE, "Rust OR TypeScript", CTX)).toBe(true);
  });

  test("OR: 両方ミスで false", () => {
    expect(matchesAdvancedQuery(BASE, "Rust OR Java", CTX)).toBe(false);
  });

  test("否定: -Rust は true (Rust は含まない)", () => {
    expect(matchesAdvancedQuery(BASE, "-Rust", CTX)).toBe(true);
  });

  test("否定: -TypeScript は false", () => {
    expect(matchesAdvancedQuery(BASE, "-TypeScript", CTX)).toBe(false);
  });

  test("AND + NOT 組合せ: TypeScript -Rust", () => {
    expect(matchesAdvancedQuery(BASE, "TypeScript -Rust", CTX)).toBe(true);
    expect(matchesAdvancedQuery(BASE, "TypeScript -モナド", CTX)).toBe(false);
  });

  test("OR は AND より優先度が低い: A B OR C は (A AND B) OR C", () => {
    // TypeScript モナド OR Rust → (TypeScript AND モナド) OR Rust → true
    expect(matchesAdvancedQuery(BASE, "TypeScript モナド OR Rust", CTX)).toBe(true);
    // Rust モナド OR TypeScript → (Rust AND モナド) OR TypeScript → true
    expect(matchesAdvancedQuery(BASE, "Rust モナド OR TypeScript", CTX)).toBe(true);
    // Rust モナド OR Java → false
    expect(matchesAdvancedQuery(BASE, "Rust モナド OR Java", CTX)).toBe(false);
  });
});

test.describe("matchesAdvancedQuery — フレーズ検索", () => {
  test('"山田 太郎" はフルネームでマッチ', () => {
    expect(matchesAdvancedQuery(BASE, '"山田 太郎"', CTX)).toBe(true);
  });

  test('"太郎 山田" は順序が違うのでマッチしない', () => {
    expect(matchesAdvancedQuery(BASE, '"太郎 山田"', CTX)).toBe(false);
  });

  test("フィールド指定 + フレーズ", () => {
    expect(matchesAdvancedQuery(BASE, 'title:"始める関数型"', CTX)).toBe(true);
  });
});

test.describe("matchesAdvancedQuery — エッジケース", () => {
  test("author 未定義でもクラッシュしない", () => {
    const a = { ...BASE, author: undefined };
    expect(matchesAdvancedQuery(a, "author:山田", CTX)).toBe(false);
  });

  test("content 未定義でもクラッシュしない", () => {
    const a = { ...BASE, content: undefined };
    expect(matchesAdvancedQuery(a, "content:圏論", CTX)).toBe(false);
  });

  test("categories 未定義でもクラッシュしない", () => {
    const a = { ...BASE, categories: undefined };
    expect(matchesAdvancedQuery(a, "category:関数型", CTX)).toBe(false);
  });

  test("不明な feedHash でも feed: クエリでクラッシュしない", () => {
    const a = { ...BASE, feedHash: "unknown" };
    expect(matchesAdvancedQuery(a, "feed:Zenn", CTX)).toBe(false);
  });

  test("未閉鎖クォートは閉じたものとして扱う", () => {
    expect(matchesAdvancedQuery(BASE, '"TypeScript', CTX)).toBe(true);
    expect(matchesAdvancedQuery(BASE, 'title:"TypeScript', CTX)).toBe(true);
  });

  test("OR の大小を無視する", () => {
    expect(matchesAdvancedQuery(BASE, "Rust or TypeScript", CTX)).toBe(true);
    expect(matchesAdvancedQuery(BASE, "Rust Or TypeScript", CTX)).toBe(true);
    expect(matchesAdvancedQuery(BASE, "Rust oR TypeScript", CTX)).toBe(true);
  });

  test("ダッシュ - 単独はトークンとして無視", () => {
    expect(parseSearchQuery("-")).toBeNull();
  });

  test("title: 単体（値なし）はトークンとして無視", () => {
    expect(parseSearchQuery("title:")).toBeNull();
  });
});

// ==========================================================================
// compileSearchQuery — AST を 1 度だけパースして evaluator を返す
// ==========================================================================

test.describe("compileSearchQuery — perf 最適化用 (AST を再利用)", () => {
  test("空クエリは null を返す", () => {
    expect(compileSearchQuery("")).toBeNull();
    expect(compileSearchQuery("   ")).toBeNull();
  });

  test("有効なクエリは evaluator 関数を返す", () => {
    const evaluator = compileSearchQuery("TypeScript");
    expect(evaluator).not.toBeNull();
    expect(typeof evaluator).toBe("function");
  });

  test("evaluator は matchesAdvancedQuery と同じ判定結果を返す", () => {
    const evaluator = compileSearchQuery("TypeScript");
    expect(evaluator).not.toBeNull();
    if (!evaluator) return;
    expect(evaluator(BASE, CTX)).toBe(matchesAdvancedQuery(BASE, "TypeScript", CTX));
  });

  test("複合クエリ (AND/OR/NOT/フィールド) でも整合する", () => {
    const queries = ["title:TypeScript", "TypeScript -Rust", "TypeScript OR Rust", "feed:Zenn"];
    for (const q of queries) {
      const evaluator = compileSearchQuery(q);
      expect(evaluator).not.toBeNull();
      if (!evaluator) continue;
      expect(evaluator(BASE, CTX)).toBe(matchesAdvancedQuery(BASE, q, CTX));
    }
  });

  test("同一 evaluator を複数記事に適用しても各記事で正しい結果", () => {
    const evaluator = compileSearchQuery("TypeScript");
    if (!evaluator) throw new Error("expected evaluator");
    const otherArticle = { ...BASE, id: "a2", title: "Rust 入門", categories: ["Rust"] };
    expect(evaluator(BASE, CTX)).toBe(true);
    expect(evaluator(otherArticle, CTX)).toBe(false);
  });
});
