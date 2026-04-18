import { test, expect } from "@playwright/test";
import { parseFeed } from "../src/lib/xml-parser";

/**
 * xml-parser.ts の回帰テスト。
 */

test.describe("parseFeed — 不正な日付の安全処理", () => {
  test("RSS 2.0: 不正な pubDate でも RangeError をスローしない", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <item>
      <title>記事1</title>
      <link>https://example.com/1</link>
      <guid>https://example.com/1</guid>
      <pubDate>not-a-date</pubDate>
      <description>テスト</description>
    </item>
  </channel>
</rss>`;

    expect(() => parseFeed(xml)).not.toThrow();
    const result = parseFeed(xml);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].publishedAt).toBeNull();
  });

  test("RSS 2.0: 存在しない日付（day=0）でも安全に処理する", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <item>
      <title>記事2</title>
      <link>https://example.com/2</link>
      <guid>https://example.com/2</guid>
      <pubDate>Sat, 00 Jan 2024 00:00:00 GMT</pubDate>
      <description>テスト</description>
    </item>
  </channel>
</rss>`;

    expect(() => parseFeed(xml)).not.toThrow();
    const result = parseFeed(xml);
    // day=0 は Invalid Date になる実装もある。null か ISO 文字列かを確認する
    expect(
      result.items[0].publishedAt === null || typeof result.items[0].publishedAt === "string",
    ).toBe(true);
  });

  test("RSS 2.0: 正常な pubDate は ISO 8601 文字列に変換する", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <item>
      <title>記事3</title>
      <link>https://example.com/3</link>
      <guid>https://example.com/3</guid>
      <pubDate>Mon, 25 Mar 2024 12:00:00 GMT</pubDate>
      <description>テスト</description>
    </item>
  </channel>
</rss>`;

    const result = parseFeed(xml);
    expect(result.items[0].publishedAt).toBe("2024-03-25T12:00:00.000Z");
  });

  test("RSS 1.0 (RDF): 不正な dc:date でも RangeError をスローしない", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns="http://purl.org/rss/1.0/"
         xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Test RDF Feed</title>
    <link>https://example.com</link>
  </channel>
  <item rdf:about="https://example.com/4">
    <title>記事4</title>
    <link>https://example.com/4</link>
    <dc:date>INVALID-DATE-STRING</dc:date>
    <description>テスト</description>
  </item>
</rdf:RDF>`;

    expect(() => parseFeed(xml)).not.toThrow();
    const result = parseFeed(xml);
    expect(result.items[0].publishedAt).toBeNull();
  });

  test("RSS 1.0 (RDF): 正常な dc:date は ISO 8601 文字列に変換する", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns="http://purl.org/rss/1.0/"
         xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Test RDF Feed</title>
    <link>https://example.com</link>
  </channel>
  <item rdf:about="https://example.com/5">
    <title>記事5</title>
    <link>https://example.com/5</link>
    <dc:date>2024-03-25T12:00:00+00:00</dc:date>
    <description>テスト</description>
  </item>
</rdf:RDF>`;

    const result = parseFeed(xml);
    expect(result.items[0].publishedAt).toBe("2024-03-25T12:00:00.000Z");
  });

  test("RSS 1.0 (RDF): pubDate と dc:date が両方あるとき dc:date を優先する", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns="http://purl.org/rss/1.0/"
         xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Test RDF Feed</title>
    <link>https://example.com</link>
  </channel>
  <item rdf:about="https://example.com/6">
    <title>記事6</title>
    <link>https://example.com/6</link>
    <pubDate>Mon, 25 Mar 2024 00:00:00 GMT</pubDate>
    <dc:date>2024-03-26T12:00:00+00:00</dc:date>
    <description>テスト</description>
  </item>
</rdf:RDF>`;

    const result = parseFeed(xml);
    expect(result.items[0].publishedAt).toBe("2024-03-26T12:00:00.000Z");
  });

  test("RSS 1.0 (RDF): pubDate が無効でも dc:date が有効なら dc:date を採用する", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns="http://purl.org/rss/1.0/"
         xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Test RDF Feed</title>
    <link>https://example.com</link>
  </channel>
  <item rdf:about="https://example.com/7">
    <title>記事7</title>
    <link>https://example.com/7</link>
    <pubDate>not-a-date</pubDate>
    <dc:date>2024-03-27T09:30:00+00:00</dc:date>
    <description>テスト</description>
  </item>
</rdf:RDF>`;

    const result = parseFeed(xml);
    expect(result.items[0].publishedAt).toBe("2024-03-27T09:30:00.000Z");
  });
});

test.describe("parseFeed — 危険スキーム URL の排除", () => {
  function makeRss(link: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <link>https://example.com</link>
    <item>
      <title>記事</title>
      <link>${link}</link>
      <guid>urn:test:1</guid>
      <description>テスト</description>
    </item>
  </channel>
</rss>`;
  }

  test("javascript: スキームは空文字に変換される", () => {
    const result = parseFeed(makeRss("javascript:alert(1)"));
    expect(result.items[0].link).toBe("");
  });

  test("JAVASCRIPT: 大文字混在スキームも排除される", () => {
    const result = parseFeed(makeRss("JAVASCRIPT:alert(1)"));
    expect(result.items[0].link).toBe("");
  });

  test("vbscript: スキームは空文字に変換される", () => {
    const result = parseFeed(makeRss("vbscript:msgbox(1)"));
    expect(result.items[0].link).toBe("");
  });

  test("data: スキームは空文字に変換される", () => {
    const result = parseFeed(makeRss("data:text/html,<script>alert(1)</script>"));
    expect(result.items[0].link).toBe("");
  });

  test("&#106;avascript: HTMLエンティティエンコードは排除される", () => {
    const result = parseFeed(makeRss("&#106;avascript:alert(1)"));
    expect(result.items[0].link).toBe("");
  });

  test("&#x6A;avascript: 16進エンティティも排除される", () => {
    const result = parseFeed(makeRss("&#x6A;avascript:alert(1)"));
    expect(result.items[0].link).toBe("");
  });

  test("先頭空白 + javascript: バイパス試行も排除される", () => {
    const result = parseFeed(makeRss("  javascript:alert(1)"));
    expect(result.items[0].link).toBe("");
  });

  test("https:// URL は正常に保持される", () => {
    const result = parseFeed(makeRss("https://example.com/article"));
    expect(result.items[0].link).toBe("https://example.com/article");
  });

  test("http:// URL は正常に保持される", () => {
    const result = parseFeed(makeRss("http://example.com/article"));
    expect(result.items[0].link).toBe("http://example.com/article");
  });

  test("Atom の link href にも適用される", () => {
    const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <entry>
    <id>urn:test:2</id>
    <title>記事</title>
    <link href="javascript:alert(1)"/>
    <summary>テスト</summary>
  </entry>
</feed>`;
    const result = parseFeed(atom);
    expect(result.items[0].link).toBe("");
  });

  test("file: スキームは空文字に変換される", () => {
    const result = parseFeed(makeRss("file:///etc/passwd"));
    expect(result.items[0].link).toBe("");
  });
});

test.describe("parseFeed — 危険スキーム URL を持つ ogImage の排除", () => {
  test("media:thumbnail に javascript: URL があれば空文字になる", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Test</title>
    <link>https://example.com</link>
    <item>
      <title>記事</title>
      <link>https://example.com/1</link>
      <guid>urn:test:og-1</guid>
      <media:thumbnail url="javascript:alert(1)"/>
      <description>テスト</description>
    </item>
  </channel>
</rss>`;
    const result = parseFeed(xml);
    expect(result.items[0].ogImage).toBe("");
  });

  test("media:thumbnail に data: URL があれば空文字になる", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Test</title>
    <link>https://example.com</link>
    <item>
      <title>記事</title>
      <link>https://example.com/2</link>
      <guid>urn:test:og-2</guid>
      <media:thumbnail url="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;"/>
      <description>テスト</description>
    </item>
  </channel>
</rss>`;
    const result = parseFeed(xml);
    expect(result.items[0].ogImage).toBe("");
  });

  test('content/description 内の <img src="javascript:"> は空文字になる', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <link>https://example.com</link>
    <item>
      <title>記事</title>
      <link>https://example.com/3</link>
      <guid>urn:test:og-3</guid>
      <description><![CDATA[<p>本文</p><img src="javascript:alert(1)">]]></description>
    </item>
  </channel>
</rss>`;
    const result = parseFeed(xml);
    expect(result.items[0].ogImage).toBe("");
  });

  test("media:thumbnail に正常な https: URL は保持される", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Test</title>
    <link>https://example.com</link>
    <item>
      <title>記事</title>
      <link>https://example.com/4</link>
      <guid>urn:test:og-4</guid>
      <media:thumbnail url="https://example.com/thumb.jpg"/>
      <description>テスト</description>
    </item>
  </channel>
</rss>`;
    const result = parseFeed(xml);
    expect(result.items[0].ogImage).toBe("https://example.com/thumb.jpg");
  });

  test("Atom entry の ogImage も safeUrl が適用される", () => {
    const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <title>Test</title>
  <entry>
    <id>urn:test:og-5</id>
    <title>記事</title>
    <link href="https://example.com/5"/>
    <media:thumbnail url="javascript:alert(1)"/>
    <summary>テスト</summary>
  </entry>
</feed>`;
    const result = parseFeed(atom);
    expect(result.items[0].ogImage).toBe("");
  });
});

