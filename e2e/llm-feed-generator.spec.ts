import { test, expect } from "@playwright/test";
import { extractLinkStructure, scrapeFeed } from "../src/lib/llm-feed-generator";

/**
 * llm-feed-generator.ts の単体テスト。
 *
 * extractLinkStructure: HTML から記事候補リンク構造を抽出する純粋関数
 * scrapeFeed: CSS セレクタで HTML から記事一覧を取得する純粋関数
 *
 * 両関数とも Workers AI 非依存の純粋処理のため、モックなしで検証できる。
 */

// =========================================================================
// extractLinkStructure
// =========================================================================

test.describe("extractLinkStructure — 基本的なリンク抽出", () => {
  test("同一オリジンの記事リンクを抽出する", () => {
    const html = `<html><body>
      <a href="/article/1">記事タイトル 1</a>
      <a href="/article/2">記事タイトル 2</a>
    </body></html>`;
    const result = extractLinkStructure(html, "https://example.com");
    expect(result.length).toBe(2);
    expect(result[0].h).toBe("https://example.com/article/1");
    expect(result[0].t).toBe("記事タイトル 1");
  });

  test("テキストが 5 文字未満のリンクをスキップする", () => {
    const html = `<html><body>
      <a href="/article/short">ab</a>
      <a href="/article/long">十分な長さのタイトル</a>
    </body></html>`;
    const result = extractLinkStructure(html, "https://example.com");
    expect(result.length).toBe(1);
    expect(result[0].h).toBe("https://example.com/article/long");
  });

  test("フラグメントのみのリンク (#) をスキップする", () => {
    const html = `<html><body>
      <a href="#section1">セクション1へ移動する</a>
      <a href="/article/1">記事タイトル 1</a>
    </body></html>`;
    const result = extractLinkStructure(html, "https://example.com");
    expect(result.length).toBe(1);
    expect(result[0].h).toBe("https://example.com/article/1");
  });

  test("javascript: リンクをスキップする", () => {
    const html = `<html><body>
      <a href="javascript:void(0)">ボタン的なリンク</a>
      <a href="/article/1">通常の記事リンク</a>
    </body></html>`;
    const result = extractLinkStructure(html, "https://example.com");
    expect(result.length).toBe(1);
    expect(result[0].h).toBe("https://example.com/article/1");
  });

  test("mailto: リンクをスキップする", () => {
    const html = `<html><body>
      <a href="mailto:info@example.com">メールを送る</a>
      <a href="/article/1">記事タイトル一つ目</a>
    </body></html>`;
    const result = extractLinkStructure(html, "https://example.com");
    expect(result.length).toBe(1);
  });

  test("外部ドメインのリンクをスキップする", () => {
    const html = `<html><body>
      <a href="https://other.com/article">外部サイトの記事</a>
      <a href="/article/1">内部サイトの記事</a>
    </body></html>`;
    const result = extractLinkStructure(html, "https://example.com");
    expect(result.length).toBe(1);
    expect(result[0].h).toBe("https://example.com/article/1");
  });

  test("重複する URL を除外する", () => {
    const html = `<html><body>
      <a href="/article/1">記事タイトル 1</a>
      <a href="/article/1">記事タイトル 1（重複）</a>
    </body></html>`;
    const result = extractLinkStructure(html, "https://example.com");
    expect(result.length).toBe(1);
  });

  test("絶対 URL は同一オリジンなら許可する", () => {
    const html = `<html><body>
      <a href="https://example.com/article/1">絶対URLの記事リンク</a>
    </body></html>`;
    const result = extractLinkStructure(html, "https://example.com");
    expect(result.length).toBe(1);
    expect(result[0].h).toBe("https://example.com/article/1");
  });
});

