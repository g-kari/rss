/**
 * html-media-processors spec (#752 採用案 B)
 *
 * image / video の URL proxy 書き換えを統合した rewriteMediaSrcAttrs の TDD 仕様。
 * 既存 `e2e/html-post-processor.spec.ts` で image / video それぞれの動作は cover
 * 済のため、本 spec は統合関数自身の挙動と冪等性に絞る。
 */
import { describe, it, expect } from "vitest";
import { rewriteMediaSrcAttrs } from "./html-media-processors";

describe("rewriteMediaSrcAttrs - image", () => {
  it("<img src> 絶対 URL を /api/image-proxy 経由に書き換え", () => {
    const html = '<img src="https://example.com/cat.jpg">';
    const result = rewriteMediaSrcAttrs(html, { tags: ["img"], proxyPath: "image-proxy" });
    expect(result).toContain('src="/api/image-proxy?url=');
    expect(result).toContain(encodeURIComponent("https://example.com/cat.jpg"));
  });

  it("srcset: true で <img srcset> も rewrite", () => {
    const html = '<img srcset="https://example.com/a.jpg 1x, https://example.com/b.jpg 2x">';
    const result = rewriteMediaSrcAttrs(html, {
      tags: ["img"],
      proxyPath: "image-proxy",
      srcset: true,
    });
    expect(result).toContain("/api/image-proxy?url=");
    expect(result).toContain(encodeURIComponent("https://example.com/a.jpg"));
    expect(result).toContain(encodeURIComponent("https://example.com/b.jpg"));
  });

  it("srcset: false (未指定) なら srcset は touch しない", () => {
    const html = '<img src="https://example.com/cat.jpg" srcset="https://example.com/c.jpg 2x">';
    const result = rewriteMediaSrcAttrs(html, { tags: ["img"], proxyPath: "image-proxy" });
    expect(result).toContain(
      "/api/image-proxy?url=" + encodeURIComponent("https://example.com/cat.jpg"),
    );
    // srcset は元のまま
    expect(result).toContain('srcset="https://example.com/c.jpg 2x"');
  });
});

describe("rewriteMediaSrcAttrs - video / source", () => {
  it("<video src> と <source src> 両方を書き換え", () => {
    const html =
      '<video src="https://example.com/v.mp4"><source src="https://example.com/v2.webm"></video>';
    const result = rewriteMediaSrcAttrs(html, {
      tags: ["video", "source"],
      proxyPath: "video-proxy",
    });
    expect(result).toContain(
      "/api/video-proxy?url=" + encodeURIComponent("https://example.com/v.mp4"),
    );
    expect(result).toContain(
      "/api/video-proxy?url=" + encodeURIComponent("https://example.com/v2.webm"),
    );
  });

  it("opts.tags 配列で指定したタグのみ対象", () => {
    const html =
      '<video src="https://example.com/v.mp4"><source src="https://example.com/v2.webm">';
    const result = rewriteMediaSrcAttrs(html, { tags: ["video"], proxyPath: "video-proxy" });
    expect(result).toContain(
      "/api/video-proxy?url=" + encodeURIComponent("https://example.com/v.mp4"),
    );
    // <source> は touch されない (opts.tags に "source" 未指定)
    expect(result).toContain('<source src="https://example.com/v2.webm">');
  });
});

describe("rewriteMediaSrcAttrs - 冪等性 + skip 条件", () => {
  it("data: / 相対 URL は書き換えなし", () => {
    const html =
      '<img src="data:image/png;base64,AAA"><img src="/local/cat.jpg"><img src="../rel.jpg">';
    const result = rewriteMediaSrcAttrs(html, { tags: ["img"], proxyPath: "image-proxy" });
    expect(result).toBe(html);
  });

  it("既プロキシ化済 src は再書き換えしない (冪等性)", () => {
    const html = '<img src="/api/image-proxy?url=https%3A%2F%2Fexample.com%2Fcat.jpg">';
    const result = rewriteMediaSrcAttrs(html, { tags: ["img"], proxyPath: "image-proxy" });
    expect(result).toBe(html);
  });

  it("f(f(x)) === f(x) (連続適用で結果不変)", () => {
    const html =
      '<video src="https://example.com/v.mp4"><source src="https://example.com/v2.webm">';
    const opts = { tags: ["video", "source"] as const, proxyPath: "video-proxy" };
    const once = rewriteMediaSrcAttrs(html, opts);
    const twice = rewriteMediaSrcAttrs(once, opts);
    expect(twice).toBe(once);
  });

  it("空文字 / タグ未マッチでも安全", () => {
    expect(rewriteMediaSrcAttrs("", { tags: ["img"], proxyPath: "image-proxy" })).toBe("");
    expect(
      rewriteMediaSrcAttrs("<p>no media</p>", { tags: ["img"], proxyPath: "image-proxy" }),
    ).toBe("<p>no media</p>");
  });
});
