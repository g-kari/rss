import { test, expect } from "@playwright/test";
import { articleMatchesQuery } from "../src/lib/article-utils";

/**
 * articleMatchesQuery の単体テスト。
 *
 * 全文検索が title・summary・author・categories を AND 検索することを検証する。
 */

const BASE = {
  title: "TypeScript で始める関数型プログラミング",
  summary: "モナドとファンクターの使い方を解説します。",
  author: "山田 太郎",
  categories: ["TypeScript", "関数型", "プログラミング"],
};

test.describe("articleMatchesQuery — 基本動作", () => {
  test("空クエリは常に true を返す", () => {
    expect(articleMatchesQuery(BASE, "")).toBe(true);
    expect(articleMatchesQuery(BASE, "   ")).toBe(true);
  });

  test("タイトルにマッチする", () => {
    expect(articleMatchesQuery(BASE, "TypeScript")).toBe(true);
  });

  test("サマリーにマッチする", () => {
    expect(articleMatchesQuery(BASE, "モナド")).toBe(true);
  });

  test("マッチしないクエリは false を返す", () => {
    expect(articleMatchesQuery(BASE, "Rust")).toBe(false);
  });
});

test.describe("articleMatchesQuery — author 検索", () => {
  test("author 名でマッチする", () => {
    expect(articleMatchesQuery(BASE, "山田")).toBe(true);
  });

  test("author フルネームでマッチする", () => {
    expect(articleMatchesQuery(BASE, "山田 太郎")).toBe(true);
  });

  test("author が undefined のときエラーにならない", () => {
    const a = { title: "foo", summary: "bar" };
    expect(articleMatchesQuery(a, "山田")).toBe(false);
  });

  test("author が空文字のときエラーにならない", () => {
    const a = { title: "foo", summary: "bar", author: "" };
    expect(articleMatchesQuery(a, "山田")).toBe(false);
  });
});

test.describe("articleMatchesQuery — categories 検索", () => {
  test("categories の単語でマッチする", () => {
    expect(articleMatchesQuery(BASE, "関数型")).toBe(true);
  });

  test("categories に含まれる英語タグでマッチする", () => {
    expect(articleMatchesQuery(BASE, "typescript")).toBe(true); // 大文字小文字無視
  });

  test("categories が undefined のときエラーにならない", () => {
    const a = { title: "foo", summary: "bar" };
    expect(articleMatchesQuery(a, "関数型")).toBe(false);
  });

  test("categories が空配列のときエラーにならない", () => {
    const a = { title: "foo", summary: "bar", categories: [] };
    expect(articleMatchesQuery(a, "TypeScript")).toBe(false);
  });
});

test.describe("articleMatchesQuery — AND 検索（複数ワード）", () => {
  test("全ワードにマッチすれば true", () => {
    // title に TypeScript、summary にモナド
    expect(articleMatchesQuery(BASE, "TypeScript モナド")).toBe(true);
  });

  test("1 ワードでもミスマッチがあれば false", () => {
    expect(articleMatchesQuery(BASE, "TypeScript Rust")).toBe(false);
  });

  test("author + title のクロスフィールド AND", () => {
    // TypeScript は title に、山田 は author に存在
    expect(articleMatchesQuery(BASE, "TypeScript 山田")).toBe(true);
  });

  test("categories + author のクロスフィールド AND", () => {
    expect(articleMatchesQuery(BASE, "関数型 太郎")).toBe(true);
  });

  test("3 フィールドにまたがる AND", () => {
    // title=TypeScript、summary=モナド、author=山田
    expect(articleMatchesQuery(BASE, "TypeScript モナド 山田")).toBe(true);
  });
});

test.describe("articleMatchesQuery — 大文字小文字を無視", () => {
  test("大文字クエリでタイトルにマッチする", () => {
    expect(articleMatchesQuery(BASE, "TYPESCRIPT")).toBe(true);
  });

  test("混在ケースでマッチする", () => {
    expect(articleMatchesQuery(BASE, "TypeScript")).toBe(true);
  });
});

test.describe("articleMatchesQuery — 空白の正規化", () => {
  test("先頭・末尾の空白を無視する", () => {
    expect(articleMatchesQuery(BASE, "  TypeScript  ")).toBe(true);
  });

  test("連続空白をスペース1つとして扱う", () => {
    expect(articleMatchesQuery(BASE, "TypeScript   モナド")).toBe(true);
  });
});
