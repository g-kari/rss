import { test, expect } from "@playwright/test";
import { buildExcludeOptions } from "../src/components/article-view/filter-shared";
import { parseFeed } from "../src/lib/xml-parser";
import { makeArticle } from "./helpers/article";

/**
 * JSON Feed v1.1 パースの単体テスト。
 *
 * https://jsonfeed.org/version/1.1 準拠の JSON フィードを
 * 既存の RSS/Atom フィードと同じ ParsedFeed 形式に変換できることを検証する。
 */

const BASIC_JSON_FEED = JSON.stringify({
  version: "https://jsonfeed.org/version/1.1",
  title: "My Test Blog",
  home_page_url: "https://example.com",
  feed_url: "https://example.com/feed.json",
  items: [
    {
      id: "https://example.com/posts/1",
      url: "https://example.com/posts/1",
      title: "最初の記事",
      content_html: "<p>これはテスト記事です。</p>",
      summary: "記事の概要",
      date_published: "2024-01-01T09:00:00Z",
      authors: [{ name: "テストユーザー" }],
      image: "https://example.com/images/1.jpg",
    },
    {
      id: "https://example.com/posts/2",
      url: "https://example.com/posts/2",
      title: "二番目の記事",
      content_text: "プレーンテキストの記事内容です。",
      date_published: "2024-01-02T09:00:00Z",
    },
  ],
});

test.describe("parseFeed — JSON Feed v1.1 基本", () => {
  test("フィードタイトルを取得できる", () => {
    const result = parseFeed(BASIC_JSON_FEED);
    expect(result.title).toBe("My Test Blog");
  });

  test("home_page_url を siteUrl として取得できる", () => {
    const result = parseFeed(BASIC_JSON_FEED);
    expect(result.siteUrl).toBe("https://example.com");
  });

  test("items の件数が正しい", () => {
    const result = parseFeed(BASIC_JSON_FEED);
    expect(result.items).toHaveLength(2);
  });

  test("記事の基本フィールドが正しく変換される", () => {
    const result = parseFeed(BASIC_JSON_FEED);
    const item = result.items[0];
    expect(item.guid).toBe("https://example.com/posts/1");
    expect(item.link).toBe("https://example.com/posts/1");
    expect(item.title).toBe("最初の記事");
  });

  test("content_html が sanitize されて content に入る", () => {
    const result = parseFeed(BASIC_JSON_FEED);
    expect(result.items[0].content).toContain("テスト記事");
  });

  test("summary フィールドが summary に入る", () => {
    const result = parseFeed(BASIC_JSON_FEED);
    expect(result.items[0].summary).toBe("記事の概要");
  });

  test("date_published が ISO 8601 で publishedAt に入る", () => {
    const result = parseFeed(BASIC_JSON_FEED);
    expect(result.items[0].publishedAt).toBe("2024-01-01T09:00:00.000Z");
  });

  test("authors から author 文字列が取得できる", () => {
    const result = parseFeed(BASIC_JSON_FEED);
    expect(result.items[0].author).toBe("テストユーザー");
  });

  test("image が ogImage に入る", () => {
    const result = parseFeed(BASIC_JSON_FEED);
    expect(result.items[0].ogImage).toBe("https://example.com/images/1.jpg");
  });

  test("content_text の記事は content にテキストが入る", () => {
    const result = parseFeed(BASIC_JSON_FEED);
    expect(result.items[1].content).toContain("プレーンテキスト");
  });
});

test.describe("parseFeed — JSON Feed v1.0 互換", () => {
  test("author（単数形）フィールドを認識する", () => {
    const feed = JSON.stringify({
      version: "https://jsonfeed.org/version/1",
      title: "v1 Blog",
      home_page_url: "https://v1blog.example.com",
      author: { name: "v1 Author" },
      items: [
        {
          id: "1",
          url: "https://v1blog.example.com/1",
          title: "v1 記事",
          content_html: "<p>v1 コンテンツ</p>",
          date_published: "2023-06-01T00:00:00Z",
        },
      ],
    });
    const result = parseFeed(feed);
    // items に authors/author がない場合はフィードレベルの author を使う
    expect(result.items[0].author).toBe("v1 Author");
  });

  test("items の author（単数形）フィールドを認識する", () => {
    const feed = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Blog",
      items: [
        {
          id: "1",
          url: "https://example.com/1",
          title: "記事",
          content_html: "<p>本文</p>",
          author: { name: "Item Author" },
        },
      ],
    });
    const result = parseFeed(feed);
    expect(result.items[0].author).toBe("Item Author");
  });
});

