import { test, expect } from "@playwright/test";
import { extractJsonLdImages, appendMissingJsonLdImages } from "../src/lib/json-ld-images";

test.describe("extractJsonLdImages — JSON-LD から記事主要画像 URL を抽出", () => {
  test("Article 型 + image 配列で 2 件抽出", () => {
    const html = `<script type="application/ld+json">
${JSON.stringify({
  "@type": "Article",
  image: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
})}
</script>`;
    expect(extractJsonLdImages(html)).toEqual([
      "https://example.com/a.jpg",
      "https://example.com/b.jpg",
    ]);
  });

  test("image が文字列単体でも抽出", () => {
    const html = `<script type="application/ld+json">
${JSON.stringify({ "@type": "Article", image: "https://example.com/single.jpg" })}
</script>`;
    expect(extractJsonLdImages(html)).toEqual(["https://example.com/single.jpg"]);
  });

  test("image が ImageObject ({ url: ... }) 形式でも抽出", () => {
    const html = `<script type="application/ld+json">
${JSON.stringify({
  "@type": "Article",
  image: { "@type": "ImageObject", url: "https://example.com/o.jpg" },
})}
</script>`;
    expect(extractJsonLdImages(html)).toEqual(["https://example.com/o.jpg"]);
  });

  test("contentUrl も対応", () => {
    const html = `<script type="application/ld+json">
${JSON.stringify({
  "@type": "NewsArticle",
  image: { "@type": "ImageObject", contentUrl: "https://example.com/c.jpg" },
})}
</script>`;
    expect(extractJsonLdImages(html)).toEqual(["https://example.com/c.jpg"]);
  });

  test("非 article 型 (BreadcrumbList) の image は無視", () => {
    const html = `<script type="application/ld+json">
${JSON.stringify({
  "@type": "BreadcrumbList",
  image: ["https://example.com/breadcrumb.jpg"],
})}
</script>`;
    expect(extractJsonLdImages(html)).toEqual([]);
  });

  test("article + breadcrumb 混在で article のみ抽出", () => {
    const html = `<script type="application/ld+json">
${JSON.stringify([
  { "@type": "Article", image: ["https://example.com/article.jpg"] },
  { "@type": "BreadcrumbList", image: ["https://example.com/bc.jpg"] },
])}
</script>`;
    expect(extractJsonLdImages(html)).toEqual(["https://example.com/article.jpg"]);
  });

  test("@type が配列で article を含む場合も対応", () => {
    const html = `<script type="application/ld+json">
${JSON.stringify({ "@type": ["WebPage", "Article"], image: ["https://example.com/multi.jpg"] })}
</script>`;
    expect(extractJsonLdImages(html)).toEqual(["https://example.com/multi.jpg"]);
  });

  test("BlogPosting / NewsArticle / TechArticle も認識", () => {
    const html =
      `<script type="application/ld+json">${JSON.stringify({ "@type": "BlogPosting", image: "https://example.com/blog.jpg" })}</script>` +
      `<script type="application/ld+json">${JSON.stringify({ "@type": "NewsArticle", image: "https://example.com/news.jpg" })}</script>` +
      `<script type="application/ld+json">${JSON.stringify({ "@type": "TechArticle", image: "https://example.com/tech.jpg" })}</script>`;
    expect(extractJsonLdImages(html).sort()).toEqual([
      "https://example.com/blog.jpg",
      "https://example.com/news.jpg",
      "https://example.com/tech.jpg",
    ]);
  });

  test("data: / 相対 URL は除外 (http(s) のみ)", () => {
    const html = `<script type="application/ld+json">
${JSON.stringify({
  "@type": "Article",
  image: [
    "data:image/png;base64,abc",
    "/relative/path.jpg",
    "https://example.com/ok.jpg",
    "javascript:alert(1)",
  ],
})}
</script>`;
    expect(extractJsonLdImages(html)).toEqual(["https://example.com/ok.jpg"]);
  });

  test("無効な JSON はスキップ (例外を投げない)", () => {
    const html = `<script type="application/ld+json">{"@type": "Article", invalid json</script>`;
    expect(extractJsonLdImages(html)).toEqual([]);
  });

  test("JSON-LD なしの HTML は空配列", () => {
    const html = `<html><body><h1>no json-ld</h1></body></html>`;
    expect(extractJsonLdImages(html)).toEqual([]);
  });

  test("重複 URL は除去", () => {
    const html =
      `<script type="application/ld+json">${JSON.stringify({ "@type": "Article", image: "https://example.com/dup.jpg" })}</script>` +
      `<script type="application/ld+json">${JSON.stringify({ "@type": "Article", image: "https://example.com/dup.jpg" })}</script>`;
    expect(extractJsonLdImages(html)).toEqual(["https://example.com/dup.jpg"]);
  });
});

