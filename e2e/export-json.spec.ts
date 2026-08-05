import { test, expect } from "@playwright/test";
import {
  buildArticlesJson,
  buildNotesJson,
  buildSavedSearchesJson,
  buildSavedSearchesJsonFile,
  buildThemePresetsJson,
  buildThemePresetsJsonFile,
} from "../src/lib/export-json";
import type { ThemePreset } from "../src/lib/theme-preset";
import { makeArticle } from "./helpers/article";
import { makeFeed } from "./helpers/feed";

const NOW = new Date("2026-06-08T12:34:56.000Z");

test.describe("buildThemePresetsJson", () => {
  const presets: ThemePreset[] = [
    {
      id: "preset-1",
      name: "読書モード",
      theme: "dark",
      fontSize: "large",
      fontFamily: "serif",
      lineHeight: "relaxed",
      contentWidth: "medium",
      createdAt: 1_700_000_000_000,
    },
    {
      id: "preset-2",
      name: "コンパクト",
      theme: "light",
      fontSize: "small",
      fontFamily: "sans",
      lineHeight: "tight",
      contentWidth: "wide",
      createdAt: 1_710_000_000_000,
    },
  ];

  test("表示順と各プリセットの全フィールドを保持する", () => {
    expect(buildThemePresetsJson(presets, NOW)).toEqual({
      exportedAt: "2026-06-08T12:34:56.000Z",
      count: 2,
      presets,
    });
  });

  test("空配列では count 0 と presets 空配列を返す", () => {
    expect(buildThemePresetsJson([], NOW)).toEqual({
      exportedAt: "2026-06-08T12:34:56.000Z",
      count: 0,
      presets: [],
    });
  });

  test("日付付きファイル名と2スペースインデントのJSON本文を返す", () => {
    const result = buildThemePresetsJsonFile(presets, NOW);

    expect(result.filename).toBe("theme-presets_2026-06-08.json");
    expect(result.content).toBe(JSON.stringify(buildThemePresetsJson(presets, NOW), null, 2));
  });
});

test.describe("buildSavedSearchesJson", () => {
  const searches = [
    {
      id: "search-1",
      name: "AI 記事",
      query: "title:AI OR tag:機械学習",
      createdAt: "2026-06-01T01:02:03.000Z",
    },
    {
      id: "search-2",
      name: "未読の長文",
      query: "-is:read content:解説",
      createdAt: "2026-06-02T04:05:06.000Z",
    },
  ];

  test("表示順と各検索条件のフィールドを保持する", () => {
    const result = buildSavedSearchesJson(searches, NOW);

    expect(result).toEqual({
      exportedAt: "2026-06-08T12:34:56.000Z",
      count: 2,
      searches,
    });
  });

  test("空配列では count 0 と searches 空配列を返す", () => {
    const result = buildSavedSearchesJson([], NOW);

    expect(result.count).toBe(0);
    expect(result.searches).toEqual([]);
  });

  test("日付付きファイル名と2スペースインデントの JSON 本文を返す", () => {
    const result = buildSavedSearchesJsonFile(searches, NOW);

    expect(result.filename).toBe("saved-searches_2026-06-08.json");
    expect(result.content).toBe(JSON.stringify(buildSavedSearchesJson(searches, NOW), null, 2));
  });
});

