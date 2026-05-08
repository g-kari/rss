import { test, expect } from "@playwright/test";
import { preprocessTtsText } from "../src/lib/tts-text";

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
