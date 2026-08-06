import { test, expect } from "@playwright/test";
import { stripHtml, stripHtmlWithBreaks, toPlainText, unescapeHtml } from "../src/lib/html";

test("stripHtml — タグなしテキストはそのまま trim する", () => {
  expect(stripHtml("  plain text  ")).toBe("plain text");
});

test("toPlainText — タグなしテキストはエンティティだけ解決する", () => {
  expect(toPlainText("  plain &amp; text  ")).toBe("plain & text");
});

test("unescapeHtml — apos エンティティをアポストロフィに変換する", () => {
  expect(unescapeHtml("Rock &apos;n&apos; Roll")).toBe("Rock 'n' Roll");
});

test("unescapeHtml — nbsp エンティティを空白に変換する", () => {
  expect(unescapeHtml("Hello&nbsp;world")).toBe("Hello world");
});

test("unescapeHtml — copy と reg エンティティを記号に変換する", () => {
  expect(unescapeHtml("Brand&copy; Mark&reg;")).toBe("Brand© Mark®");
});

test.describe("stripHtmlWithBreaks", () => {
  test("<br> は改行に置換される", () => {
    expect(stripHtmlWithBreaks("foo<br>bar")).toBe("foo\nbar");
  });

  test("<BR> 大文字も改行に置換される", () => {
    expect(stripHtmlWithBreaks("foo<BR>bar")).toBe("foo\nbar");
  });

  test("self-closing <br/> も改行に置換される", () => {
    expect(stripHtmlWithBreaks("foo<br/>bar")).toBe("foo\nbar");
    expect(stripHtmlWithBreaks("foo<br />bar")).toBe("foo\nbar");
  });

  test("複数の <br> 連続は複数の改行になる", () => {
    expect(stripHtmlWithBreaks("foo<br><br>bar")).toBe("foo\n\nbar");
  });

  test("<p> も改行に置換される（先頭・末尾は trim）", () => {
    expect(stripHtmlWithBreaks("<p>foo</p><p>bar</p>")).toBe("foo\n\nbar");
  });

  test("<br> 以外のタグは除去のみ（連結）", () => {
    expect(stripHtmlWithBreaks("<b>foo</b><i>bar</i>")).toBe("foobar");
  });

  test("属性付き <br> も改行に置換される", () => {
    expect(stripHtmlWithBreaks('foo<br class="x">bar')).toBe("foo\nbar");
  });

  test("text のみは変化なし", () => {
    expect(stripHtmlWithBreaks("just text")).toBe("just text");
  });

  test("text のみの前後空白は trim される", () => {
    expect(stripHtmlWithBreaks("  just text  ")).toBe("just text");
  });

  test("HTML エンティティはそのまま（unescape は呼ばない）", () => {
    expect(stripHtmlWithBreaks("foo &amp; bar")).toBe("foo &amp; bar");
  });

  test("先頭・末尾の空白はトリムされる", () => {
    expect(stripHtmlWithBreaks("  <br>foo<br>  ")).toBe("foo");
  });
});
