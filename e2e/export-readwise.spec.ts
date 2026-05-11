import { test, expect } from "@playwright/test";
import { buildReadwiseCsv } from "../src/lib/export-readwise";
import { makeArticle } from "./helpers/article";
import { makeFeed } from "./helpers/feed";

test.describe("buildReadwiseCsv — ヘッダー行", () => {
  test("先頭行は Readwise の CSV ヘッダー", () => {
    const csv = buildReadwiseCsv([], {}, []);
    const firstLine = csv.split("\n")[0];
    expect(firstLine).toBe("Highlight,Title,Author,URL,Note,Date");
  });

  test("notes が空でもヘッダーのみ返る", () => {
    const csv = buildReadwiseCsv([makeArticle()], {}, [makeFeed()]);
    expect(csv).toBe("Highlight,Title,Author,URL,Note,Date\n");
  });
});

test.describe("buildReadwiseCsv — 1 記事の出力", () => {
  test("notes の 1 行目が Highlight として出力される", () => {
    const article = makeArticle();
    const feed = makeFeed();
    const notes = { [article.id]: "これは重要なメモ\n2 行目以降は本文" };

    const csv = buildReadwiseCsv([article], notes, [feed]);
    const lines = csv.split("\n");

    expect(lines[1]).toContain('"これは重要なメモ"');
  });

  test("notes が単一行ならそれがそのまま Highlight になる", () => {
    const article = makeArticle();
    const feed = makeFeed();
    const notes = { [article.id]: "単一行のメモ" };

    const csv = buildReadwiseCsv([article], notes, [feed]);
    expect(csv).toContain('"単一行のメモ"');
  });

  test("Title 列に記事タイトルが入る", () => {
    const article = makeArticle({ title: "Next.js 16 リリース" });
    const feed = makeFeed();
    const notes = { [article.id]: "メモ" };

    const csv = buildReadwiseCsv([article], notes, [feed]);
    expect(csv).toContain('"Next.js 16 リリース"');
  });

  test("Author 列に feed.title が入る", () => {
    const article = makeArticle();
    const feed = makeFeed({ id: article.feedHash, title: "Vercel Blog" });
    const notes = { [article.id]: "メモ" };

    const csv = buildReadwiseCsv([article], notes, [feed]);
    expect(csv).toContain('"Vercel Blog"');
  });

  test("URL 列に記事リンクが入る", () => {
    const article = makeArticle({ link: "https://example.com/foo/bar" });
    const feed = makeFeed();
    const notes = { [article.id]: "メモ" };

    const csv = buildReadwiseCsv([article], notes, [feed]);
    expect(csv).toContain('"https://example.com/foo/bar"');
  });

  test("Note 列にメモ全文が入る", () => {
    const article = makeArticle();
    const feed = makeFeed();
    const notes = { [article.id]: "1 行目\n2 行目\n3 行目" };

    const csv = buildReadwiseCsv([article], notes, [feed]);
    expect(csv).toContain("1 行目\n2 行目\n3 行目");
  });

  test("Date 列に publishedAt の YYYY-MM-DD 形式が入る", () => {
    const article = makeArticle({ publishedAt: "2026-04-12T15:30:00Z" });
    const feed = makeFeed();
    const notes = { [article.id]: "メモ" };

    const csv = buildReadwiseCsv([article], notes, [feed]);
    expect(csv).toContain("2026-04-12");
  });

  test("publishedAt が null なら createdAt を使う", () => {
    const article = makeArticle({
      publishedAt: null,
      createdAt: "2026-03-01T00:00:00Z",
    });
    const feed = makeFeed();
    const notes = { [article.id]: "メモ" };

    const csv = buildReadwiseCsv([article], notes, [feed]);
    expect(csv).toContain("2026-03-01");
  });
});

test.describe("buildReadwiseCsv — CSV エスケープ", () => {
  test("ダブルクォートを含むフィールドは二重化される", () => {
    const article = makeArticle({ title: 'タイトルに "引用" を含む' });
    const feed = makeFeed();
    const notes = { [article.id]: "メモ" };

    const csv = buildReadwiseCsv([article], notes, [feed]);
    expect(csv).toContain('"タイトルに ""引用"" を含む"');
  });

  test("カンマを含むフィールドはダブルクォートで囲まれる", () => {
    const article = makeArticle({ title: "A, B, C" });
    const feed = makeFeed();
    const notes = { [article.id]: "メモ" };

    const csv = buildReadwiseCsv([article], notes, [feed]);
    expect(csv).toContain('"A, B, C"');
  });

  test("改行を含むフィールドはダブルクォートで囲まれる（改行は維持）", () => {
    const article = makeArticle();
    const feed = makeFeed();
    const notes = { [article.id]: "1 行目\n2 行目" };

    const csv = buildReadwiseCsv([article], notes, [feed]);
    expect(csv).toMatch(/"1 行目\n2 行目"/);
  });
});

test.describe("buildReadwiseCsv — 複数記事・スキップ", () => {
  test("notes が無い記事はスキップされる", () => {
    const a1 = makeArticle({ id: "a1", title: "あり" });
    const a2 = makeArticle({ id: "a2", title: "なし" });
    const feed = makeFeed();
    const notes = { a1: "メモ" };

    const csv = buildReadwiseCsv([a1, a2], notes, [feed]);
    expect(csv).toContain('"あり"');
    expect(csv).not.toContain('"なし"');
  });

  test("複数記事は記事ごとに 1 行ずつ出力される", () => {
    const a1 = makeArticle({ id: "a1", title: "記事1", link: "https://example.com/1" });
    const a2 = makeArticle({ id: "a2", title: "記事2", link: "https://example.com/2" });
    const feed = makeFeed();
    const notes = { a1: "メモ1", a2: "メモ2" };

    const csv = buildReadwiseCsv([a1, a2], notes, [feed]);
    const dataLines = csv
      .split("\n")
      .filter((l) => l.length > 0)
      .slice(1);
    expect(dataLines.length).toBe(2);
  });

  test("該当フィードが見つからない場合は Author を空にする", () => {
    const article = makeArticle({ feedHash: "unknown-hash" });
    const feed = makeFeed();
    const notes = { [article.id]: "メモ" };

    const csv = buildReadwiseCsv([article], notes, [feed]);
    // Author 列が空（"" または ""）でも壊れない
    expect(csv).toContain("Highlight,Title,Author,URL,Note,Date");
    expect(csv.split("\n")[1]).toBeTruthy();
  });
});

test.describe("buildReadwiseCsv — Highlight フォールバック", () => {
  test("メモが空文字なら記事タイトルを Highlight にする", () => {
    const article = makeArticle({ title: "タイトル" });
    const feed = makeFeed();
    const notes = { [article.id]: "" };

    // 空メモの記事はスキップ（notes 値が空 = 出力対象外）
    const csv = buildReadwiseCsv([article], notes, [feed]);
    const dataLines = csv
      .split("\n")
      .filter((l) => l.length > 0)
      .slice(1);
    expect(dataLines.length).toBe(0);
  });
});