test.describe("extractLinkStructure — リンク構造の詳細", () => {
  test("className を c 配列に正しく格納する", () => {
    const html = `<html><body>
      <a href="/article/1" class="entry-link post-link">記事タイトル一つ目</a>
    </body></html>`;
    const result = extractLinkStructure(html, "https://example.com");
    expect(result[0].c).toEqual(["entry-link", "post-link"]);
  });

  test("クラスなしのリンクは c が空配列", () => {
    const html = `<html><body>
      <a href="/article/1">記事タイトル一つ目</a>
    </body></html>`;
    const result = extractLinkStructure(html, "https://example.com");
    expect(result[0].c).toEqual([]);
  });

  test("祖先タグ情報 p が格納される", () => {
    const html = `<html><body>
      <article class="post"><div class="entry"><a href="/article/1">記事タイトル1</a></div></article>
    </body></html>`;
    const result = extractLinkStructure(html, "https://example.com");
    expect(result[0].p.length).toBeGreaterThan(0);
    // 祖先タグはタグ名と classes の配列ペアになっている
    const [tag, classes] = result[0].p[0];
    expect(typeof tag).toBe("string");
    expect(Array.isArray(classes)).toBe(true);
  });

  test("テキストは最大 80 文字に切り詰める", () => {
    const longTitle = "あ".repeat(100); // 100 文字
    const html = `<html><body>
      <a href="/article/1">${longTitle}</a>
    </body></html>`;
    const result = extractLinkStructure(html, "https://example.com");
    expect(result[0].t.length).toBe(80);
  });

  test("リンクは最大 40 件に制限する", () => {
    const links = Array.from(
      { length: 50 },
      (_, i) => `<a href="/article/${i}">記事タイトル ${i} 番目</a>`,
    ).join("\n");
    const html = `<html><body>${links}</body></html>`;
    const result = extractLinkStructure(html, "https://example.com");
    expect(result.length).toBe(40);
  });
});

test.describe("extractLinkStructure — エッジケース", () => {
  test("リンクなしの HTML は空配列を返す", () => {
    const html = `<html><body><p>リンクなし</p></body></html>`;
    const result = extractLinkStructure(html, "https://example.com");
    expect(result).toEqual([]);
  });

  test("不正な HTML でも空配列を返す（クラッシュしない）", () => {
    const result = extractLinkStructure("<<garbage>>", "https://example.com");
    // エラーなく空配列かリンク配列を返すこと
    expect(Array.isArray(result)).toBe(true);
  });

  test("空の HTML 文字列は空配列を返す", () => {
    const result = extractLinkStructure("", "https://example.com");
    expect(result).toEqual([]);
  });
});

// =========================================================================
// scrapeFeed
// =========================================================================

const defaultSelectors = {
  articleLink: "article a.post-link",
  model: "@cf/meta/llama-3.1-8b-instruct-fp8",
  generatedAt: "2025-01-01T00:00:00.000Z",
};

test.describe("scrapeFeed — 基本的なスクレイピング", () => {
  const selectors = defaultSelectors;

  test("CSS セレクタで記事リンクを抽出する", () => {
    const html = `<html><body>
      <article><a class="post-link" href="/post/1">記事タイトル 1</a></article>
      <article><a class="post-link" href="/post/2">記事タイトル 2</a></article>
    </body></html>`;
    const result = scrapeFeed(html, selectors, "https://example.com", "Example Blog");
    expect(result.items.length).toBe(2);
    expect(result.items[0].link).toBe("https://example.com/post/1");
    expect(result.items[0].title).toBe("記事タイトル 1");
    expect(result.items[0].guid).toBe("https://example.com/post/1");
  });

  test("フィードタイトルとサイト URL を正しく設定する", () => {
    const html = `<html><body><a class="post-link" href="/post/1">記事テスト用</a></body></html>`;
    const result = scrapeFeed(
      html,
      { ...selectors, articleLink: "a.post-link" },
      "https://example.com",
      "My Blog",
    );
    expect(result.title).toBe("My Blog");
    expect(result.siteUrl).toBe("https://example.com");
  });

  test("重複する URL を除外する", () => {
    const html = `<html><body>
      <a class="post-link" href="/post/1">記事タイトル 1</a>
      <a class="post-link" href="/post/1">記事タイトル 1 再掲</a>
    </body></html>`;
    const result = scrapeFeed(
      html,
      { ...selectors, articleLink: "a.post-link" },
      "https://example.com",
      "My Blog",
    );
    expect(result.items.length).toBe(1);
  });

  test("タイトルが空の要素をスキップする", () => {
    const html = `<html><body>
      <a class="post-link" href="/post/1"></a>
      <a class="post-link" href="/post/2">記事タイトル 2</a>
    </body></html>`;
    const result = scrapeFeed(
      html,
      { ...selectors, articleLink: "a.post-link" },
      "https://example.com",
      "My Blog",
    );
    expect(result.items.length).toBe(1);
    expect(result.items[0].link).toBe("https://example.com/post/2");
  });
});

