import { test, expect } from "@playwright/test";
import { stripPageChrome, extractWithRegex } from "../src/lib/regex-extractor";

// extractWithRegex は内部で postProcess を呼ぶ（sanitizeHtml 等を含む）。
// テストでは「どのセレクターが選択されたか」を検証するため、期待文字列がサニタイズ後も
// 残るプレーンテキストで確認する。

test.describe("stripPageChrome", () => {
  test("<head> を除去する", () => {
    const html = "<html><head><title>Title</title></head><body><p>Content</p></body></html>";
    const result = stripPageChrome(html);
    expect(result).not.toContain("<head>");
    expect(result).toContain("Content");
  });

  test("<nav> を除去する", () => {
    const html = "<nav><a>Menu</a></nav><main><p>Article</p></main>";
    const result = stripPageChrome(html);
    expect(result).not.toContain("<nav>");
    expect(result).toContain("Article");
  });

  test("<header> を除去する", () => {
    const html = "<header><h1>Site Header</h1></header><article><p>Body</p></article>";
    const result = stripPageChrome(html);
    expect(result).not.toContain("<header>");
    expect(result).toContain("Body");
  });

  test("<footer> を除去する", () => {
    const html = "<p>Article text</p><footer><p>Copyright</p></footer>";
    const result = stripPageChrome(html);
    expect(result).not.toContain("<footer>");
    expect(result).toContain("Article text");
  });

  test("<aside> を除去する", () => {
    const html = "<p>Main content</p><aside><p>Sidebar</p></aside>";
    const result = stripPageChrome(html);
    expect(result).not.toContain("<aside>");
    expect(result).toContain("Main content");
  });

  test("<form> を除去する", () => {
    const html = "<p>Text</p><form><input type='text' /><button>Submit</button></form>";
    const result = stripPageChrome(html);
    expect(result).not.toContain("<form>");
    expect(result).toContain("Text");
  });

  test("HTML コメントを除去する", () => {
    const html = "<p>Content</p><!-- This is a comment --><p>More</p>";
    const result = stripPageChrome(html);
    expect(result).not.toContain("<!--");
    expect(result).toContain("Content");
  });

  test("ネストした <nav> も除去する（不動点反復）", () => {
    const html = "<na<nav>inner</nav>v><p>Real</p>";
    const result = stripPageChrome(html);
    expect(result).not.toContain("inner");
    expect(result).toContain("Real");
  });

  test("複数のブロックタグを一度に除去する", () => {
    const html =
      "<nav><a>Menu</a></nav><header><h1>Head</h1></header><p>Content</p><footer>F</footer>";
    const result = stripPageChrome(html);
    expect(result).not.toContain("<nav>");
    expect(result).not.toContain("<header>");
    expect(result).not.toContain("<footer>");
    expect(result).toContain("Content");
  });
});

test.describe("extractWithRegex — サイト固有セレクター", () => {
  test("itemprop=articleBody を持つ要素を抽出する（Qiita 系）", () => {
    const html = `
      <div class="sidebar">Side</div>
      <div itemprop="articleBody"><p>Qiita article content here</p></div>
      <footer>Footer</footer>
    `;
    const result = extractWithRegex(html, "https://qiita.com/user/items/abc");
    expect(result).toContain("Qiita article content here");
    expect(result).not.toContain("Side");
  });

  test("class=it-MdContent を持つ要素を抽出する（Qiita）", () => {
    const html = `
      <div class="sidebar">Side</div>
      <div class="it-MdContent"><p>Qiita markdown content</p></div>
    `;
    const result = extractWithRegex(html, "https://qiita.com/user/items/abc");
    expect(result).toContain("Qiita markdown content");
    expect(result).not.toContain("Side");
  });

  test("zenn.dev で class=znc を優先して抽出する", () => {
    const html = `
      <article><p>Article fallback</p></article>
      <div class="znc"><p>Zenn article body</p></div>
    `;
    const result = extractWithRegex(html, "https://zenn.dev/user/articles/abc");
    expect(result).toContain("Zenn article body");
  });

  test("非 zenn.dev では znc より article を優先する", () => {
    const html = `
      <article><p>Non-Zenn article</p></article>
      <div class="znc"><p>znc content</p></div>
    `;
    const result = extractWithRegex(html, "https://example.com/article");
    expect(result).toContain("Non-Zenn article");
  });
});

test.describe("extractWithRegex — EC・商品ページセレクター", () => {
  test("itemprop=description を持つ要素を抽出する（Schema.org）", () => {
    const html = `
      <div class="product-info">
        <div itemprop="description"><p>Product description text</p></div>
      </div>
    `;
    const result = extractWithRegex(html, "https://shop.example.com/product/1");
    expect(result).toContain("Product description text");
  });

  test("product-description クラスを持つ要素を抽出する（Shopify 系）", () => {
    const html = `
      <div class="product__description"><p>Shopify product details</p></div>
    `;
    const result = extractWithRegex(html, "https://mystore.myshopify.com/products/item");
    expect(result).toContain("Shopify product details");
  });
});

test.describe("extractWithRegex — 汎用セレクター", () => {
  test("<article> タグからコンテンツを抽出する", () => {
    const html = `
      <header><nav>Nav</nav></header>
      <article><p>Main article text here</p></article>
      <footer><p>Footer</p></footer>
    `;
    const result = extractWithRegex(html, "https://example.com/post/1");
    expect(result).toContain("Main article text here");
  });

  test("<main> タグからコンテンツを抽出する（article なし）", () => {
    const html = `
      <header>Header</header>
      <main><p>Main content area</p></main>
      <footer>Footer</footer>
    `;
    const result = extractWithRegex(html, "https://example.com/page");
    expect(result).toContain("Main content area");
  });

  test("role=main を持つ要素からコンテンツを抽出する", () => {
    const html = `
      <div role="main"><p>Role main content</p></div>
    `;
    const result = extractWithRegex(html, "https://example.com/");
    expect(result).toContain("Role main content");
  });

  test("class に post/entry/article/content を含む要素を抽出する", () => {
    const html = `
      <div class="post-content"><p>Post content here</p></div>
    `;
    const result = extractWithRegex(html, "https://blog.example.com/post/1");
    expect(result).toContain("Post content here");
  });

  test("<body> にフォールバックする", () => {
    const html = `<html><body><p>Fallback body text</p></body></html>`;
    const result = extractWithRegex(html, "https://example.com/");
    expect(result).toContain("Fallback body text");
  });

  test("article が article をネストしていても外側を取得する", () => {
    // 外側の article がマッチするため inner content も含まれる
    const html = `<article><p>outer</p><article><p>inner</p></article></article>`;
    const result = extractWithRegex(html, "https://example.com/");
    expect(result).toContain("outer");
  });
});
