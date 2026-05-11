import { test, expect } from "@playwright/test";
import { preprocessTtsText, buildTtsText } from "../src/lib/tts-text";

/**
 * preprocessTtsText の単体テスト。
 *
 * TTS（読み上げ）に渡すテキストを事前整形する純粋関数。
 * 主な目的: URL を含むテキストでアルファベット 1 文字ずつ
 * 読み上げられるのを避けるため、URL を「リンク」のような短い
 * 日本語トークンに置換する（#655）。
 */

test.describe("preprocessTtsText — URL 置換", () => {
  test("空文字列はそのまま空文字列を返す", () => {
    expect(preprocessTtsText("")).toBe("");
  });

  test("URL を含まないテキストはそのまま返す", () => {
    const input = "これは普通の文章です。";
    expect(preprocessTtsText(input)).toBe(input);
  });

  test("https:// から始まる URL を「リンク」に置換する", () => {
    const input = "詳しくは https://example.com を見てね";
    expect(preprocessTtsText(input)).toBe("詳しくは リンク を見てね");
  });

  test("http:// から始まる URL も置換する", () => {
    const input = "古いサイト http://example.org/page";
    expect(preprocessTtsText(input)).toBe("古いサイト リンク");
  });

  test("複数の URL を全て置換する", () => {
    const input = "A: https://a.example.com B: https://b.example.com";
    expect(preprocessTtsText(input)).toBe("A: リンク B: リンク");
  });

  test("URL に続く句読点は URL に含めない（読み上げで自然に止まる）", () => {
    const input = "https://example.com、ご覧ください";
    expect(preprocessTtsText(input)).toBe("リンク、ご覧ください");
  });

  test("URL 末尾の半角ピリオドは URL に含めない", () => {
    const input = "詳細は https://example.com です。";
    expect(preprocessTtsText(input)).toBe("詳細は リンク です。");
  });

  test("URL 末尾の閉じ括弧は URL に含めない", () => {
    const input = "(https://example.com) ご覧あれ";
    expect(preprocessTtsText(input)).toBe("(リンク) ご覧あれ");
  });

  test("クエリ・フラグメント付き URL も置換する", () => {
    const input = "https://example.com/path?a=1&b=2#section";
    expect(preprocessTtsText(input)).toBe("リンク");
  });

  test("日本語ドメイン・パーセントエンコード URL も置換する", () => {
    const input = "https://example.com/%E3%81%82 を参照";
    expect(preprocessTtsText(input)).toBe("リンク を参照");
  });

  test("改行を跨いだ複数 URL もそれぞれ置換する", () => {
    const input = "https://a.example.com\nhttps://b.example.com";
    expect(preprocessTtsText(input)).toBe("リンク\nリンク");
  });

  test("ftp:// などスキーム違いは置換しない（http(s) のみ対象）", () => {
    const input = "ftp://example.com";
    expect(preprocessTtsText(input)).toBe("ftp://example.com");
  });
});

/**
 * buildTtsText の単体テスト。
 *
 * 優先順位 (高→低):
 *   1. translatedText (autoTranslate 完了時)
 *   2. processedContent (フェッチ済み or RSS 本文)
 *   3. article.summary (RSS サマリ)
 *
 * タイトルは原文のまま先頭に付ける（翻訳対象は本文のみ）。
 */
test.describe("buildTtsText — ソース優先順位", () => {
  test("translatedText があれば最優先（#653: 自動翻訳時に翻訳側を読む）", () => {
    const article = { title: "Title", summary: "Summary" };
    const result = buildTtsText(article, "<p>Original processed</p>", "翻訳済み本文");
    expect(result).toBe("Title\n\n翻訳済み本文");
  });

  test("translatedText がなければ processedContent を使う", () => {
    const article = { title: "Title", summary: "Summary" };
    const result = buildTtsText(article, "<p>Processed content</p>", null);
    expect(result).toBe("Title\n\nProcessed content");
  });

  test("processedContent もなければ summary を使う", () => {
    const article = { title: "Title", summary: "Summary text" };
    const result = buildTtsText(article, null, null);
    expect(result).toBe("Title\n\nSummary text");
  });

  test("title が空でも本文だけは返す", () => {
    const article = { title: "", summary: "" };
    const result = buildTtsText(article, "<p>本文のみ</p>", null);
    expect(result).toBe("本文のみ");
  });

  test("translatedText が HTML でも plain 化される", () => {
    const article = { title: "Title", summary: "" };
    const result = buildTtsText(article, null, "<p>翻訳<br>本文</p>");
    expect(result).toContain("Title");
    expect(result).toContain("翻訳");
    expect(result).toContain("本文");
  });

  test("URL は preprocess で「リンク」に置換される", () => {
    const article = { title: "Title", summary: "" };
    const result = buildTtsText(article, "詳細は https://example.com を参照", null);
    expect(result).toBe("Title\n\n詳細は リンク を参照");
  });

  test("translatedText が空文字なら fallback（空翻訳の保護）", () => {
    const article = { title: "Title", summary: "Summary" };
    const result = buildTtsText(article, "Processed", "");
    expect(result).toBe("Title\n\nProcessed");
  });
});

