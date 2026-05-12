/**
 * extractBoothFallbackUrl (#750) の挙動 spec。
 *
 * x.com 系フィードの post text に booth.pm URL を含む場合のみ fallback URL を返す
 * 仕様を全分岐網羅 (host 判定 × summary 内 URL 形式 × edge case)。
 */
import { describe, it, expect } from "vitest";
import { extractBoothFallbackUrl } from "./booth-fallback";

describe("extractBoothFallbackUrl (#750)", () => {
  it("x.com link + summary 内 booth.pm URL → URL を返す", () => {
    expect(
      extractBoothFallbackUrl({
        link: "https://x.com/example/status/123",
        summary: "新商品です! https://example.booth.pm/items/9999 #booth",
      }),
    ).toBe("https://example.booth.pm/items/9999");
  });

  it("twitter.com link + bare host booth.pm URL → URL を返す", () => {
    expect(
      extractBoothFallbackUrl({
        link: "https://twitter.com/example/status/123",
        summary: "チェックしてね https://booth.pm/ja/items/42",
      }),
    ).toBe("https://booth.pm/ja/items/42");
  });

  it("mobile.x.com link でも host 判定 pass", () => {
    expect(
      extractBoothFallbackUrl({
        link: "https://mobile.x.com/example/status/123",
        summary: "https://example.booth.pm/items/1",
      }),
    ).toBe("https://example.booth.pm/items/1");
  });

  it("非 x.com link (例: zenn.dev) → null (booth URL があっても無視)", () => {
    expect(
      extractBoothFallbackUrl({
        link: "https://zenn.dev/example/articles/abc",
        summary: "https://example.booth.pm/items/1",
      }),
    ).toBeNull();
  });

  it("x.com link + summary に booth.pm なし → null", () => {
    expect(
      extractBoothFallbackUrl({
        link: "https://x.com/example/status/123",
        summary: "Hello world",
      }),
    ).toBeNull();
  });

  it("link が null / undefined → null", () => {
    expect(extractBoothFallbackUrl({ link: null, summary: "https://booth.pm/x" })).toBeNull();
    expect(extractBoothFallbackUrl({ summary: "https://booth.pm/x" })).toBeNull();
  });

  it("summary が null / undefined / 空文字 → null", () => {
    expect(extractBoothFallbackUrl({ link: "https://x.com/x", summary: null })).toBeNull();
    expect(extractBoothFallbackUrl({ link: "https://x.com/x" })).toBeNull();
    expect(extractBoothFallbackUrl({ link: "https://x.com/x", summary: "" })).toBeNull();
  });

  it("summary に複数の booth.pm URL → 最初の hit を返す", () => {
    expect(
      extractBoothFallbackUrl({
        link: "https://x.com/example/status/123",
        summary: "https://a.booth.pm/items/1 と https://b.booth.pm/items/2",
      }),
    ).toBe("https://a.booth.pm/items/1");
  });

  it("URL 末尾の whitespace / quote / 角括弧で停止", () => {
    expect(
      extractBoothFallbackUrl({
        link: "https://x.com/x",
        summary: '<a href="https://example.booth.pm/items/1">link</a>',
      }),
    ).toBe("https://example.booth.pm/items/1");
  });

  it("不正な link (URL parse 失敗) → null", () => {
    expect(
      extractBoothFallbackUrl({
        link: "not-a-url",
        summary: "https://example.booth.pm/items/1",
      }),
    ).toBeNull();
  });

  it("booth.pm 以外のドメイン (例: booth.com / booth.example) は match しない", () => {
    expect(
      extractBoothFallbackUrl({
        link: "https://x.com/x",
        summary: "https://booth.example.com/items/1",
      }),
    ).toBeNull();
  });

  it("http:// (非 HTTPS) booth.pm URL も対応 (RSS feed の旧 link 形式)", () => {
    expect(
      extractBoothFallbackUrl({
        link: "https://x.com/x",
        summary: "http://example.booth.pm/items/1",
      }),
    ).toBe("http://example.booth.pm/items/1");
  });
});
