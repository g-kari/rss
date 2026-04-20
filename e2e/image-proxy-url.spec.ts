import { test, expect } from "@playwright/test";
import { buildImageProxyUrl, isProxiedImageUrl } from "../src/lib/image-proxy-url";

/**
 * image-proxy URL 組み立てユーティリティの単体テスト。
 * Issue #125: 既にプロキシ化済みの相対 URL を再ラップして二重ラップ
 * `/api/image-proxy?url=%2Fapi%2Fimage-proxy%3F...` を生成しないことを検証する。
 */

test.describe("buildImageProxyUrl", () => {
  test("絶対 URL (https) を /api/image-proxy?url=<encoded> に変換する", () => {
    const url = "https://example.com/img.jpg";
    expect(buildImageProxyUrl(url)).toBe(
      "/api/image-proxy?url=https%3A%2F%2Fexample.com%2Fimg.jpg",
    );
  });

  test("絶対 URL (http) も同様に変換する", () => {
    const url = "http://example.com/img.jpg";
    expect(buildImageProxyUrl(url)).toBe("/api/image-proxy?url=http%3A%2F%2Fexample.com%2Fimg.jpg");
  });

  test("URL 内のクエリ文字列も正しくエンコードする", () => {
    const url = "https://example.com/img?a=1&b=2";
    expect(buildImageProxyUrl(url)).toBe(
      "/api/image-proxy?url=https%3A%2F%2Fexample.com%2Fimg%3Fa%3D1%26b%3D2",
    );
  });

  test("既にプロキシ化済みの相対 URL は二重ラップせずそのまま返す (Issue #125)", () => {
    // Issue #125 の再現: inside-games.jp の画像が既にプロキシ URL で渡された場合
    const proxied = "/api/image-proxy?url=https%3A%2F%2Fwww.inside-games.jp%2Fimgs%2F1.jpg";
    expect(buildImageProxyUrl(proxied)).toBe(proxied);
    expect(buildImageProxyUrl(proxied)).not.toContain("%2Fapi%2Fimage-proxy");
  });

  test("複数回適用しても結果は冪等 (Issue #125)", () => {
    const url = "https://example.com/img.jpg";
    const once = buildImageProxyUrl(url);
    const twice = buildImageProxyUrl(once);
    const thrice = buildImageProxyUrl(twice);
    expect(twice).toBe(once);
    expect(thrice).toBe(once);
  });
});

test.describe("isProxiedImageUrl", () => {
  test("プロキシ経由の相対 URL は true", () => {
    expect(isProxiedImageUrl("/api/image-proxy?url=https%3A%2F%2Fexample.com%2Fa.jpg")).toBe(true);
  });

  test("絶対 URL は false", () => {
    expect(isProxiedImageUrl("https://example.com/a.jpg")).toBe(false);
    expect(isProxiedImageUrl("http://example.com/a.jpg")).toBe(false);
  });

  test("他の相対パスは false", () => {
    expect(isProxiedImageUrl("/api/other?url=x")).toBe(false);
    expect(isProxiedImageUrl("/assets/icon.png")).toBe(false);
    expect(isProxiedImageUrl("")).toBe(false);
  });
});
