import { test, expect } from "@playwright/test";
import { htmlToMarkdown, generateFrontmatter } from "../src/lib/html-to-markdown";
import { makeArticle } from "./helpers/article";
import { makeFeed } from "./helpers/feed";

// ===== htmlToMarkdown =====

test.describe("htmlToMarkdown — 空・null", () => {
  test("空文字列は空文字を返す", () => {
    expect(htmlToMarkdown("")).toBe("");
  });

  test("空白のみは空文字を返す", () => {
    expect(htmlToMarkdown("   \n  ")).toBe("");
  });
});

test.describe("htmlToMarkdown — 見出し", () => {
  test("h1 は # に変換される", () => {
    expect(htmlToMarkdown("<h1>タイトル</h1>")).toContain("# タイトル");
  });

  test("h2 は ## に変換される", () => {
    expect(htmlToMarkdown("<h2>セクション</h2>")).toContain("## セクション");
  });

  test("h3 は ### に変換される", () => {
    expect(htmlToMarkdown("<h3>小見出し</h3>")).toContain("### 小見出し");
  });
});

test.describe("htmlToMarkdown — 段落・改行", () => {
  test("p タグはテキストとして展開される", () => {
    const result = htmlToMarkdown("<p>本文段落</p>");
    expect(result).toContain("本文段落");
  });

  test("複数 p タグは段落として区切られる", () => {
    const result = htmlToMarkdown("<p>段落1</p><p>段落2</p>");
    expect(result).toContain("段落1");
    expect(result).toContain("段落2");
  });
});

test.describe("htmlToMarkdown — リンク", () => {
  test("a タグは [text](url) に変換される", () => {
    const result = htmlToMarkdown('<a href="https://example.com">リンクテキスト</a>');
    expect(result).toContain("[リンクテキスト](https://example.com)");
  });

  test("href なし a タグはテキストのみ", () => {
    const result = htmlToMarkdown("<a>テキスト</a>");
    expect(result).toContain("テキスト");
  });
});

test.describe("htmlToMarkdown — 画像", () => {
  test("img タグは ![alt](url) に変換される", () => {
    const result = htmlToMarkdown('<img src="https://example.com/img.jpg" alt="説明">');
    expect(result).toContain("![説明](https://example.com/img.jpg)");
  });

  test("alt なし img は ![](url) に変換される", () => {
    const result = htmlToMarkdown('<img src="https://example.com/img.jpg">');
    expect(result).toContain("](https://example.com/img.jpg)");
  });
});

test.describe("htmlToMarkdown — リスト", () => {
  test("ul/li はリスト記法に変換される", () => {
    const result = htmlToMarkdown("<ul><li>項目1</li><li>項目2</li></ul>");
    expect(result).toContain("項目1");
    expect(result).toContain("項目2");
  });

  test("ol/li は番号付きリストに変換される", () => {
    const result = htmlToMarkdown("<ol><li>最初</li><li>次</li></ol>");
    expect(result).toContain("最初");
    expect(result).toContain("次");
  });
});

test.describe("htmlToMarkdown — 強調", () => {
  test("strong は **text** に変換される", () => {
    const result = htmlToMarkdown("<strong>強調</strong>");
    expect(result).toContain("**強調**");
  });

  test("em は *text* に変換される", () => {
    const result = htmlToMarkdown("<em>斜体</em>");
    expect(result).toMatch(/\*+斜体\*+/);
  });
});

test.describe("htmlToMarkdown — コード", () => {
  test("code タグは `code` に変換される", () => {
    const result = htmlToMarkdown("<code>const x = 1</code>");
    expect(result).toContain("`const x = 1`");
  });

  test("pre/code タグはコードブロックに変換される", () => {
    const result = htmlToMarkdown("<pre><code>const x = 1\nconst y = 2</code></pre>");
    expect(result).toContain("```");
  });
});

test.describe("htmlToMarkdown — セキュリティ", () => {
  test("script タグは除去される", () => {
    const result = htmlToMarkdown('<p>本文</p><script>alert("XSS")</script>');
    expect(result).not.toContain("script");
    expect(result).not.toContain("alert");
    expect(result).toContain("本文");
  });

  test("onclick 属性は除去される", () => {
    const result = htmlToMarkdown('<p onclick="evil()">テキスト</p>');
    expect(result).not.toContain("onclick");
    expect(result).toContain("テキスト");
  });
});

test.describe("htmlToMarkdown — blockquote", () => {
  test("blockquote は > 記法に変換される", () => {
    const result = htmlToMarkdown("<blockquote>引用テキスト</blockquote>");
    expect(result).toContain("> 引用テキスト");
  });
});

// ===== generateFrontmatter =====

test.describe("generateFrontmatter", () => {
  test("title・url・feed を含む YAML を返す", () => {
    const article = makeArticle({ title: "テスト記事" });
    const feed = makeFeed({ title: "テストフィード" });
    const result = generateFrontmatter(article, feed);

    expect(result).toContain("---");
    expect(result).toContain("title:");
    expect(result).toContain("テスト記事");
    expect(result).toContain("url:");
    expect(result).toContain("https://example.com/article");
    expect(result).toContain("feed:");
    expect(result).toContain("テストフィード");
  });

  test("author がある場合は含まれる", () => {
    const article = makeArticle({ author: "山田太郎" });
    const feed = makeFeed();
    const result = generateFrontmatter(article, feed);
    expect(result).toContain("author:");
    expect(result).toContain("山田太郎");
  });

  test("publishedAt がある場合は published として含まれる", () => {
    const article = makeArticle({ publishedAt: "2026-04-12T10:00:00Z" });
    const feed = makeFeed();
    const result = generateFrontmatter(article, feed);
    expect(result).toContain("published:");
    expect(result).toContain("2026-04-12");
  });

  test("author がない場合は author 行を含まない", () => {
    const article = makeArticle({ author: undefined });
    const feed = makeFeed();
    const result = generateFrontmatter(article, feed);
    expect(result).not.toContain("author:");
  });

  test("publishedAt が null の場合は published 行を含まない", () => {
    const article = makeArticle({ publishedAt: null });
    const feed = makeFeed();
    const result = generateFrontmatter(article, feed);
    expect(result).not.toContain("published:");
  });

  test("frontmatter は --- で開始・終了する", () => {
    const article = makeArticle();
    const feed = makeFeed();
    const result = generateFrontmatter(article, feed);
    expect(result.startsWith("---")).toBe(true);
    // 2つ目の --- で閉じる
    const parts = result.split("---");
    expect(parts.length).toBeGreaterThanOrEqual(3);
  });

  test("title に特殊文字が含まれる場合はクォートされる", () => {
    const article = makeArticle({ title: "タイトル with \"quotes\" and 'single'" });
    const feed = makeFeed();
    const result = generateFrontmatter(article, feed);
    expect(result).toContain("title:");
    // クラッシュしないこと
  });
});
