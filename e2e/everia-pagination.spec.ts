/**
 * everia.club のページネーション検出再現テスト。
 *
 * everia.club の記事ページは WordPress の <!--nextpage--> 機能を使い、
 * ページネーションが「Pages: 1 [2] [3] [4] [5]」のような plain な
 * post-page-numbers リンクで表現される。URL は `/slug/2/`, `/slug/3/` の形式。
 */

import { test, expect } from "@playwright/test";
import { detectNextPageUrl } from "../src/lib/content";

test.describe("detectNextPageUrl — everia.club WordPress nextpage", () => {
  test("Pages: 1 [2] 形式のページネーションリンクから次ページ URL を取得", () => {
    const url = "https://everia.club/2026/05/06/cosplay-tiny-asa-nikke-velvet/";
    const html = `
<!DOCTYPE html>
<html>
<body>
<article>
<h1>Article Title</h1>
<img src="https://example.com/img1.jpg">
<p class="post-page-numbers">
Pages:
<span class="page-numbers current">1</span>
<a href="https://everia.club/2026/05/06/cosplay-tiny-asa-nikke-velvet/2/" class="post-page-numbers">2</a>
<a href="https://everia.club/2026/05/06/cosplay-tiny-asa-nikke-velvet/3/" class="post-page-numbers">3</a>
<a href="https://everia.club/2026/05/06/cosplay-tiny-asa-nikke-velvet/4/" class="post-page-numbers">4</a>
</p>
</article>
</body>
</html>`;

    const next = detectNextPageUrl(html, url);
    expect(next).toBe("https://everia.club/2026/05/06/cosplay-tiny-asa-nikke-velvet/2/");
  });

  test("パーセントエンコードされた URL slug でも次ページを検出", () => {
    const url =
      "https://everia.club/2026/05/06/cosplay-tiny-asa-nikke-velvet%e8%96%87%e5%b0%94%e7%bb%b4%e7%89%b9/";
    const html = `
<!DOCTYPE html>
<html>
<body>
<p class="post-page-numbers">
<span>1</span>
<a href="https://everia.club/2026/05/06/cosplay-tiny-asa-nikke-velvet%e8%96%87%e5%b0%94%e7%bb%b4%e7%89%b9/2/">2</a>
<a href="https://everia.club/2026/05/06/cosplay-tiny-asa-nikke-velvet%e8%96%87%e5%b0%94%e7%bb%b4%e7%89%b9/3/">3</a>
</p>
</body>
</html>`;

    const next = detectNextPageUrl(html, url);
    expect(next).toBe(
      "https://everia.club/2026/05/06/cosplay-tiny-asa-nikke-velvet%e8%96%87%e5%b0%94%e7%bb%b4%e7%89%b9/2/",
    );
  });

  test("<a> 中の <span> に数字がネストされた WordPress 標準出力でも検出", () => {
    const url = "https://everia.club/2026/05/06/article-slug/";
    const html = `
<!DOCTYPE html>
<html>
<body>
<div class="page-links">
Pages: <span class="page-link-number current">1</span>
<a href="https://everia.club/2026/05/06/article-slug/2/" class="page-link"><span>2</span></a>
</div>
</body>
</html>`;

    const next = detectNextPageUrl(html, url);
    expect(next).toBe("https://everia.club/2026/05/06/article-slug/2/");
  });

  test("相対パス href でも次ページを解決して絶対 URL に変換", () => {
    const url = "https://everia.club/2026/05/06/article-slug/";
    const html = `
<!DOCTYPE html>
<html>
<body>
<p class="post-page-numbers">
<span>1</span>
<a href="/2026/05/06/article-slug/2/">2</a>
</p>
</body>
</html>`;

    const next = detectNextPageUrl(html, url);
    expect(next).toBe("https://everia.club/2026/05/06/article-slug/2/");
  });

  test("2 ページ目から 3 ページ目への遷移（中間ページ）", () => {
    const url = "https://everia.club/2026/05/06/article-slug/2/";
    const html = `
<!DOCTYPE html>
<html>
<body>
<p class="post-page-numbers">
<a href="https://everia.club/2026/05/06/article-slug/">1</a>
<span class="current">2</span>
<a href="https://everia.club/2026/05/06/article-slug/3/">3</a>
<a href="https://everia.club/2026/05/06/article-slug/4/">4</a>
</p>
</body>
</html>`;

    const next = detectNextPageUrl(html, url);
    expect(next).toBe("https://everia.club/2026/05/06/article-slug/3/");
  });

  test("currentUrl が大文字 percent-encoding でも小文字エンコードのリンクを検出（everia 実例）", () => {
    // ユーザー URL は大文字 %E5%A1%A9, HTML 内のページネーションリンクは小文字 %e5%a1%a9
    // という不整合が everia.club で発生する（URL バー上の補正 / canonical の違い）
    const url =
      "https://everia.club/2026/05/06/cosplay-salt-melon-%E5%A1%A9%E3%82%81%E3%82%8D%E3%82%93/";
    const html = `
<!DOCTYPE html>
<html>
<body>
<p>
<span class="post-page-numbers current"><span class="page-number">1</span></span>
<a href="https://everia.club/2026/05/06/cosplay-salt-melon-%e5%a1%a9%e3%82%81%e3%82%8d%e3%82%93/2/" class="post-page-numbers"><span class="page-number">2</span></a>
</p>
</body>
</html>`;

    const next = detectNextPageUrl(html, url);
    // 修正前: percent-encoding 大文字小文字の不一致で null が返る
    // 修正後: pathname を decodeURI 比較するので一致する
    expect(next).toBe(
      "https://everia.club/2026/05/06/cosplay-salt-melon-%e5%a1%a9%e3%82%81%e3%82%8d%e3%82%93/2/",
    );
  });
});
