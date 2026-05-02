import { test, expect } from "@playwright/test";
import { normalizeOgpFetchUrl, buildFetchHeaders } from "../src/lib/ogp";

/**
 * normalizeOgpFetchUrl / buildFetchHeaders の回帰テスト。
 * x.com / twitter.com 系ドメインは OGP を返さないため、
 * vxtwitter.com に置き換えて取得する。
 * vxtwitter.com 等のプロキシはボット UA にのみ OGP を返すため、
 * ボット UA を使って fetch する。
 */

test.describe("normalizeOgpFetchUrl — Twitter/X 系ホスト", () => {
  test("x.com を vxtwitter.com に置換する", () => {
    expect(normalizeOgpFetchUrl("https://x.com/user/status/123")).toBe(
      "https://vxtwitter.com/user/status/123",
    );
  });

  test("twitter.com を vxtwitter.com に置換する", () => {
    expect(normalizeOgpFetchUrl("https://twitter.com/user/status/123")).toBe(
      "https://vxtwitter.com/user/status/123",
    );
  });

  test("www.x.com を vxtwitter.com に置換する", () => {
    expect(normalizeOgpFetchUrl("https://www.x.com/user/status/123")).toBe(
      "https://vxtwitter.com/user/status/123",
    );
  });

  test("www.twitter.com を vxtwitter.com に置換する", () => {
    expect(normalizeOgpFetchUrl("https://www.twitter.com/user/status/123")).toBe(
      "https://vxtwitter.com/user/status/123",
    );
  });

  test("mobile.twitter.com を vxtwitter.com に置換する", () => {
    expect(normalizeOgpFetchUrl("https://mobile.twitter.com/user/status/123")).toBe(
      "https://vxtwitter.com/user/status/123",
    );
  });

  test("大文字ホスト名でも置換する", () => {
    expect(normalizeOgpFetchUrl("https://X.COM/user/status/123")).toBe(
      "https://vxtwitter.com/user/status/123",
    );
  });

  test("クエリ文字列とフラグメントを保持する", () => {
    expect(normalizeOgpFetchUrl("https://x.com/user/status/123?s=20#frag")).toBe(
      "https://vxtwitter.com/user/status/123?s=20#frag",
    );
  });
});

test.describe("normalizeOgpFetchUrl — 他ホストは変更しない", () => {
  test("example.com はそのまま返す", () => {
    expect(normalizeOgpFetchUrl("https://example.com/page")).toBe("https://example.com/page");
  });

  test("x.com.example.com のような偽装ホストは変更しない", () => {
    expect(normalizeOgpFetchUrl("https://x.com.evil.example/page")).toBe(
      "https://x.com.evil.example/page",
    );
  });

  test("vxtwitter.com 自体は変更しない", () => {
    expect(normalizeOgpFetchUrl("https://vxtwitter.com/user/status/123")).toBe(
      "https://vxtwitter.com/user/status/123",
    );
  });
});

test.describe("normalizeOgpFetchUrl — 不正入力", () => {
  test("不正な URL はそのまま返す", () => {
    expect(normalizeOgpFetchUrl("not a url")).toBe("not a url");
  });

  test("空文字はそのまま返す", () => {
    expect(normalizeOgpFetchUrl("")).toBe("");
  });
});

test.describe("buildFetchHeaders — OGP プロキシホストにはボット UA を使う", () => {
  test("vxtwitter.com にはボット UA を使用する", () => {
    const headers = buildFetchHeaders("https://vxtwitter.com/user/status/123");
    expect(headers["User-Agent"]).toBe("Twitterbot/1.0");
  });

  test("fxtwitter.com にはボット UA を使用する", () => {
    const headers = buildFetchHeaders("https://fxtwitter.com/user/status/123");
    expect(headers["User-Agent"]).toBe("Twitterbot/1.0");
  });

  test("fixupx.com にはボット UA を使用する", () => {
    const headers = buildFetchHeaders("https://fixupx.com/user/status/123");
    expect(headers["User-Agent"]).toBe("Twitterbot/1.0");
  });

  test("通常ホストにはブラウザ UA を使用する", () => {
    const headers = buildFetchHeaders("https://example.com/page");
    expect(headers["User-Agent"]).toContain("Mozilla/5.0");
    expect(headers["User-Agent"]).not.toBe("Twitterbot/1.0");
  });

  test("x.com 自体は変換済み前提のため通常 UA", () => {
    const headers = buildFetchHeaders("https://x.com/user/status/123");
    expect(headers["User-Agent"]).toContain("Mozilla/5.0");
  });

  test("不正 URL にはデフォルトヘッダーを返す", () => {
    const headers = buildFetchHeaders("not a url");
    expect(headers["User-Agent"]).toContain("Mozilla/5.0");
  });

  test("ボット UA でも Accept ヘッダーは維持する", () => {
    const headers = buildFetchHeaders("https://vxtwitter.com/user/status/123");
    expect(headers["Accept"]).toContain("text/html");
    expect(headers["Accept-Language"]).toBeDefined();
  });
});
