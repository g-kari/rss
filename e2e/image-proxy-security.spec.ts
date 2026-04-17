import { test, expect } from "@playwright/test";
import { isSameOriginImageRequest, isContentTypeConsistent } from "../src/lib/image-proxy-security";

/**
 * image-proxy の Origin 検証ロジック
 *
 * 同一オリジンからのリクエストのみ許可する。
 * - Sec-Fetch-Site ヘッダーがあれば優先して判定
 * - Sec-Fetch-Site がない場合は Referer を origin 比較
 */

const SELF_ORIGIN = "https://rss.0g0.xyz";

function headers(entries: Record<string, string>): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(entries)) h.set(k, v);
  return h;
}

test.describe("isSameOriginImageRequest — Sec-Fetch-Site 優先", () => {
  test("Sec-Fetch-Site: same-origin は許可", () => {
    expect(
      isSameOriginImageRequest(headers({ "sec-fetch-site": "same-origin" }), SELF_ORIGIN),
    ).toBe(true);
  });

  test("Sec-Fetch-Site: cross-site は拒否", () => {
    expect(isSameOriginImageRequest(headers({ "sec-fetch-site": "cross-site" }), SELF_ORIGIN)).toBe(
      false,
    );
  });

  test("Sec-Fetch-Site: same-site は拒否（厳格に same-origin のみ）", () => {
    expect(isSameOriginImageRequest(headers({ "sec-fetch-site": "same-site" }), SELF_ORIGIN)).toBe(
      false,
    );
  });

  test("Sec-Fetch-Site: none（アドレスバー直入力）は拒否", () => {
    expect(isSameOriginImageRequest(headers({ "sec-fetch-site": "none" }), SELF_ORIGIN)).toBe(
      false,
    );
  });
});

test.describe("isSameOriginImageRequest — Referer フォールバック", () => {
  test("Referer が同一 origin なら許可", () => {
    expect(
      isSameOriginImageRequest(headers({ referer: "https://rss.0g0.xyz/article/1" }), SELF_ORIGIN),
    ).toBe(true);
  });

  test("Referer が別 origin なら拒否", () => {
    expect(
      isSameOriginImageRequest(headers({ referer: "https://evil.example.com/" }), SELF_ORIGIN),
    ).toBe(false);
  });

  test("Referer が不正な URL なら拒否", () => {
    expect(isSameOriginImageRequest(headers({ referer: "not-a-url" }), SELF_ORIGIN)).toBe(false);
  });

  test("Referer も Sec-Fetch-Site もない場合は拒否", () => {
    expect(isSameOriginImageRequest(headers({}), SELF_ORIGIN)).toBe(false);
  });
});

test.describe("isContentTypeConsistent — Content-Type とマジックバイト MIME の整合性", () => {
  test("宣言なし（空 / octet-stream）ならマジックバイト側の MIME で常に許可", () => {
    expect(isContentTypeConsistent("", "image/jpeg")).toBe(true);
    expect(isContentTypeConsistent("application/octet-stream", "image/png")).toBe(true);
  });

  test("宣言とマジックバイトが一致すれば許可", () => {
    expect(isContentTypeConsistent("image/png", "image/png")).toBe(true);
    expect(isContentTypeConsistent("image/jpeg", "image/jpeg")).toBe(true);
  });

  test("JPEG を image/png と宣言した場合は拒否（偽装防止）", () => {
    expect(isContentTypeConsistent("image/png", "image/jpeg")).toBe(false);
  });

  test("image/jpg は image/jpeg と同一とみなす", () => {
    expect(isContentTypeConsistent("image/jpg", "image/jpeg")).toBe(true);
  });

  test("非画像の宣言（text/html 等）は拒否", () => {
    expect(isContentTypeConsistent("text/html", "image/png")).toBe(false);
  });
});
