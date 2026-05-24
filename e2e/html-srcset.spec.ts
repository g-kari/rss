import { test, expect } from "@playwright/test";
import { transformSrcset } from "../src/lib/html-srcset";

/**
 * `transformSrcset` の境界値 spec (#752 bug fix 由来 + 2 pipeline caller を持つ純粋関数)。
 *
 * 経由: `html-image-processors.ts#fixLazyImages` (相対 URL 解決) と
 *       `html-media-processors.ts#rewriteMediaSrcAttrs` (image / video proxy 書き換え) の
 *       両方が transformSrcset を呼ぶため、本 spec は parser 自体の境界値を担保する。
 *
 * 規範: `quality-checks.md § バグ修正の事前判定チェックリスト` + `testing-and-workflow.md § TDD`
 */

test.describe("transformSrcset — 基本ケース", () => {
  test("単純な単一 URL (descriptor なし) を変換する", () => {
    const result = transformSrcset("https://example.com/a.jpg", (url) => `/proxy?u=${url}`);
    expect(result).toBe("/proxy?u=https://example.com/a.jpg");
  });

  test("descriptor (2x / 480w) を保持して変換する", () => {
    const input = "https://example.com/a.jpg 1x, https://example.com/b.jpg 2x";
    const result = transformSrcset(input, (url) => url.toUpperCase());
    expect(result).toBe("HTTPS://EXAMPLE.COM/A.JPG 1x, HTTPS://EXAMPLE.COM/B.JPG 2x");
  });

  test("空 srcset は空文字を返す", () => {
    expect(transformSrcset("", (url) => `/proxy?u=${url}`)).toBe("");
  });

  test("空白のみの srcset は空文字を返す", () => {
    expect(transformSrcset("   \t\n  ", (url) => `/proxy?u=${url}`)).toBe("");
  });

  test("rewriteUrl 関数を全 URL に適用する", () => {
    const calls: string[] = [];
    const result = transformSrcset(
      "https://a.com/1.jpg 1x, https://b.com/2.jpg 2x, https://c.com/3.jpg 3x",
      (url) => {
        calls.push(url);
        return `R:${url}`;
      },
    );
    expect(calls).toEqual(["https://a.com/1.jpg", "https://b.com/2.jpg", "https://c.com/3.jpg"]);
    expect(result).toBe(
      "R:https://a.com/1.jpg 1x, R:https://b.com/2.jpg 2x, R:https://c.com/3.jpg 3x",
    );
  });
});

test.describe("transformSrcset — Cloudinary path 内カンマ含み URL (#752 真因)", () => {
  test("Cloudinary URL (path 内に `,` 含む) を分割せず単一 URL として扱う", () => {
    // Cloudinary は `c_limit,f_auto,w_640` のように path 内に生の `,` を含む。
    // 旧実装の split(",") では `c_limit` `f_auto` `w_640` に誤分割されたが、
    // 新実装 (whitespace 境界 + 末尾 `,` のみ候補区切り) では正しく単一 URL 扱い。
    const input =
      "https://res.cloudinary.com/demo/image/upload/c_limit,f_auto,w_640/sample.jpg 640w";
    const result = transformSrcset(input, (url) => url);
    expect(result).toBe(
      "https://res.cloudinary.com/demo/image/upload/c_limit,f_auto,w_640/sample.jpg 640w",
    );
  });

  test("Cloudinary URL + 複数候補で正しく分割する", () => {
    const input =
      "https://res.cloudinary.com/d/c_limit,w_320/s.jpg 320w, https://res.cloudinary.com/d/c_limit,w_640/s.jpg 640w";
    const result = transformSrcset(input, (url) => `P(${url})`);
    expect(result).toBe(
      "P(https://res.cloudinary.com/d/c_limit,w_320/s.jpg) 320w, P(https://res.cloudinary.com/d/c_limit,w_640/s.jpg) 640w",
    );
  });
});

test.describe("transformSrcset — trailing comma 境界 (descriptor なし)", () => {
  test("descriptor なし URL 末尾の `,` + whitespace で次候補に分割", () => {
    // HTML srcset 仕様: URL 後の空白がなく `,` だけ続く場合、候補区切りは「URL 末尾 `,` のみ」。
    // 次 URL の前に whitespace があれば 2 URL として分割。
    const input = "https://a.com/1.jpg, https://b.com/2.jpg";
    const result = transformSrcset(input, (url) => `R:${url}`);
    expect(result).toBe("R:https://a.com/1.jpg, R:https://b.com/2.jpg");
  });

  test("URL 末尾の複数 `,,` + whitespace でも候補区切りとして剥がす", () => {
    // 末尾 trailing comma が複数あっても繰り返し剥がしの実装 (while url.endsWith(","))
    const input = "https://a.com/1.jpg,, https://b.com/2.jpg";
    const result = transformSrcset(input, (url) => `R:${url}`);
    expect(result).toBe("R:https://a.com/1.jpg, R:https://b.com/2.jpg");
  });
});

test.describe("transformSrcset — 出力フォーマット", () => {
  test("複数候補の join は `, ` (カンマ + 半角スペース) 形式", () => {
    const input = "https://a.com/1.jpg 1x, https://b.com/2.jpg 2x";
    const result = transformSrcset(input, (url) => url);
    // 出力 separator は ', ' 固定 (HTML srcset 仕様準拠)
    expect(result).toBe("https://a.com/1.jpg 1x, https://b.com/2.jpg 2x");
    expect(result).not.toContain(",,");
  });

  test("descriptor 内の連続空白は trim される", () => {
    const input = "https://a.com/1.jpg     2x";
    const result = transformSrcset(input, (url) => url);
    expect(result).toBe("https://a.com/1.jpg 2x");
  });

  test("rewriteUrl identity (no-op) で入力と同等の正規化形式を返す", () => {
    const input = "https://a.com/1.jpg 1x, https://b.com/2.jpg 2x";
    expect(transformSrcset(input, (u) => u)).toBe(input);
  });
});