test.describe("buildTtsText: summaryText (#696)", () => {
  test("summaryText が指定されたら最優先で使う (autoMode + autoSummarize)", () => {
    const article = { title: "T", summary: "S" };
    const result = buildTtsText(article, "<p>処理済み本文</p>", "翻訳本文", "要約本文");
    expect(result).toBe("T\n\n要約本文");
  });

  test("summaryText が空文字なら translatedText に fallback", () => {
    const article = { title: "T", summary: "S" };
    const result = buildTtsText(article, "<p>処理済み</p>", "翻訳本文", "");
    expect(result).toBe("T\n\n翻訳本文");
  });

  test("summaryText が null なら従来の優先順位 (translatedText / processedContent / summary)", () => {
    const article = { title: "T", summary: "S" };
    const result = buildTtsText(article, "<p>処理済み</p>", null, null);
    expect(result).toBe("T\n\n処理済み");
  });

  test("summaryText だけ指定 (translatedText / processedContent なし) でも動く", () => {
    const article = { title: "T", summary: "S" };
    const result = buildTtsText(article, null, null, "要約のみ");
    expect(result).toBe("T\n\n要約のみ");
  });

  test("summaryText も URL 置換が効く", () => {
    const article = { title: "T", summary: "" };
    const result = buildTtsText(article, null, null, "詳細は https://example.com を参照");
    expect(result).toBe("T\n\n詳細は リンク を参照");
  });
});

test.describe("buildTtsText: noteText (#724)", () => {
  test("noteText が指定されたら本文末尾に「メモ: <text>」で連結する", () => {
    const article = { title: "T", summary: "" };
    const result = buildTtsText(article, "本文", null, null, "覚えておく");
    expect(result).toBe("T\n\n本文\n\nメモ: 覚えておく");
  });

  test("noteText が null なら本文末尾に何も追加しない (既存挙動)", () => {
    const article = { title: "T", summary: "" };
    const result = buildTtsText(article, "本文", null, null, null);
    expect(result).toBe("T\n\n本文");
  });

  test("noteText が空文字 / 空白のみなら追加しない", () => {
    const article = { title: "T", summary: "" };
    expect(buildTtsText(article, "本文", null, null, "")).toBe("T\n\n本文");
    expect(buildTtsText(article, "本文", null, null, "   \n  ")).toBe("T\n\n本文");
  });

  test("noteText に URL があっても preprocess で「リンク」に置換される", () => {
    const article = { title: "T", summary: "" };
    const result = buildTtsText(article, "本文", null, null, "詳細 https://example.com");
    expect(result).toBe("T\n\n本文\n\nメモ: 詳細 リンク");
  });
});

test.describe("buildTtsText: x.com / twitter.com OGP fallback (#718)", () => {
  test("x.com + JS error processedContent → article.summary (OGP) を読み上げる", () => {
    const article = {
      title: "user tweet",
      summary: "今日は良い天気だった",
      link: "https://x.com/user/status/12345",
    };
    const result = buildTtsText(article, "JavaScript is not available.", null, null, null);
    expect(result).toBe("user tweet\n\n今日は良い天気だった");
  });

  test("twitter.com + JS error processedContent → article.summary fallback", () => {
    const article = {
      title: "tweet title",
      summary: "ツイートの本文",
      link: "https://twitter.com/user/status/12345",
    };
    const result = buildTtsText(article, "Please enable JavaScript", null, null, null);
    expect(result).toBe("tweet title\n\nツイートの本文");
  });

  test("x.com + 通常 tweet content → processedContent をそのまま使う (fallback 不発動)", () => {
    const article = {
      title: "T",
      summary: "サマリー",
      link: "https://x.com/user/status/12345",
    };
    const result = buildTtsText(article, "通常のツイート本文", null, null, null);
    expect(result).toBe("T\n\n通常のツイート本文");
  });

  test("非 x.com + JS error content → fallback しない (他サイトでは元の挙動維持)", () => {
    const article = {
      title: "T",
      summary: "サマリー",
      link: "https://example.com/article",
    };
    const result = buildTtsText(article, "JavaScript is not available", null, null, null);
    // x.com ではないので processedContent をそのまま使う
    expect(result).toBe("T\n\nJavaScript is not available");
  });

  test("x.com + JS error + translatedText あり → translatedText 優先 (fallback 経路は processedContent のみ)", () => {
    const article = {
      title: "T",
      summary: "サマリー",
      link: "https://x.com/user/status/12345",
    };
    const result = buildTtsText(article, "JavaScript is not available", "翻訳本文", null, null);
    expect(result).toBe("T\n\n翻訳本文");
  });
});
