/**
 * html-image-processors spec — dedupeAdjacentDuplicateImages 純粋関数 (#893)
 *
 * lazy-load + noscript fallback pattern (例: PR TIMES `prcdn.freetls.fastly.net`) で
 * `<img data-src="X" src="data:..."><img src="X">` が並ぶ元 HTML に対し、
 * fixLazyImages 後に同一 src の <img> が 2 個連続する状況を集約する純粋関数の挙動を固定する。
 */
import { describe, it, expect } from "vitest";
import { dedupeAdjacentDuplicateImages } from "./html-image-processors";

describe("dedupeAdjacentDuplicateImages", () => {
  it("同一 src の隣接 <img> 2 個を 1 個に集約 (最初を残す)", () => {
    const html =
      '<figure><img src="https://example.com/a.jpg" alt="x"><img src="https://example.com/a.jpg" alt="x"></figure>';
    expect(dedupeAdjacentDuplicateImages(html)).toBe(
      '<figure><img src="https://example.com/a.jpg" alt="x"></figure>',
    );
  });

  it("同一 src 3 個連続を 1 個に集約", () => {
    const html = '<img src="a.jpg"><img src="a.jpg"><img src="a.jpg">';
    expect(dedupeAdjacentDuplicateImages(html)).toBe('<img src="a.jpg">');
  });

  it("異なる src の <img> は集約しない", () => {
    const html = '<img src="a.jpg"><img src="b.jpg">';
    expect(dedupeAdjacentDuplicateImages(html)).toBe(html);
  });

  it("空白・改行・タブを挟んだ同一 src も集約 (lazy + noscript 隣接)", () => {
    const html = '<img src="a.jpg">\n  <img src="a.jpg">';
    const result = dedupeAdjacentDuplicateImages(html);
    expect((result.match(/<img\b/g) || []).length).toBe(1);
  });

  it("間に別タグ (figcaption) が挟まると集約しない", () => {
    const html = '<img src="a.jpg"><figcaption>x</figcaption><img src="a.jpg">';
    expect(dedupeAdjacentDuplicateImages(html)).toBe(html);
  });

  it("属性違い (alt / data-src 等) でも src 同一なら最初の <img> (属性込み) を残す", () => {
    const html =
      '<img src="a.jpg" alt="" data-src="a.jpg" style="max-width: 1950px" loading="lazy"><img src="a.jpg" alt="" style="max-width: 1950px" loading="lazy">';
    const result = dedupeAdjacentDuplicateImages(html);
    expect((result.match(/<img\b/g) || []).length).toBe(1);
    expect(result).toContain('data-src="a.jpg"');
  });

  it("冪等: f(f(x)) === f(x)", () => {
    const html = '<img src="a.jpg"><img src="a.jpg"><img src="a.jpg">';
    const once = dedupeAdjacentDuplicateImages(html);
    const twice = dedupeAdjacentDuplicateImages(once);
    expect(twice).toBe(once);
  });

  it("PR TIMES 型: <figure><img src=X data-src=X><img src=X><figcaption>...</figcaption></figure>", () => {
    const url =
      "/api/image-proxy?url=https%3A%2F%2Fprcdn.freetls.fastly.net%2Frelease_image%2F5167%2F2242%2Fefc3.jpg";
    const html =
      `<figure>` +
      `<img src="${url}" alt="" data-src="${url}" style="max-width: 1950px" loading="lazy">` +
      `<img src="${url}" alt="" style="max-width: 1950px" loading="lazy">` +
      `<figcaption><span data-tts-sentence-idx="6">caption</span></figcaption>` +
      `</figure>`;
    const result = dedupeAdjacentDuplicateImages(html);
    expect((result.match(/<img\b/g) || []).length).toBe(1);
    expect(result).toContain("data-src=");
    expect(result).toContain("<figcaption>");
  });

  it("シングルクォート属性も dedupe", () => {
    const html = "<img src='a.jpg'><img src='a.jpg'>";
    const result = dedupeAdjacentDuplicateImages(html);
    expect((result.match(/<img\b/g) || []).length).toBe(1);
  });

  it("src 属性のない <img> は触らない", () => {
    const html = '<img alt="no src"><img alt="no src">';
    expect(dedupeAdjacentDuplicateImages(html)).toBe(html);
  });
});
