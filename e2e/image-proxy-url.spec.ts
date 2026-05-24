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

// #812 真因 defensive: caller (ArticleContentBody.tsx の `(resolvedOgImage ?? article.ogImage)!` non-null assertion)
// から non-string が混入する経路 (cache 旧 schema / OGP fetch 失敗 fallback / object 型 ogImage) で
// `url.startsWith` が TypeError を投げて ErrorBoundary 発火する症状を構造的に防御する。
test.describe("buildImageProxyUrl — #812 defensive (unknown 受け)", () => {
  test("undefined は空文字を返す", () => {
    expect(buildImageProxyUrl(undefined as unknown as string)).toBe("");
  });
  test("null は空文字を返す", () => {
    expect(buildImageProxyUrl(null as unknown as string)).toBe("");
  });
  test("number は空文字を返す (本番 minified TypeError 防御)", () => {
    expect(buildImageProxyUrl(42 as unknown as string)).toBe("");
  });
  test("object は空文字を返す (#812 真因: ogImage が { url: ... } 形式で混入する経路)", () => {
    expect(buildImageProxyUrl({ url: "x.jpg" } as unknown as string)).toBe("");
  });
  test("array は空文字を返す", () => {
    expect(buildImageProxyUrl(["x.jpg"] as unknown as string)).toBe("");
  });
  test("boolean は空文字を返す", () => {
    expect(buildImageProxyUrl(true as unknown as string)).toBe("");
  });
  test("空文字は空文字のまま (regression、既存挙動互換)", () => {
    expect(buildImageProxyUrl("")).toBe("");
  });
});

test.describe("isProxiedImageUrl — #812 defensive (unknown 受け)", () => {
  test("undefined は false", () => {
    expect(isProxiedImageUrl(undefined as unknown as string)).toBe(false);
  });
  test("null は false", () => {
    expect(isProxiedImageUrl(null as unknown as string)).toBe(false);
  });
  test("number は false", () => {
    expect(isProxiedImageUrl(42 as unknown as string)).toBe(false);
  });
  test("object は false (本番 minified TypeError 防御)", () => {
    expect(isProxiedImageUrl({ url: "x.jpg" } as unknown as string)).toBe(false);
  });
  test("array は false", () => {
    expect(isProxiedImageUrl(["x.jpg"] as unknown as string)).toBe(false);
  });
  test("boolean は false", () => {
    expect(isProxiedImageUrl(true as unknown as string)).toBe(false);
  });
});
