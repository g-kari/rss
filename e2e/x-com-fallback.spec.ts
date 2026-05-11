import { test, expect } from "@playwright/test";
import { isXComHost, isJsDisabledContent, needsXComOgpFallback } from "../src/lib/x-com-fallback";

/**
 * x-com-fallback の単体テスト (#718)。
 *
 * x.com / twitter.com で JS 無効エラー content を検出して、TTS / AI fallback の
 * トリガーとして使う 3 純粋関数の挙動を網羅。
 */

test.describe("isXComHost — x.com / twitter.com 系ホスト判定", () => {
  test("x.com の URL → true", () => {
    expect(isXComHost("https://x.com/user/status/123")).toBe(true);
  });

  test("www.x.com / mobile.x.com → true", () => {
    expect(isXComHost("https://www.x.com/u/s/1")).toBe(true);
    expect(isXComHost("https://mobile.x.com/u/s/1")).toBe(true);
  });

  test("twitter.com (旧ドメイン) → true", () => {
    expect(isXComHost("https://twitter.com/user/status/123")).toBe(true);
    expect(isXComHost("https://mobile.twitter.com/u/s/1")).toBe(true);
  });

  test("nitter.net / fxtwitter.com / vxtwitter.com → false (別サービス)", () => {
    expect(isXComHost("https://nitter.net/user/status/123")).toBe(false);
    expect(isXComHost("https://fxtwitter.com/user/status/123")).toBe(false);
    expect(isXComHost("https://vxtwitter.com/user/status/123")).toBe(false);
  });

  test("一般的な記事 URL → false", () => {
    expect(isXComHost("https://example.com/article")).toBe(false);
    expect(isXComHost("https://qiita.com/user/items/abc")).toBe(false);
  });

  test("null / undefined / 空文字 → false", () => {
    expect(isXComHost(null)).toBe(false);
    expect(isXComHost(undefined)).toBe(false);
    expect(isXComHost("")).toBe(false);
  });

  test("不正な URL → false (URL constructor が throw → catch で false)", () => {
    expect(isXComHost("not-a-url")).toBe(false);
    expect(isXComHost("://invalid")).toBe(false);
  });

  test("hostname が大文字混じり → 小文字化して比較", () => {
    expect(isXComHost("https://X.COM/user/status/1")).toBe(true);
    expect(isXComHost("https://Twitter.com/u/s/1")).toBe(true);
  });
});

test.describe("isJsDisabledContent — JS 無効エラー文字列検出", () => {
  test("'JavaScript is not available' (x.com 英語) → true", () => {
    expect(isJsDisabledContent("JavaScript is not available.")).toBe(true);
    expect(isJsDisabledContent("Sorry, JavaScript is not available on this browser.")).toBe(true);
  });

  test("'JavaScript を有効' (x.com 日本語) → true", () => {
    expect(isJsDisabledContent("JavaScript を有効にしてください")).toBe(true);
  });

  test("'Please enable JavaScript' (汎用) → true", () => {
    expect(isJsDisabledContent("Please enable JavaScript to view this site")).toBe(true);
  });

  test("'JavaScript is disabled' / 'JavaScript が無効' → true", () => {
    expect(isJsDisabledContent("JavaScript is disabled in your browser")).toBe(true);
    expect(isJsDisabledContent("JavaScript が無効です")).toBe(true);
  });

  test("'Something went wrong, but don't fret' (x.com エラー) → true", () => {
    expect(isJsDisabledContent("Something went wrong, but don't fret")).toBe(true);
    expect(isJsDisabledContent("Something went wrong, but dont fret")).toBe(true);
  });

  test("通常の tweet 本文 → false", () => {
    expect(isJsDisabledContent("今日は良い天気だった。新しい機能をリリースしました")).toBe(false);
    expect(isJsDisabledContent("Just released a new feature. Check it out!")).toBe(false);
  });

  test("null / undefined / 空文字 → false", () => {
    expect(isJsDisabledContent(null)).toBe(false);
    expect(isJsDisabledContent(undefined)).toBe(false);
    expect(isJsDisabledContent("")).toBe(false);
  });

  test("長文記事の本文中に偶然 'JavaScript' が含まれる場合 (501 文字以降) → false (先頭 500 文字のみチェック)", () => {
    const padding = "あ".repeat(500);
    const content = padding + "ここで JavaScript is not available";
    expect(isJsDisabledContent(content)).toBe(false);
  });

  test("大文字小文字を区別しない (case-insensitive)", () => {
    expect(isJsDisabledContent("javascript is not available")).toBe(true);
    expect(isJsDisabledContent("JAVASCRIPT IS NOT AVAILABLE")).toBe(true);
  });
});

test.describe("needsXComOgpFallback — 統合判定 (host × content)", () => {
  test("x.com + JS error content → true", () => {
    expect(needsXComOgpFallback("https://x.com/u/status/1", "JavaScript is not available")).toBe(
      true,
    );
    expect(needsXComOgpFallback("https://twitter.com/u/status/1", "Please enable JavaScript")).toBe(
      true,
    );
  });

  test("x.com + 通常 tweet content → false (content が有効)", () => {
    expect(needsXComOgpFallback("https://x.com/u/status/1", "今日は良い天気でした")).toBe(false);
  });

  test("non-x.com + JS error content → false (host が対象外)", () => {
    expect(needsXComOgpFallback("https://example.com/article", "JavaScript is not available")).toBe(
      false,
    );
  });

  test("x.com + null content → false (空 content は fallback 不要)", () => {
    expect(needsXComOgpFallback("https://x.com/u/status/1", null)).toBe(false);
    expect(needsXComOgpFallback("https://x.com/u/status/1", "")).toBe(false);
  });

  test("null link + JS error content → false (host 判定不能)", () => {
    expect(needsXComOgpFallback(null, "JavaScript is not available")).toBe(false);
  });

  test("両方 null → false", () => {
    expect(needsXComOgpFallback(null, null)).toBe(false);
    expect(needsXComOgpFallback(undefined, undefined)).toBe(false);
  });
});