test.describe("scrapeFeed — 非 <a> セレクタの処理", () => {
  const selectors = defaultSelectors;
  test("セレクタが <a> 以外を指す場合、内部の <a> を探す", () => {
    const html = `<html><body>
      <li class="post-item"><a href="/post/1">記事タイトル 1</a></li>
      <li class="post-item"><a href="/post/2">記事タイトル 2</a></li>
    </body></html>`;
    const result = scrapeFeed(
      html,
      { ...selectors, articleLink: "li.post-item" },
      "https://example.com",
      "My Blog",
    );
    expect(result.items.length).toBe(2);
    expect(result.items[0].link).toBe("https://example.com/post/1");
  });

  test("内部に <a> がない非 <a> 要素をスキップする", () => {
    const html = `<html><body>
      <li class="post-item">テキストのみ</li>
      <li class="post-item"><a href="/post/1">記事タイトル 1</a></li>
    </body></html>`;
    const result = scrapeFeed(
      html,
      { ...selectors, articleLink: "li.post-item" },
      "https://example.com",
      "My Blog",
    );
    expect(result.items.length).toBe(1);
  });
});

test.describe("scrapeFeed — 無効なセレクタの処理", () => {
  const selectors = defaultSelectors;
  test("無効な CSS セレクタの場合 Error をスローする", () => {
    const html = `<html><body><a href="/post/1">記事タイトル</a></body></html>`;
    expect(() =>
      scrapeFeed(
        html,
        { ...selectors, articleLink: "[invalid::selector" },
        "https://example.com",
        "My Blog",
      ),
    ).toThrow();
  });

  test("エラーメッセージにセレクタ文字列が含まれる", () => {
    const html = `<html><body><a href="/post/1">記事タイトル</a></body></html>`;
    const invalidSelector = "[invalid::selector";
    try {
      scrapeFeed(
        html,
        { ...selectors, articleLink: invalidSelector },
        "https://example.com",
        "My Blog",
      );
      expect(true).toBe(false); // ここに到達してはならない
    } catch (e) {
      expect(e instanceof Error).toBe(true);
      expect((e as Error).message).toContain(invalidSelector);
    }
  });
});

test.describe("scrapeFeed — エッジケース", () => {
  const selectors = defaultSelectors;
  test("マッチなしは空の items を返す", () => {
    const html = `<html><body><a href="/post/1">記事タイトル</a></body></html>`;
    const result = scrapeFeed(
      html,
      { ...selectors, articleLink: "article.nonexistent a" },
      "https://example.com",
      "My Blog",
    );
    expect(result.items).toEqual([]);
  });

  test("100 件を超える要素は先頭 100 件のみ取得する", () => {
    const items = Array.from(
      { length: 150 },
      (_, i) =>
        `<article><a class="post-link" href="/post/${i}">記事タイトル ${i} 番目</a></article>`,
    ).join("\n");
    const html = `<html><body>${items}</body></html>`;
    const result = scrapeFeed(html, selectors, "https://example.com", "My Blog");
    expect(result.items.length).toBe(100);
  });

  test("相対パス href を絶対 URL に変換する", () => {
    const html = `<html><body>
      <article><a class="post-link" href="/post/1">記事タイトル 1</a></article>
    </body></html>`;
    const result = scrapeFeed(html, selectors, "https://example.com", "My Blog");
    expect(result.items[0].link).toBe("https://example.com/post/1");
    expect(result.items[0].link.startsWith("https://")).toBe(true);
  });

  test("フラグメント href (#) のリンクをスキップする", () => {
    const html = `<html><body>
      <article><a class="post-link" href="#">フラグメントリンク</a></article>
      <article><a class="post-link" href="/post/2">通常の記事リンク</a></article>
    </body></html>`;
    const result = scrapeFeed(html, selectors, "https://example.com", "My Blog");
    expect(result.items.length).toBe(1);
    expect(result.items[0].link).toBe("https://example.com/post/2");
  });

  test("items の各フィールドに正しい型・デフォルト値が設定される", () => {
    const html = `<html><body>
      <article><a class="post-link" href="/post/1">記事タイトル 1</a></article>
    </body></html>`;
    const result = scrapeFeed(html, selectors, "https://example.com", "My Blog");
    const item = result.items[0];
    expect(item.guid).toBe(item.link); // guid は link と同じ
    expect(item.summary).toBe(""); // summary は空文字
    expect(item.content).toBe(""); // content は空文字
    expect(item.ogImage).toBe(""); // ogImage は空文字
    expect(item.author).toBe(""); // author は空文字
    expect(item.publishedAt).toBeNull(); // publishedAt は null
  });
});
