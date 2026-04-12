import { test, expect } from "@playwright/test";
import {
  articleToMarkdown,
  generateFrontmatter,
  htmlToMarkdown,
} from "../src/lib/html-to-markdown";
import type { Article, Feed } from "../src/types";

// テスト用ファクトリ
function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: "article-001",
    feedHash: "feed-hash-01",
    title: "テスト記事タイトル",
    link: "https://example.com/article/1",
    summary: "<p>記事のサマリーテキスト。</p>",
    content: "",
    author: "山田太郎",
    publishedAt: "2026-04-12T10:00:00Z",
    ...overrides,
  } as Article;
}

function makeFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    id: "feed-hash-01",
    title: "テックブログ",
    url: "https://example.com/feed.xml",
    siteUrl: "https://example.com",
    ...overrides,
  } as Feed;
}

// ===== articleToMarkdown =====

test.describe("articleToMarkdown — frontmatter + 本文の結合", () => {
  test("frontmatter と本文を --- で区切って結合する", () => {
    const article = makeArticle();
    const feed = makeFeed();
    const result = articleToMarkdown(article, feed, "<p>本文コンテンツ</p>");

    expect(result).toContain("---");
    expect(result).toContain("title:");
    expect(result).toContain("本文コンテンツ");
  });

  test("contentHtml が未指定の場合は summary を使う", () => {
    const article = makeArticle({ summary: "<p>サマリーの内容</p>" });
    const feed = makeFeed();
    const result = articleToMarkdown(article, feed);

    expect(result).toContain("サマリーの内容");
  });

  test("contentHtml が summary より優先される", () => {
    const article = makeArticle({ summary: "<p>サマリー</p>" });
    const feed = makeFeed();
    const result = articleToMarkdown(article, feed, "<p>フルコンテンツ</p>");

    expect(result).toContain("フルコンテンツ");
    expect(result).not.toContain("サマリー");
  });

  test("summary も contentHtml もない場合は frontmatter のみ", () => {
    const article = makeArticle({ summary: "" });
    const feed = makeFeed();
    const result = articleToMarkdown(article, feed);

    expect(result).toContain("---");
    expect(result).toContain("title:");
  });

  test("結果は --- で始まる（YAML frontmatter）", () => {
    const article = makeArticle();
    const feed = makeFeed();
    const result = articleToMarkdown(article, feed, "<h1>本文</h1>");
    expect(result.startsWith("---")).toBe(true);
  });
});

test.describe("articleToMarkdown — 本文の HTML→Markdown 変換", () => {
  test("h2 見出しが ## に変換される", () => {
    const article = makeArticle();
    const feed = makeFeed();
    const result = articleToMarkdown(article, feed, "<h2>セクション見出し</h2>");
    expect(result).toContain("## セクション見出し");
  });

  test("リンクが Markdown リンク記法になる", () => {
    const article = makeArticle();
    const feed = makeFeed();
    const result = articleToMarkdown(
      article,
      feed,
      '<a href="https://example.com">リンクテキスト</a>',
    );
    expect(result).toContain("[リンクテキスト](https://example.com)");
  });

  test("画像が Markdown 画像記法になる", () => {
    const article = makeArticle();
    const feed = makeFeed();
    const result = articleToMarkdown(
      article,
      feed,
      '<img src="https://example.com/img.jpg" alt="図">',
    );
    expect(result).toContain("![図](https://example.com/img.jpg)");
  });

  test("script タグは出力に含まれない", () => {
    const article = makeArticle();
    const feed = makeFeed();
    const result = articleToMarkdown(article, feed, '<p>本文</p><script>alert("xss")</script>');
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
  });
});

test.describe("articleToMarkdown — frontmatter の内容", () => {
  test("url フィールドに記事リンクが含まれる", () => {
    const article = makeArticle({ link: "https://techblog.example.com/post/123" });
    const feed = makeFeed();
    const result = articleToMarkdown(article, feed);
    expect(result).toContain("url:");
    expect(result).toContain("https://techblog.example.com/post/123");
  });

  test("feed フィールドにフィード名が含まれる", () => {
    const article = makeArticle();
    const feed = makeFeed({ title: "Zenn テックブログ" });
    const result = articleToMarkdown(article, feed);
    expect(result).toContain("feed:");
    expect(result).toContain("Zenn テックブログ");
  });

  test("author フィールドが著者名を含む", () => {
    const article = makeArticle({ author: "鈴木一郎" });
    const feed = makeFeed();
    const result = articleToMarkdown(article, feed);
    expect(result).toContain("author:");
    expect(result).toContain("鈴木一郎");
  });

  test("published フィールドが日付を YYYY-MM-DD 形式で含む", () => {
    const article = makeArticle({ publishedAt: "2026-04-12T15:30:00Z" });
    const feed = makeFeed();
    const result = articleToMarkdown(article, feed);
    expect(result).toContain("published:");
    expect(result).toContain("2026-04-12");
  });
});

// ===== generateFrontmatter — エッジケース =====

test.describe("generateFrontmatter — エッジケース", () => {
  test("タイトルに : を含む場合もクラッシュしない", () => {
    const article = makeArticle({ title: "JavaScript: 入門から応用まで" });
    const feed = makeFeed();
    expect(() => generateFrontmatter(article, feed)).not.toThrow();
    const result = generateFrontmatter(article, feed);
    expect(result).toContain("JavaScript");
  });

  test("タイトルに # を含む場合もクラッシュしない", () => {
    const article = makeArticle({ title: "C# プログラミング入門" });
    const feed = makeFeed();
    expect(() => generateFrontmatter(article, feed)).not.toThrow();
    const result = generateFrontmatter(article, feed);
    expect(result).toContain("C#");
  });

  test("フィード名に特殊文字を含む場合もクラッシュしない", () => {
    const article = makeArticle();
    const feed = makeFeed({ title: 'Feed: "テスト" #1' });
    expect(() => generateFrontmatter(article, feed)).not.toThrow();
  });
});

// ===== htmlToMarkdown — 複合テスト =====

test.describe("htmlToMarkdown — 実際の記事HTML", () => {
  test("ブログ記事の典型的な HTML を変換できる", () => {
    const html = `
      <article>
        <h2>はじめに</h2>
        <p>この記事では<strong>TypeScript</strong>について説明します。</p>
        <h2>インストール方法</h2>
        <pre><code>npm install typescript</code></pre>
        <p>詳細は<a href="https://typescriptlang.org">公式サイト</a>を参照。</p>
      </article>
    `;
    const result = htmlToMarkdown(html);

    expect(result).toContain("## はじめに");
    expect(result).toContain("**TypeScript**");
    expect(result).toContain("```");
    expect(result).toContain("npm install typescript");
    expect(result).toContain("[公式サイト](https://typescriptlang.org)");
  });

  test("入れ子の ul リストを変換できる", () => {
    const html = `
      <ul>
        <li>項目A</li>
        <li>項目B</li>
        <li>項目C</li>
      </ul>
    `;
    const result = htmlToMarkdown(html);
    expect(result).toContain("項目A");
    expect(result).toContain("項目B");
    expect(result).toContain("項目C");
    // リスト記法
    expect(result).toMatch(/[-*]\s+項目A/);
  });
});
