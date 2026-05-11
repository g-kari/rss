import { test, expect } from "@playwright/test";
import { rewriteVideoUrls } from "../src/lib/html-video-processors";

test.describe("rewriteVideoUrls", () => {
  test("<video src='https://...'> を /api/video-proxy 経由に書き換える", () => {
    const html = '<video controls src="https://example.com/clip.mp4"></video>';
    const result = rewriteVideoUrls(html);
    expect(result).toContain("/api/video-proxy?url=https%3A%2F%2Fexample.com%2Fclip.mp4");
  });

  test("<source src='https://...'> も書き換える", () => {
    const html =
      '<video controls><source src="https://example.com/v.mp4" type="video/mp4"></video>';
    const result = rewriteVideoUrls(html);
    expect(result).toContain("/api/video-proxy?url=https%3A%2F%2Fexample.com%2Fv.mp4");
  });

  test("data: URL は書き換えない", () => {
    const html = '<video src="data:video/mp4;base64,AAAA"></video>';
    const result = rewriteVideoUrls(html);
    expect(result).toContain('src="data:video/mp4;base64,AAAA"');
    expect(result).not.toContain("/api/video-proxy");
  });

  test("相対 URL は書き換えない (Workers 側で base 解決不能)", () => {
    const html = '<video src="/local/clip.mp4"></video>';
    const result = rewriteVideoUrls(html);
    expect(result).toContain('src="/local/clip.mp4"');
    expect(result).not.toContain("/api/video-proxy");
  });

  test("controls / poster 等の属性は保持", () => {
    const html =
      '<video controls poster="https://example.com/p.jpg" src="https://example.com/v.mp4"></video>';
    const result = rewriteVideoUrls(html);
    expect(result).toContain("controls");
    expect(result).toContain('poster="https://example.com/p.jpg"');
  });

  test("既にプロキシ化済 URL は再書き換えしない (idempotent)", () => {
    const html = '<video src="/api/video-proxy?url=https%3A%2F%2Fexample.com%2Fv.mp4"></video>';
    const result = rewriteVideoUrls(html);
    expect(result).toBe(html);
    // f(f(x)) === f(x)
    expect(rewriteVideoUrls(result)).toBe(result);
  });

  test("複数の video 要素を全て書き換える", () => {
    const html =
      '<video src="https://a.com/x.mp4"></video><video src="https://b.com/y.webm"></video>';
    const result = rewriteVideoUrls(html);
    expect(result).toContain("a.com%2Fx.mp4");
    expect(result).toContain("b.com%2Fy.webm");
  });

  test("video 要素なしの HTML は変更されない", () => {
    const html = '<p>no video</p><img src="https://example.com/p.jpg">';
    const result = rewriteVideoUrls(html);
    expect(result).toBe(html);
  });
});
