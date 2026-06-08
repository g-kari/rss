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

test.describe("parseFeed — サムネイル画像の優先順位 (Issue #117)", () => {
  test("media:content は media:thumbnail より優先される", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:media="http://search.yahoo.com/mrss/" version="2.0">
  <channel>
    <title>Test</title>
    <link>https://example.com</link>
    <item>
      <title>Article</title>
      <link>https://example.com/a1</link>
      <guid>a1</guid>
      <media:thumbnail url="https://example.com/thumb.jpg"/>
      <media:content url="https://example.com/content.jpg" medium="image"/>
    </item>
  </channel>
</rss>`;
    const result = parseFeed(xml);
    expect(result.items[0].ogImage).toBe("https://example.com/content.jpg");
  });

  test("media:content がなければ media:thumbnail が使われる", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:media="http://search.yahoo.com/mrss/" version="2.0">
  <channel>
    <title>Test</title>
    <link>https://example.com</link>
    <item>
      <title>Article</title>
      <link>https://example.com/a1</link>
      <guid>a1</guid>
      <media:thumbnail url="https://example.com/thumb.jpg"/>
    </item>
  </channel>
</rss>`;
    const result = parseFeed(xml);
    expect(result.items[0].ogImage).toBe("https://example.com/thumb.jpg");
  });

  test("itunes:image の href が enclosure より優先される", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0">
  <channel>
    <title>Podcast</title>
    <link>https://example.com</link>
    <item>
      <title>Episode</title>
      <link>https://example.com/ep1</link>
      <guid>ep1</guid>
      <itunes:image href="https://example.com/itunes.jpg"/>
      <enclosure url="https://example.com/audio.mp3" type="audio/mpeg"/>
    </item>
  </channel>
</rss>`;
    const result = parseFeed(xml);
    expect(result.items[0].ogImage).toBe("https://example.com/itunes.jpg");
  });

  test("media:content に medium/type 指定がない場合は採用されず、次の候補にフォールバック", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:media="http://search.yahoo.com/mrss/" version="2.0">
  <channel>
    <title>Test</title>
    <link>https://example.com</link>
    <item>
      <title>Article</title>
      <link>https://example.com/a1</link>
      <guid>a1</guid>
      <media:content url="https://example.com/unknown.bin"/>
      <media:thumbnail url="https://example.com/thumb.jpg"/>
    </item>
  </channel>
</rss>`;
    const result = parseFeed(xml);
    expect(result.items[0].ogImage).toBe("https://example.com/thumb.jpg");
  });

  test('description 内の <video poster="..."> は <img> より優先される（#645）', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <link>https://example.com</link>
    <item>
      <title>Tweet</title>
      <link>https://x.com/user/status/1</link>
      <guid>1</guid>
      <description><![CDATA[テキスト本文<br><img src="https://example.com/avatar.jpg"><video src="https://example.com/video.mp4" poster="https://example.com/poster.jpg"></video>]]></description>
    </item>
  </channel>
</rss>`;
    const result = parseFeed(xml);
    expect(result.items[0].ogImage).toBe("https://example.com/poster.jpg");
  });

  test("description 内に <video poster> がなければ <img> にフォールバックする", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <link>https://example.com</link>
    <item>
      <title>Tweet</title>
      <link>https://x.com/user/status/2</link>
      <guid>2</guid>
      <description><![CDATA[テキスト本文<img src="https://example.com/avatar.jpg">]]></description>
    </item>
  </channel>
</rss>`;
    const result = parseFeed(xml);
    expect(result.items[0].ogImage).toBe("https://example.com/avatar.jpg");
  });

  test("media:content (image) が存在する場合は description 内 <video poster> より優先される", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:media="http://search.yahoo.com/mrss/" version="2.0">
  <channel>
    <title>Test</title>
    <link>https://example.com</link>
    <item>
      <title>Article</title>
      <link>https://example.com/a1</link>
      <guid>a1</guid>
      <media:content url="https://example.com/media.jpg" medium="image"/>
      <description><![CDATA[<video poster="https://example.com/poster.jpg"></video>]]></description>
    </item>
  </channel>
</rss>`;
    const result = parseFeed(xml);
    expect(result.items[0].ogImage).toBe("https://example.com/media.jpg");
  });
});

test.describe("parseFeed — summary 文字数制限緩和 (#721)", () => {
  // ユーザー報告: VRChat seller bot 等の長い <description> が冒頭 200 文字で
  // 切られてしまい、最後まで表示されない。200 → 5000 に緩和して
  // 大半の RSS フィードで完全表示できるようにする。
  // 完全撤廃でなく上限を残す理由: 悪意ある巨大 description (1MB+) による
  // R2 storage / シリアライズコスト DoS の防御。

  test("RSS 2.0: 1000 文字の description が完全保持される (旧 200 制限の回帰防止)", () => {
    const longDesc = "あ".repeat(1000);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <link>https://example.com</link>
    <item>
      <title>Long</title>
      <link>https://example.com/a1</link>
      <guid>a1</guid>
      <description><![CDATA[${longDesc}]]></description>
    </item>
  </channel>
</rss>`;
    const result = parseFeed(xml);
    expect(result.items[0].summary.length).toBe(1000);
  });

  test("RSS 2.0: 8000 文字の description は 5000 文字で truncate (DoS 防御)", () => {
    const longDesc = "あ".repeat(8000);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <link>https://example.com</link>
    <item>
      <title>VeryLong</title>
      <link>https://example.com/a1</link>
      <guid>a1</guid>
      <description><![CDATA[${longDesc}]]></description>
    </item>
  </channel>
</rss>`;
    const result = parseFeed(xml);
    expect(result.items[0].summary.length).toBe(5000);
  });

  test("Atom: 1500 文字の summary が完全保持される", () => {
    const longSummary = "い".repeat(1500);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <link href="https://example.com"/>
  <entry>
    <title>Atom Long</title>
    <id>atom-1</id>
    <link href="https://example.com/atom-1"/>
    <summary>${longSummary}</summary>
  </entry>
</feed>`;
    const result = parseFeed(xml);
    expect(result.items[0].summary.length).toBe(1500);
  });
});

test.describe("parseFeed — Atom <id> 欠落時の link fallback (#atom-guid-fallback)", () => {
  test("id-less Atom entry は link を guid に採用し、別 entry が collapse しない", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>No-ID Atom</title>
  <entry>
    <title>記事 1</title>
    <link href="https://example.com/a"/>
    <summary>本文 1</summary>
  </entry>
  <entry>
    <title>記事 2</title>
    <link href="https://example.com/b"/>
    <summary>本文 2</summary>
  </entry>
</feed>`;
    const result = parseFeed(xml);
    expect(result.items).toHaveLength(2);
    // guid が link fallback で互いに異なる (両方 "" に collapse しない)
    expect(result.items[0].guid).toBe("https://example.com/a");
    expect(result.items[1].guid).toBe("https://example.com/b");
    expect(result.items[0].guid).not.toBe(result.items[1].guid);
  });

  test("<id> がある Atom entry は従来通り id を guid に採用する", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>With ID</title>
  <entry>
    <id>urn:uuid:abc</id>
    <title>記事</title>
    <link href="https://example.com/c"/>
    <summary>本文</summary>
  </entry>
</feed>`;
    const result = parseFeed(xml);
    expect(result.items[0].guid).toBe("urn:uuid:abc");
  });
});