test.describe("parseFeed — RSS 1.0 の危険スキーム URL 排除", () => {
  test("RSS 1.0 の link にも適用される", () => {
    const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns="http://purl.org/rss/1.0/">
  <channel>
    <title>Test</title>
    <link>https://example.com</link>
  </channel>
  <item rdf:about="urn:test:3">
    <title>記事</title>
    <link>javascript:alert(1)</link>
    <description>テスト</description>
  </item>
</rdf:RDF>`;
    const result = parseFeed(rdf);
    expect(result.items[0].link).toBe("");
  });
});

test.describe("parseFeed — 巨大フィードのエンティティ展開制限 (リグレッション)", () => {
  /**
   * 旧 maxTotalExpansions=100000 では 150 件 × 700 エンティティ = 105,000 展開で
   * "Entity expansion limit exceeded" が発生していた。
   * 現在は 1,000,000 に引き上げ済みのため、この件数でもパースできる。
   */
  test("150 件 × 700 HTML エンティティでも Entity expansion limit に引っかからない", () => {
    // 1 アイテムあたり &amp; × 700 = 700 展開
    const entityBlock = "&amp;".repeat(700);
    const items = Array.from(
      { length: 150 },
      (_, i) => `
    <item>
      <title>記事 ${i}</title>
      <link>https://example.com/${i}</link>
      <guid>urn:large-feed:${i}</guid>
      <description>${entityBlock}</description>
    </item>`,
    ).join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Large Feed</title>
    <link>https://example.com</link>
    ${items}
  </channel>
</rss>`;

    expect(() => parseFeed(xml)).not.toThrow();
    const result = parseFeed(xml);
    expect(result.items).toHaveLength(150);
  });

  /**
   * 旧 maxExpandedLength=500000 では HTML コンテンツが多いフィードで制限に達していた。
   * 各アイテムの description を 4000 バイトの HTML エンティティで構成し、
   * 200 件でエンティティ展開後の総文字数が旧制限を超えることを確認する。
   */
  test("200 件 × 長い description でも maxExpandedLength に引っかからない", () => {
    // "&lt;p&gt;" (8 chars) × 500 = 4000 エンティティ参照 / アイテム
    // 200 アイテム × 4000 = 800,000 エンティティ展開 → 旧制限 500,000 を超える
    const entityBlock = "&lt;p&gt;".repeat(500);
    const items = Array.from(
      { length: 200 },
      (_, i) => `
    <item>
      <title>記事 ${i}</title>
      <link>https://example.com/content/${i}</link>
      <guid>urn:expanded-feed:${i}</guid>
      <description>${entityBlock}</description>
    </item>`,
    ).join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Content Heavy Feed</title>
    <link>https://example.com</link>
    ${items}
  </channel>
</rss>`;

    expect(() => parseFeed(xml)).not.toThrow();
    const result = parseFeed(xml);
    expect(result.items).toHaveLength(200);
    // タイトルが正しく取得できていること（パース自体が成功している確認）
    expect(result.items[0].title).toBe("記事 0");
  });
});
