import { test, expect } from '@playwright/test';
import { parseFeed } from '../src/lib/xml-parser';

/**
 * xml-parser.ts の回帰テスト。
 */

test.describe('parseFeed — 不正な日付の安全処理', () => {
  test('RSS 2.0: 不正な pubDate でも RangeError をスローしない', () => {
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

  test('RSS 2.0: 存在しない日付（day=0）でも安全に処理する', () => {
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
    expect(result.items[0].publishedAt === null || typeof result.items[0].publishedAt === 'string').toBe(true);
  });

  test('RSS 2.0: 正常な pubDate は ISO 8601 文字列に変換する', () => {
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
    expect(result.items[0].publishedAt).toBe('2024-03-25T12:00:00.000Z');
  });

  test('RSS 1.0 (RDF): 不正な dc:date でも RangeError をスローしない', () => {
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

  test('RSS 1.0 (RDF): 正常な dc:date は ISO 8601 文字列に変換する', () => {
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
    expect(result.items[0].publishedAt).toBe('2024-03-25T12:00:00.000Z');
  });
});

test.describe('parseFeed — 危険スキーム URL の排除', () => {
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

  test('javascript: スキームは空文字に変換される', () => {
    const result = parseFeed(makeRss('javascript:alert(1)'));
    expect(result.items[0].link).toBe('');
  });

  test('JAVASCRIPT: 大文字混在スキームも排除される', () => {
    const result = parseFeed(makeRss('JAVASCRIPT:alert(1)'));
    expect(result.items[0].link).toBe('');
  });

  test('vbscript: スキームは空文字に変換される', () => {
    const result = parseFeed(makeRss('vbscript:msgbox(1)'));
    expect(result.items[0].link).toBe('');
  });

  test('data: スキームは空文字に変換される', () => {
    const result = parseFeed(makeRss('data:text/html,<script>alert(1)</script>'));
    expect(result.items[0].link).toBe('');
  });

  test('&#106;avascript: HTMLエンティティエンコードは排除される', () => {
    const result = parseFeed(makeRss('&#106;avascript:alert(1)'));
    expect(result.items[0].link).toBe('');
  });

  test('&#x6A;avascript: 16進エンティティも排除される', () => {
    const result = parseFeed(makeRss('&#x6A;avascript:alert(1)'));
    expect(result.items[0].link).toBe('');
  });

  test('先頭空白 + javascript: バイパス試行も排除される', () => {
    const result = parseFeed(makeRss('  javascript:alert(1)'));
    expect(result.items[0].link).toBe('');
  });

  test('https:// URL は正常に保持される', () => {
    const result = parseFeed(makeRss('https://example.com/article'));
    expect(result.items[0].link).toBe('https://example.com/article');
  });

  test('http:// URL は正常に保持される', () => {
    const result = parseFeed(makeRss('http://example.com/article'));
    expect(result.items[0].link).toBe('http://example.com/article');
  });

  test('Atom の link href にも適用される', () => {
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
    expect(result.items[0].link).toBe('');
  });

  test('RSS 1.0 の link にも適用される', () => {
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
    expect(result.items[0].link).toBe('');
  });
});
