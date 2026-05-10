import { test, expect } from "@playwright/test";
import { resolveScriptLoadedImages } from "../src/lib/content";

/**
 * `resolveScriptLoadedImages` の純粋関数テスト。
 *
 * digitallover.moe で発見された WordPress プラグイン挙動:
 * `loadImage(elementId, jpgUrl, gifUrl)` で第 2 引数 = jpg (静止サムネ) /
 * 第 3 引数 = gif (本物の動的画像)。jpg が 404 を返すケースがあるため、
 * gif を優先採用する。
 */

test("loadImage 第 3 引数 (gif) があれば gif を src に採用", () => {
  const html = `
    <script>
      window.onload = function() {
        loadImage('img1', 'https://example.com/sample.jpg', 'https://example.com/sample.gif');
      };
    </script>
    <img id="img1" />
  `;
  const result = resolveScriptLoadedImages(html);
  expect(result).toContain('src="https://example.com/sample.gif"');
  expect(result).not.toContain('src="https://example.com/sample.jpg"');
});

test("loadImage 第 3 引数なしの場合は jpg を採用 (後方互換)", () => {
  const html = `
    <script>
      loadImage('img1', 'https://example.com/sample.jpg');
    </script>
    <img id="img1" />
  `;
  const result = resolveScriptLoadedImages(html);
  expect(result).toContain('src="https://example.com/sample.jpg"');
});

test("第 3 引数が相対 URL や非 https の場合は jpg にフォールバック", () => {
  const html = `
    <script>
      loadImage('img1', 'https://example.com/sample.jpg', '/relative/path.gif');
    </script>
    <img id="img1" />
  `;
  const result = resolveScriptLoadedImages(html);
  expect(result).toContain('src="https://example.com/sample.jpg"');
  expect(result).not.toContain('src="/relative/path.gif"');
});

test("jpg / gif 両方 https なら gif 優先", () => {
  const html = `
    <script>
      loadImage('img1', 'https://example.com/a.jpg', 'https://example.com/a.gif');
      loadImage('img2', 'https://example.com/b.jpg', 'https://example.com/b.gif');
    </script>
    <img id="img1" />
    <img id="img2" />
  `;
  const result = resolveScriptLoadedImages(html);
  expect(result).toContain('src="https://example.com/a.gif"');
  expect(result).toContain('src="https://example.com/b.gif"');
});

test("既存 src がある場合は変更しない (既に有効なら触らない)", () => {
  const html = `
    <script>
      loadImage('img1', 'https://example.com/new.jpg', 'https://example.com/new.gif');
    </script>
    <img id="img1" src="https://example.com/existing.png" />
  `;
  const result = resolveScriptLoadedImages(html);
  expect(result).toContain('src="https://example.com/existing.png"');
  // <img> の src 属性には new.gif が入っていない (script 内に文字列が残るのは無視)
  expect(result).not.toMatch(/<img[^>]+src="[^"]*new\.gif"/);
});

test("loadImage 呼び出しがない場合は元 HTML をそのまま返す", () => {
  const html = '<div><img id="img1" /></div>';
  expect(resolveScriptLoadedImages(html)).toBe(html);
});

test("digitallover.moe 実例: jpg=404 / gif=200 のケースで gif 採用", () => {
  // 実際の HTML 抜粋に近い形
  const html = `
    <script>
      window.onload = function() {
        loadImage('externalImage1', 'https://gyutto.com/data/item_img/2832/283294/283294_430.jpg', 'https://gyutto.com/data/item_img/2832/283294/283294_430.gif');
      };
    </script>
    <img id="externalImage1" />
  `;
  const result = resolveScriptLoadedImages(html);
  expect(result).toContain("283294_430.gif");
  expect(result).not.toMatch(/src="[^"]*283294_430\.jpg"/);
});
