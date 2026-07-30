import { describe, expect, it } from "vitest";
import { sanitizeLogUrl } from "./log-sanitize";

describe("sanitizeLogUrl", () => {
  it("通常の URL はそのまま返す", () => {
    expect(sanitizeLogUrl("https://example.com/feed.xml")).toBe("https://example.com/feed.xml");
  });

  it("CR / LF を除去する（ログインジェクション対策）", () => {
    expect(sanitizeLogUrl("https://example.com/\r\nFAKE LOG LINE")).toBe(
      "https://example.com/FAKE LOG LINE",
    );
  });

  it("CR 単独 / LF 単独のどちらも除去する", () => {
    expect(sanitizeLogUrl("a\rb\nc")).toBe("abc");
  });

  it("既定の最大長 256 文字で truncate する", () => {
    const long = "https://example.com/" + "a".repeat(500);
    expect(sanitizeLogUrl(long)).toHaveLength(256);
    expect(sanitizeLogUrl(long)).toBe(long.slice(0, 256));
  });

  it("maxLength を明示指定するとその長さで truncate する", () => {
    expect(sanitizeLogUrl("abcdefghij", 4)).toBe("abcd");
  });

  it("maxLength 以下の文字列は truncate しない", () => {
    expect(sanitizeLogUrl("abc", 128)).toBe("abc");
  });

  it("CRLF 除去は truncate より先に適用される（除去後の長さで切る）", () => {
    // "a\r\nb\r\nc" は除去後 "abc" (3 文字) なので maxLength 3 でも欠けない
    expect(sanitizeLogUrl("a\r\nb\r\nc", 3)).toBe("abc");
  });

  it("空文字列は空文字列を返す", () => {
    expect(sanitizeLogUrl("")).toBe("");
  });
});