test.describe("parseFeed — JSON Feed エッジケース", () => {
  test("items が空配列のフィードを解析できる", () => {
    const feed = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "空フィード",
      items: [],
    });
    const result = parseFeed(feed);
    expect(result.title).toBe("空フィード");
    expect(result.items).toHaveLength(0);
  });

  test("summary がない場合は content_html からサマリーを生成する", () => {
    const body = "あ".repeat(300);
    const feed = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Blog",
      items: [
        {
          id: "1",
          url: "https://example.com/1",
          title: "記事",
          content_html: `<p>${body}</p>`,
        },
      ],
    });
    const result = parseFeed(feed);
    // summary は MAX_SUMMARY_LENGTH (5000) 以内に切り詰められる (#721)
    expect(result.items[0].summary.length).toBeLessThanOrEqual(5000);
    // 300 文字本文は完全保持される (旧 200 制限は撤廃済み)
    expect(result.items[0].summary.length).toBe(300);
  });

  test("XSS を含む content_html をサニタイズする", () => {
    const feed = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Blog",
      items: [
        {
          id: "1",
          url: "https://example.com/1",
          title: "記事",
          content_html: "<p>本文</p><script>alert(1)</script>",
        },
      ],
    });
    const result = parseFeed(feed);
    expect(result.items[0].content).not.toContain("<script>");
    expect(result.items[0].content).toContain("本文");
  });

  test("javascript: URL を link に設定しない", () => {
    const feed = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Blog",
      items: [
        {
          id: "1",
          url: "javascript:alert(1)",
          title: "危険な記事",
          content_html: "<p>本文</p>",
        },
      ],
    });
    const result = parseFeed(feed);
    expect(result.items[0].link).toBe("");
  });

  test("id と url がない場合は external_url を guid と link に使用する", () => {
    const feed = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Blog",
      items: [
        {
          external_url: "https://external.example.com/posts/1",
          title: "外部記事",
          content_text: "本文",
        },
      ],
    });
    const result = parseFeed(feed);
    expect(result.items[0].guid).toBe("https://external.example.com/posts/1");
    expect(result.items[0].link).toBe("https://external.example.com/posts/1");
  });

  test("id は url と external_url より guid として優先される", () => {
    const feed = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Blog",
      items: [
        {
          id: "source-id",
          url: "https://example.com/posts/1",
          external_url: "https://external.example.com/posts/1",
          title: "記事",
          content_text: "本文",
        },
      ],
    });
    const result = parseFeed(feed);
    expect(result.items[0].guid).toBe("source-id");
    expect(result.items[0].link).toBe("https://example.com/posts/1");
  });

  test("id がない場合は url を external_url より guid として優先する", () => {
    const feed = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Blog",
      items: [
        {
          url: "https://example.com/posts/1",
          external_url: "https://external.example.com/posts/1",
          title: "記事",
          content_text: "本文",
        },
      ],
    });
    const result = parseFeed(feed);
    expect(result.items[0].guid).toBe("https://example.com/posts/1");
    expect(result.items[0].link).toBe("https://example.com/posts/1");
  });

  test("id・url・external_url がすべてない場合は guid と link が空になる", () => {
    const feed = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Blog",
      items: [{ title: "記事", content_text: "本文" }],
    });
    const result = parseFeed(feed);
    expect(result.items[0].guid).toBe("");
    expect(result.items[0].link).toBe("");
  });

  test("banner_image を image の代替として ogImage に使用する", () => {
    const feed = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Blog",
      items: [
        {
          id: "1",
          url: "https://example.com/1",
          title: "記事",
          content_html: "<p>本文</p>",
          banner_image: "https://example.com/banner.jpg",
        },
      ],
    });
    const result = parseFeed(feed);
    expect(result.items[0].ogImage).toBe("https://example.com/banner.jpg");
  });

  test("最初の画像 attachment を ogImage の代替として使用する", () => {
    const feed = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Blog",
      items: [
        {
          id: "1",
          url: "https://example.com/1",
          title: "記事",
          content_html: "<p>本文</p>",
          attachments: [
            { url: "https://example.com/audio.mp3", mime_type: "audio/mpeg" },
            { url: "https://example.com/photo.webp", mime_type: "image/webp" },
          ],
        },
      ],
    });
    const result = parseFeed(feed);
    expect(result.items[0].ogImage).toBe("https://example.com/photo.webp");
  });

  test("image を画像 attachment より優先して ogImage に使用する", () => {
    const feed = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Blog",
      items: [
        {
          id: "1",
          url: "https://example.com/1",
          title: "記事",
          content_html: "<p>本文</p>",
          image: "https://example.com/explicit.jpg",
          attachments: [{ url: "https://example.com/attached.jpg", mime_type: "image/jpeg" }],
        },
      ],
    });
    const result = parseFeed(feed);
    expect(result.items[0].ogImage).toBe("https://example.com/explicit.jpg");
  });

  test("非画像 attachment を ogImage に使用しない", () => {
    const feed = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Blog",
      items: [
        {
          id: "1",
          url: "https://example.com/1",
          title: "記事",
          content_html: "<p>本文</p>",
          attachments: [{ url: "https://example.com/audio.mp3", mime_type: "audio/mpeg" }],
        },
      ],
    });
    const result = parseFeed(feed);
    expect(result.items[0].ogImage).toBe("");
  });

  test("危険な画像 attachment URL を ogImage に使用しない", () => {
    const feed = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Blog",
      items: [
        {
          id: "1",
          url: "https://example.com/1",
          title: "記事",
          content_html: "<p>本文</p>",
          attachments: [{ url: "javascript:alert(1)", mime_type: "image/png" }],
        },
      ],
    });
    const result = parseFeed(feed);
    expect(result.items[0].ogImage).toBe("");
  });

  test("item の language を記事メタデータとして使用する", () => {
    const feed = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Blog",
      language: "ja",
      items: [
        {
          id: "1",
          url: "https://example.com/1",
          title: "English article",
          content_text: "Body",
          language: "  en-US  ",
        },
      ],
    });
    const result = parseFeed(feed);
    expect(result.items[0].metadata).toEqual([{ key: "language", value: "en-US" }]);
  });

  test("item に language がない場合は feed の language を継承する", () => {
    const feed = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Blog",
      language: "ja",
      items: [
        {
          id: "1",
          url: "https://example.com/1",
          title: "日本語の記事",
          content_text: "本文",
        },
      ],
    });
    const result = parseFeed(feed);
    expect(result.items[0].metadata).toEqual([{ key: "language", value: "ja" }]);
  });

  test("空文字・文字列以外の language は記事メタデータに使用しない", () => {
    const feed = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Blog",
      language: 42,
      items: [
        {
          id: "1",
          url: "https://example.com/1",
          title: "記事",
          content_text: "本文",
          language: "   ",
        },
      ],
    });
    const result = parseFeed(feed);
    expect(result.items[0].metadata).toEqual([]);
  });

  test("version フィールドがない JSON は JSON Feed として扱わない", () => {
    // jsonfeed.org を含まないため XML パーサーに fallback → "Unrecognized feed format" を投げる
    const feed = JSON.stringify({ title: "Not a feed", items: [] });
    expect(() => parseFeed(feed)).toThrow("Unrecognized feed format");
  });

  test("不正な JSON は XML パーサーにフォールバックする", () => {
    // 先頭が { でも JSON として不正なら XML パースを試みる → エラー
    expect(() => parseFeed("{invalid json}")).toThrow();
  });

  test('複数 authors が ", " 区切りで結合される', () => {
    const feed = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Blog",
      items: [
        {
          id: "1",
          url: "https://example.com/1",
          title: "記事",
          content_html: "<p>本文</p>",
          authors: [{ name: "著者A" }, { name: "著者B" }],
        },
      ],
    });
    const result = parseFeed(feed);
    expect(result.items[0].author).toBe("著者A, 著者B");
  });
});

test.describe("parseFeed — JSON Feed と既存形式の共存", () => {
  test("XML で始まる RSS フィードは従来通りパースされる", () => {
    const rss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>RSS Blog</title>
    <link>https://rss.example.com</link>
    <item>
      <title>RSS 記事</title>
      <link>https://rss.example.com/1</link>
      <guid>guid-1</guid>
      <description>説明</description>
    </item>
  </channel>
</rss>`;
    const result = parseFeed(rss);
    expect(result.title).toBe("RSS Blog");
    expect(result.items[0].title).toBe("RSS 記事");
  });
});

test("language メタデータを除外メニューで「言語」と表示する", () => {
  const article = makeArticle({ metadata: [{ key: "language", value: "ja" }] });
  expect(buildExcludeOptions(article)).toContainEqual({ label: "言語「ja」", value: "ja" });
});
