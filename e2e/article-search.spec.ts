import { test, expect } from "@playwright/test";
import { matchesAdvancedQuery, type SearchContext } from "../src/lib/full-text-search";

/**
 * matchesAdvancedQuery の単体テスト。
 *
 * 全文検索が title・summary・author・categories を AND 検索することを検証する。
 * （旧 articleMatchesQuery の機能は matchesAdvancedQuery に統合済み）
 */

const EMPTY_CTX: SearchContext = { feedTitleByHash: new Map() };

const BASE = {
  id: "base-article",
  feedHash: "",
  title: "TypeScript で始める関数型プログラミング",
  summary: "モナドとファンクターの使い方を解説します。",
  author: "山田 太郎",
  categories: ["TypeScript", "関数型", "プログラミング"],
};

const match = (
  article:
    | typeof BASE
    | {
        id: string;
        feedHash: string;
        title: string;
        summary: string;
        author?: string;
        categories?: string[];
      },
  query: string,
) => matchesAdvancedQuery(article, query, EMPTY_CTX);

test.describe("matchesAdvancedQuery — 基本動作", () => {
  test("空クエリは常に true を返す", () => {
    expect(match(BASE, "")).toBe(true);
    expect(match(BASE, "   ")).toBe(true);
  });

  test("タイトルにマッチする", () => {
    expect(match(BASE, "TypeScript")).toBe(true);
  });

  test("サマリーにマッチする", () => {
    expect(match(BASE, "モナド")).toBe(true);
  });

  test("マッチしないクエリは false を返す", () => {
    expect(match(BASE, "Rust")).toBe(false);
  });
});

test.describe("matchesAdvancedQuery — author 検索", () => {
  test("author 名でマッチする", () => {
    expect(match(BASE, "山田")).toBe(true);
  });

  test("author フルネームでマッチする", () => {
    expect(match(BASE, "山田 太郎")).toBe(true);
  });

  test("author が undefined のときエラーにならない", () => {
    const a = { id: "a", feedHash: "", title: "foo", summary: "bar" };
    expect(match(a, "山田")).toBe(false);
  });

  test("author が空文字のときエラーにならない", () => {
    const a = { id: "a", feedHash: "", title: "foo", summary: "bar", author: "" };
    expect(match(a, "山田")).toBe(false);
  });
});

test.describe("matchesAdvancedQuery — categories 検索", () => {
  test("categories の単語でマッチする", () => {
    expect(match(BASE, "関数型")).toBe(true);
  });

  test("categories に含まれる英語タグでマッチする", () => {
    expect(match(BASE, "typescript")).toBe(true); // 大文字小文字無視
  });

  test("categories が undefined のときエラーにならない", () => {
    const a = { id: "a", feedHash: "", title: "foo", summary: "bar" };
    expect(match(a, "関数型")).toBe(false);
  });

  test("categories が空配列のときエラーにならない", () => {
    const a = { id: "a", feedHash: "", title: "foo", summary: "bar", categories: [] };
    expect(match(a, "TypeScript")).toBe(false);
  });
});

test.describe("matchesAdvancedQuery — AND 検索（複数ワード）", () => {
  test("全ワードにマッチすれば true", () => {
    // title に TypeScript、summary にモナド
    expect(match(BASE, "TypeScript モナド")).toBe(true);
  });

  test("1 ワードでもミスマッチがあれば false", () => {
    expect(match(BASE, "TypeScript Rust")).toBe(false);
  });

  test("author + title のクロスフィールド AND", () => {
    // TypeScript は title に、山田 は author に存在
    expect(match(BASE, "TypeScript 山田")).toBe(true);
  });

  test("categories + author のクロスフィールド AND", () => {
    expect(match(BASE, "関数型 太郎")).toBe(true);
  });

  test("3 フィールドにまたがる AND", () => {
    // title=TypeScript、summary=モナド、author=山田
    expect(match(BASE, "TypeScript モナド 山田")).toBe(true);
  });
});

test.describe("matchesAdvancedQuery — 大文字小文字を無視", () => {
  test("大文字クエリでタイトルにマッチする", () => {
    expect(match(BASE, "TYPESCRIPT")).toBe(true);
  });

  test("混在ケースでマッチする", () => {
    expect(match(BASE, "TypeScript")).toBe(true);
  });
});

test.describe("matchesAdvancedQuery — 空白の正規化", () => {
  test("先頭・末尾の空白を無視する", () => {
    expect(match(BASE, "  TypeScript  ")).toBe(true);
  });

  test("連続空白をスペース1つとして扱う", () => {
    expect(match(BASE, "TypeScript   モナド")).toBe(true);
  });
});