test.describe("buildArticlesJson", () => {
  test("空の ids では count 0 + articles 空配列", () => {
    const result = buildArticlesJson([makeArticle()], new Set(), [], "bookmark", NOW);
    expect(result.count).toBe(0);
    expect(result.articles).toEqual([]);
  });

  test("mode bookmark の label は「ブックマーク」", () => {
    const result = buildArticlesJson([], new Set(), [], "bookmark", NOW);
    expect(result.label).toBe("ブックマーク");
  });

  test("mode reading_list の label は「後で読む」", () => {
    const result = buildArticlesJson([], new Set(), [], "reading_list", NOW);
    expect(result.label).toBe("後で読む");
  });

  test("labelOverride 指定時は mode 由来でなく override が label になる (#1112 コレクション export)", () => {
    const result = buildArticlesJson([], new Set(), [], "bookmark", NOW, "お気に入り");
    expect(result.label).toBe("お気に入り");
  });

  test("exportedAt は now の ISO 文字列", () => {
    const result = buildArticlesJson([], new Set(), [], "bookmark", NOW);
    expect(result.exportedAt).toBe("2026-06-08T12:34:56.000Z");
  });

  test("対象 ID の記事のみ抽出し count と一致する", () => {
    const articles = [
      makeArticle({ id: "a1" }),
      makeArticle({ id: "a2" }),
      makeArticle({ id: "a3" }),
    ];
    const result = buildArticlesJson(articles, new Set(["a1", "a3"]), [], "bookmark", NOW);
    expect(result.count).toBe(2);
    expect(result.articles.map((a) => a.title)).toHaveLength(2);
  });

  test("feedTitle は Feed.id === article.feedHash で解決される", () => {
    const article = makeArticle({ id: "a1", feedHash: "feed-x" });
    const feed = makeFeed({ id: "feed-x", title: "技術ブログ" });
    const result = buildArticlesJson([article], new Set(["a1"]), [feed], "bookmark", NOW);
    expect(result.articles[0].feedTitle).toBe("技術ブログ");
  });

  test("対応 Feed がないと feedTitle は「不明なフィード」", () => {
    const article = makeArticle({ id: "a1", feedHash: "missing" });
    const result = buildArticlesJson([article], new Set(["a1"]), [], "bookmark", NOW);
    expect(result.articles[0].feedTitle).toBe("不明なフィード");
  });

  test("url は article.link", () => {
    const article = makeArticle({ id: "a1", link: "https://example.com/x" });
    const result = buildArticlesJson([article], new Set(["a1"]), [], "bookmark", NOW);
    expect(result.articles[0].url).toBe("https://example.com/x");
  });

  test("summary は HTML 除去される", () => {
    const article = makeArticle({ id: "a1", summary: "<p>こんにちは<b>世界</b></p>" });
    const result = buildArticlesJson([article], new Set(["a1"]), [], "bookmark", NOW);
    expect(result.articles[0].summary).toBe("こんにちは世界");
  });

  test("summary は 300 文字に clamp される", () => {
    const article = makeArticle({ id: "a1", summary: "あ".repeat(500) });
    const result = buildArticlesJson([article], new Set(["a1"]), [], "bookmark", NOW);
    expect(result.articles[0].summary).toHaveLength(300);
  });

  test("summary が空なら空文字", () => {
    const article = makeArticle({ id: "a1", summary: "" });
    const result = buildArticlesJson([article], new Set(["a1"]), [], "bookmark", NOW);
    expect(result.articles[0].summary).toBe("");
  });

  test("author 未設定なら null", () => {
    const article = makeArticle({ id: "a1" });
    delete (article as { author?: string }).author;
    const result = buildArticlesJson([article], new Set(["a1"]), [], "bookmark", NOW);
    expect(result.articles[0].author).toBeNull();
  });

  test("author 設定済みならその値", () => {
    const article = makeArticle({ id: "a1", author: "山田太郎" });
    const result = buildArticlesJson([article], new Set(["a1"]), [], "bookmark", NOW);
    expect(result.articles[0].author).toBe("山田太郎");
  });

  test("publishedAt はそのまま渡る / 無ければ null", () => {
    const withDate = makeArticle({ id: "a1", publishedAt: "2026-05-01T00:00:00Z" });
    const r1 = buildArticlesJson([withDate], new Set(["a1"]), [], "bookmark", NOW);
    expect(r1.articles[0].publishedAt).toBe("2026-05-01T00:00:00Z");

    const noDate = makeArticle({ id: "a2" });
    delete (noDate as { publishedAt?: string | null }).publishedAt;
    const r2 = buildArticlesJson([noDate], new Set(["a2"]), [], "bookmark", NOW);
    expect(r2.articles[0].publishedAt).toBeNull();
  });

  test("categories は記事の値と順序を保持する", () => {
    const article = makeArticle({ id: "a1", categories: ["TypeScript", "Web"] });
    const result = buildArticlesJson([article], new Set(["a1"]), [], "bookmark", NOW);
    expect(result.articles[0]).toMatchObject({ categories: ["TypeScript", "Web"] });
  });

  test("categories 未設定なら空配列を出力する", () => {
    const article = makeArticle({ id: "a1", categories: undefined });
    const result = buildArticlesJson([article], new Set(["a1"]), [], "bookmark", NOW);
    expect(result.articles[0]).toMatchObject({ categories: [] });
  });

  test("categories は元記事と独立した配列として出力する", () => {
    const categories = ["TypeScript"];
    const article = makeArticle({ id: "a1", categories });
    const result = buildArticlesJson([article], new Set(["a1"]), [], "bookmark", NOW);
    categories.push("Web");
    expect(result.articles[0]).toMatchObject({ categories: ["TypeScript"] });
  });
});

test.describe("buildNotesJson", () => {
  test("メモのない記事は空 / count 0", () => {
    const result = buildNotesJson([makeArticle({ id: "a1" })], {}, [], NOW);
    expect(result.count).toBe(0);
    expect(result.notes).toEqual([]);
  });

  test("exportedAt は now の ISO 文字列", () => {
    const result = buildNotesJson([], {}, [], NOW);
    expect(result.exportedAt).toBe("2026-06-08T12:34:56.000Z");
  });

  test("メモのある記事のみ抽出し note 本文を含める", () => {
    const articles = [
      makeArticle({ id: "a1", title: "記事1" }),
      makeArticle({ id: "a2", title: "記事2" }),
    ];
    const result = buildNotesJson(articles, { a1: "これはメモ" }, [], NOW);
    expect(result.count).toBe(1);
    expect(result.notes[0].title).toBe("記事1");
    expect(result.notes[0].note).toBe("これはメモ");
  });

  test("feedTitle は Feed.id === article.feedHash で解決", () => {
    const article = makeArticle({ id: "a1", feedHash: "feed-x" });
    const feed = makeFeed({ id: "feed-x", title: "技術ブログ" });
    const result = buildNotesJson([article], { a1: "メモ" }, [feed], NOW);
    expect(result.notes[0].feedTitle).toBe("技術ブログ");
  });

  test("対応 Feed がないと feedTitle は「不明なフィード」", () => {
    const article = makeArticle({ id: "a1", feedHash: "missing" });
    const result = buildNotesJson([article], { a1: "メモ" }, [], NOW);
    expect(result.notes[0].feedTitle).toBe("不明なフィード");
  });

  test("url は article.link", () => {
    const article = makeArticle({ id: "a1", link: "https://example.com/x" });
    const result = buildNotesJson([article], { a1: "メモ" }, [], NOW);
    expect(result.notes[0].url).toBe("https://example.com/x");
  });

  test("改行を含むメモ本文もそのまま保持", () => {
    const article = makeArticle({ id: "a1" });
    const result = buildNotesJson([article], { a1: "1行目\n2行目" }, [], NOW);
    expect(result.notes[0].note).toBe("1行目\n2行目");
  });
});
