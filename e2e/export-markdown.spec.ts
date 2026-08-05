import { test, expect } from "@playwright/test";
import {
  articleBodyToPlainText,
  articleToMarkdownCitation,
  articleToMarkdown,
  buildArticleMarkdownFile,
  buildArticleTextFile,
  generateFrontmatter,
  htmlToMarkdown,
} from "../src/lib/html-to-markdown";
import { makeArticle } from "./helpers/article";
import { makeFeed } from "./helpers/feed";

// ===== articleBodyToPlainText =====

test.describe("articleBodyToPlainText — 記事本文のプレーンテキスト化", () => {
  test("contentHtml を優先し、ブロック要素とリストの改行を保つ", () => {
    const article = makeArticle({ summary: "<p>サマリー</p>" });
    const contentHtml =
      "<h2>見出し</h2><p>本文 <strong>強調</strong> &amp; 続き</p><ul><li>項目A</li><li>項目B</li></ul>";

    expect(articleBodyToPlainText(article, contentHtml)).toBe(
      "見出し\n本文 強調 & 続き\n• 項目A\n• 項目B",
    );
  });

  test("contentHtml がない場合は summary を使う", () => {
    const article = makeArticle({ summary: "<p>RSS の要約<br>2 行目</p>" });

    expect(articleBodyToPlainText(article)).toBe("RSS の要約\n2 行目");
  });

  test("本文も summary もない場合は空文字列を返す", () => {
    const article = makeArticle({ summary: "" });

    expect(articleBodyToPlainText(article)).toBe("");
  });
});

// ===== buildArticleTextFile =====

test.describe("buildArticleTextFile — 記事テキストファイル生成", () => {
  test("安全な .txt ファイル名とプレーンテキスト本文を返す", () => {
    const article = makeArticle({ title: 'repo/name: "test" <#1>', summary: "<p>要約</p>" });

    const result = buildArticleTextFile(article, "<h2>見出し</h2><p>保存する本文</p>");

    expect(result.filename).toBe("repo-name- test 1.txt");
    expect(result.content).toBe("見出し\n保存する本文");
  });

  test("タイトルが空の場合は article.txt を使う", () => {
    const article = makeArticle({ title: "", summary: "<p>RSS の要約</p>" });

    expect(buildArticleTextFile(article)).toEqual({
      content: "RSS の要約",
      filename: "article.txt",
    });
  });
});

// ===== buildArticleMarkdownFile =====

test.describe("buildArticleMarkdownFile — 記事ファイル生成", () => {
  test("安全な .md ファイル名と frontmatter + 本文を返す", () => {
    const article = makeArticle({ title: 'repo/name: "test" <#1>' });
    const feed = makeFeed({ title: "技術ブログ" });

    const result = buildArticleMarkdownFile(article, feed, "<p>保存する本文</p>");

    expect(result.filename).toBe("repo-name- test 1.md");
    expect(result.content).toContain("title: 'repo/name: \"test\" <#1>'");
    expect(result.content).toContain("保存する本文");
  });

  test("タイトルが空の場合は article.md を使う", () => {
    const article = makeArticle({ title: "" });

    expect(buildArticleMarkdownFile(article, makeFeed()).filename).toBe("article.md");
  });
});

// ===== articleToMarkdownCitation =====

test.describe("articleToMarkdownCitation — 出典付きリンク", () => {
  test("著者・フィード名・公開日をリンクの後ろに付ける", () => {
    const article = makeArticle({
      title: "引用したい記事",
      link: "https://example.com/citation",
      author: "山田 太郎",
      publishedAt: "2026-08-05T12:34:56Z",
    });
    const feed = makeFeed({ title: "技術ブログ" });

    expect(articleToMarkdownCitation(article, feed)).toBe(
      "[引用したい記事](https://example.com/citation) — 山田 太郎 · 技術ブログ · 2026-08-05",
    );
  });

  test("出典情報がない場合は Markdown リンクだけを返す", () => {
    const article = makeArticle({ author: undefined, publishedAt: undefined });

    expect(articleToMarkdownCitation(article)).toBe("[Test Article](https://example.com/article)");
  });

  test("Markdown リンクラベルの特殊文字をエスケープする", () => {
    const article = makeArticle({ title: String.raw`A \ [B]`, publishedAt: undefined });

    expect(articleToMarkdownCitation(article)).toBe(
      String.raw`[A \\ \[B\]](https://example.com/article)`,
    );
  });

  test("不正な公開日は出力しない", () => {
    const article = makeArticle({ author: "著者", publishedAt: "日付不明" });

    expect(articleToMarkdownCitation(article)).toBe(
      "[Test Article](https://example.com/article) — 著者",
    );
  });
});

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
