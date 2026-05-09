import { test, expect } from "@playwright/test";
import { removeOrphanedIconSvgs } from "../src/lib/html-noise-removal";

test.describe("removeOrphanedIconSvgs — 孤立 SVG icon 参照の除去", () => {
  test("孤立 <use> のみの SVG は除去される", () => {
    const input = `<p>before</p><svg><use xlink:href="#i-twitter" /></svg><p>after</p>`;
    expect(removeOrphanedIconSvgs(input)).toBe(`<p>before</p><p>after</p>`);
  });

  test("href 属性 (xlink なし) でも除去される", () => {
    const input = `<svg><use href="#icon" /></svg>`;
    expect(removeOrphanedIconSvgs(input)).toBe(``);
  });

  test("<use> の閉じタグ形式 (<use ...></use>) も除去対象", () => {
    const input = `<svg><use xlink:href="#x"></use></svg>`;
    expect(removeOrphanedIconSvgs(input)).toBe(``);
  });

  test("複数の孤立 <use> をまとめて除去", () => {
    const input = `<svg><use href="#a" /><use href="#b" /></svg>`;
    expect(removeOrphanedIconSvgs(input)).toBe(``);
  });

  test("<svg> 内に <path> があれば実コンテンツとして保持", () => {
    const input = `<svg viewBox="0 0 24 24"><path d="M10 10"/></svg>`;
    const result = removeOrphanedIconSvgs(input);
    expect(result).toContain(`<path d="M10 10"/>`);
    expect(result).toContain(`<svg`);
  });

  test("<svg> 内に <rect> 等の実描画要素があれば保持", () => {
    const input = `<svg><rect width="10" height="10" /></svg>`;
    const result = removeOrphanedIconSvgs(input);
    expect(result).toContain(`<rect`);
  });

  test("<svg> 内に <use> + 実コンテンツ混在なら保持", () => {
    // 実コンテンツがあれば <use> も含めて保持 (混合 SVG パターン)
    const input = `<svg><use href="#x" /><path d="M1 1"/></svg>`;
    const result = removeOrphanedIconSvgs(input);
    expect(result).toContain(`<svg`);
    expect(result).toContain(`<path`);
  });

  test("空白のみの <svg> も除去 (内側が <use> もなく空)", () => {
    const input = `<svg>   </svg>`;
    expect(removeOrphanedIconSvgs(input)).toBe(``);
  });

  test("親 <a> タグはそのまま残る (空 <a> になる可能性あり)", () => {
    const input = `<a href="https://example.com"><svg><use href="#x" /></svg></a>`;
    expect(removeOrphanedIconSvgs(input)).toBe(`<a href="https://example.com"></a>`);
  });

  test("attrs を持つ <svg> 実コンテンツは attrs ごと保持", () => {
    const input = `<svg viewBox="0 0 100 100" width="50"><circle cx="50" cy="50" r="40" /></svg>`;
    const result = removeOrphanedIconSvgs(input);
    expect(result).toContain(`viewBox="0 0 100 100"`);
    expect(result).toContain(`width="50"`);
    expect(result).toContain(`<circle`);
  });

  test("text を含む <svg> も保持 (テキストラベル付き SVG)", () => {
    const input = `<svg><text>Hello</text></svg>`;
    const result = removeOrphanedIconSvgs(input);
    expect(result).toContain(`<text>Hello</text>`);
  });

  test("ネストした <svg> (<svg> 内に <svg>) も処理される", () => {
    // 外側 svg は inner に内側 svg があるが、それも空なら全体除去
    const input = `<svg><svg><use href="#x" /></svg></svg>`;
    expect(removeOrphanedIconSvgs(input)).toBe(``);
  });

  test("実 <svg> の前後に孤立 <svg> が混在しても順序を保ちつつ片方だけ除去", () => {
    const input = `<svg><use href="#a" /></svg><svg><path d="M1 1"/></svg><svg><use href="#b" /></svg>`;
    const result = removeOrphanedIconSvgs(input);
    expect(result).toBe(`<svg><path d="M1 1"/></svg>`);
  });
});