test.describe("appendMissingJsonLdImages — 抽出結果に不足分の画像を <div hidden> 追加", () => {
  test("既に全画像が含まれていれば変更なし", () => {
    const content = `<p>text</p><img src="https://example.com/a.jpg" />`;
    const result = appendMissingJsonLdImages(content, ["https://example.com/a.jpg"]);
    expect(result).toBe(content);
  });

  test("不足画像を <div hidden> として末尾追加", () => {
    const content = `<p>text</p>`;
    const result = appendMissingJsonLdImages(content, ["https://example.com/a.jpg"]);
    expect(result).toBe(
      `<p>text</p><div hidden><img src="https://example.com/a.jpg" alt="" /></div>`,
    );
  });

  test("一部画像が含まれている場合は不足分のみ追加", () => {
    const content = `<p>text</p><img src="https://example.com/a.jpg" />`;
    const result = appendMissingJsonLdImages(content, [
      "https://example.com/a.jpg",
      "https://example.com/b.jpg",
    ]);
    expect(result).toBe(
      `<p>text</p><img src="https://example.com/a.jpg" /><div hidden><img src="https://example.com/b.jpg" alt="" /></div>`,
    );
  });

  test("空 jsonLdUrls なら変更なし", () => {
    const content = `<p>text</p>`;
    expect(appendMissingJsonLdImages(content, [])).toBe(content);
  });

  test("URL 中の特殊文字は属性エンコードされる", () => {
    const content = `<p></p>`;
    const result = appendMissingJsonLdImages(content, [
      `https://example.com/img.jpg?a=1&b=2&c="x"`,
    ]);
    expect(result).toContain(`src="https://example.com/img.jpg?a=1&amp;b=2&amp;c=&quot;x&quot;"`);
  });

  // #875: 同一画像のクエリパラメータ違い (PR TIMES 系 CDN URL) を path 一致で同一視
  test("クエリパラメータ違いの同一画像は補完しない (PR TIMES 真因 fixture)", () => {
    const content = `<p>text</p><img src="https://prcdn.freetls.fastly.net/release_image/34617/489/X-3840x2160.png?width=1950&height=1350&quality=85,65&format=jpeg" />`;
    const jsonLdUrl =
      "https://prcdn.freetls.fastly.net/release_image/34617/489/X-3840x2160.png?format=jpeg&auto=webp&fit=bounds&width=2400&height=1260";
    const result = appendMissingJsonLdImages(content, [jsonLdUrl]);
    expect(result).toBe(content);
  });

  test("path が同じでも hostname が異なる場合は補完する (CDN 別扱い)", () => {
    const content = `<p>text</p><img src="https://cdn-a.example.com/path/img.jpg?w=1000" />`;
    const jsonLdUrl = "https://cdn-b.example.com/path/img.jpg?w=2000";
    const result = appendMissingJsonLdImages(content, [jsonLdUrl]);
    expect(result).toContain(`src="${jsonLdUrl.replace(/&/g, "&amp;")}"`);
  });

  test("不正な URL の jsonLdUrl は文字列完全一致 fallback で判定", () => {
    // URL parse fail → 文字列完全一致 fallback
    const content = `<p>text</p>`;
    const jsonLdUrl = "not-a-valid-url";
    const result = appendMissingJsonLdImages(content, [jsonLdUrl]);
    // 不正 URL も「不足」として追加される (文字列完全一致 fallback で false → missing 扱い)
    expect(result).toContain(`src="not-a-valid-url"`);
  });

  test("HTML エンティティ &amp; encoded された本文 img も path 一致判定で同一視", () => {
    // postProcess 後の本文は & が &amp; に escape されているケース
    const content = `<p>text</p><img src="https://prcdn.freetls.fastly.net/release_image/34617/489/X-3840x2160.png?width=1950&amp;height=1350&amp;quality=85,65&amp;format=jpeg" />`;
    const jsonLdUrl =
      "https://prcdn.freetls.fastly.net/release_image/34617/489/X-3840x2160.png?format=jpeg&width=2400";
    const result = appendMissingJsonLdImages(content, [jsonLdUrl]);
    expect(result).toBe(content);
  });
});
