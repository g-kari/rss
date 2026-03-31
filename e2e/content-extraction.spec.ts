import { test, expect } from "@playwright/test";
import {
  detectCharset,
  detectNextPageUrl,
  fixLazyImages,
  fixImageDimensions,
  rewriteImageUrls,
  wrapTables,
  transformZennMermaidEmbeds,
  transformZennLinkEmbeds,
  fixExternalLinks,
  transformXTweetEmbeds,
} from "../src/lib/content";
import { sanitizeHtml } from "../src/lib/html";
import { extractEmbedInfo, processContent } from "../src/lib/embed-utils";

/**
 * extractMainContent / detectCharset のロジックを node スクリプトで検証する。
 * サーバー不要・認証不要で実行できる純粋なロジックテスト。
 *
 * 全文取得の正規表現バグ（non-greedy で途中切れ）が再発しないよう
 * 修正後のパターンを回帰テストとして定義する。
 */

// extractMainContent で使われる正規表現フォールバックのロジックを抜粋
function extractArticle(html: string): string | null {
  const cleaned = html
    .replace(/<head\b[\s\S]*?<\/head>/gi, "")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, "")
    .replace(/<header\b[\s\S]*?<\/header>/gi, "")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, "");

  const qiitaBody = cleaned.match(/<(\w+)[^>]+itemprop=["']articleBody["'][^>]*>([\s\S]*)<\/\1>/i);
  if (qiitaBody?.[2]) return qiitaBody[2];

  const znc = cleaned.match(/<(\w+)[^>]+class=["'][^"']*\bznc\b[^"']*["'][^>]*>([\s\S]*)<\/\1>/i);
  if (znc?.[2]) return znc[2];

  const article = cleaned.match(/<article\b[^>]*>([\s\S]*)<\/article>/i);
  if (article?.[1]) return article[1];

  const main = cleaned.match(/<main\b[^>]*>([\s\S]*)<\/main>/i);
  if (main?.[1]) return main[1];

  return null;
}

test.describe("detectCharset — 文字エンコーディング検出", () => {
  function toBytes(html: string, _encoding: string): Uint8Array {
    // TextEncoder は UTF-8 のみなので、Latin-1 範囲内でテスト
    // 実際の Shift-JIS バイト列の代わりに ASCII テキストで charset 検出ロジックを検証
    return new TextEncoder().encode(html);
  }

  test("Content-Type ヘッダーの charset を優先する", () => {
    const bytes = toBytes('<meta charset="utf-8">', "utf-8");
    expect(detectCharset("text/html; charset=euc-jp", bytes)).toBe("euc-jp");
  });

  test("Content-Type に charset がなければ meta charset を使う", () => {
    const html = '<html><head><meta charset="shift_jis"></head><body></body></html>';
    const bytes = new TextEncoder().encode(html);
    expect(detectCharset("text/html", bytes)).toBe("shift_jis");
  });

  test("meta http-equiv Content-Type の charset を検出する", () => {
    const html =
      '<html><head><meta http-equiv="Content-Type" content="text/html; charset=euc-jp"></head></html>';
    const bytes = new TextEncoder().encode(html);
    expect(detectCharset("text/html", bytes)).toBe("euc-jp");
  });

  test("charset が見つからなければ utf-8 を返す", () => {
    const bytes = new TextEncoder().encode("<html><body>hello</body></html>");
    expect(detectCharset("text/html", bytes)).toBe("utf-8");
  });

  test("Content-Type が空でも meta charset を検出する", () => {
    const html = '<!DOCTYPE html><html><head><meta charset="windows-31j"></head></html>';
    const bytes = new TextEncoder().encode(html);
    expect(detectCharset("", bytes)).toBe("windows-31j");
  });
});

test.describe("fixLazyImages — 遅延ロード・Shopify サムネイル解決", () => {
  test("data-src の {width} プレースホルダーを 800 に解決して src を上書きする", () => {
    const html =
      '<img src="//cdn/file_300x300.jpg" class="lazyload" data-src="//cdn/file_{width}x.jpg">';
    const result = fixLazyImages(html);
    expect(result).toContain('src="//cdn/file_800x.jpg"');
    expect(result).not.toContain('src="//cdn/file_300x300.jpg"');
  });

  test("Shopify _NNNxNNN サフィックスを _800x に置換する", () => {
    const html = '<img src="//cdn/file_300x300.jpg" alt="商品">';
    const result = fixLazyImages(html);
    expect(result).toContain("_800x.jpg");
    expect(result).not.toContain("_300x300.jpg");
  });

  test("Shopify _NNNx@2x サフィックスを _800x に置換する", () => {
    const html = '<img src="//cdn/file_530x@2x.jpg">';
    const result = fixLazyImages(html);
    expect(result).toContain("_800x.jpg");
    expect(result).not.toContain("_530x@2x.jpg");
  });

  test("通常の URL はそのまま保持される", () => {
    const html = '<img src="https://example.com/image.jpg" alt="test">';
    const result = fixLazyImages(html);
    expect(result).toBe(html);
  });

  test("data-src に {width} がない場合もそのまま src に昇格する", () => {
    const html = '<img src="placeholder.gif" data-src="//cdn/image.png">';
    const result = fixLazyImages(html);
    expect(result).toContain('src="//cdn/image.png"');
  });

  test("src なしで data-src だけある遅延ロード画像に src を追加する", () => {
    // Shopify 等で src を省略した完全遅延ロードパターン
    const html = '<img class="lazyload" data-src="//cdn/product_{width}x.jpg" alt="商品">';
    const result = fixLazyImages(html);
    expect(result).toContain('src="//cdn/product_800x.jpg"');
  });
});

test.describe("fixImageDimensions — 画像後処理", () => {
  test("固定 width/height 属性を除去する", () => {
    const html = '<img src="https://example.com/img.jpg" width="640" height="480" alt="test">';
    const result = fixImageDimensions(html);
    expect(result).not.toContain("width=");
    expect(result).not.toContain("height=");
    expect(result).toContain("src=");
  });

  test("相対パスを絶対 URL に変換する", () => {
    const html = '<img src="/images/photo.jpg" alt="写真">';
    const result = fixImageDimensions(html, "https://example.com/blog/article");
    expect(result).toContain('src="https://example.com/images/photo.jpg"');
  });

  test("./相対パスも絶対 URL に変換する", () => {
    const html = '<img src="./img/icon.png">';
    const result = fixImageDimensions(html, "https://example.com/blog/article");
    expect(result).toContain('src="https://example.com/blog/img/icon.png"');
  });

  test("https:// で始まる URL はそのまま保持する", () => {
    const html = '<img src="https://cdn.example.com/img.jpg">';
    const result = fixImageDimensions(html, "https://other.com/");
    expect(result).toContain('src="https://cdn.example.com/img.jpg"');
  });

  test("pageUrl なしでは相対パスを変換しない", () => {
    const html = '<img src="/images/photo.jpg">';
    const result = fixImageDimensions(html);
    expect(result).toContain('src="/images/photo.jpg"');
  });

  test('loading="lazy" を自動追加する', () => {
    const html = '<img src="https://example.com/img.jpg">';
    const result = fixImageDimensions(html);
    expect(result).toContain('loading="lazy"');
  });

  test("既存の loading 属性は上書きしない", () => {
    const html = '<img src="https://example.com/img.jpg" loading="eager">';
    const result = fixImageDimensions(html);
    expect(result).toContain('loading="eager"');
    expect(result).not.toContain('loading="lazy"');
  });
});

test.describe("transformZennMermaidEmbeds — Zenn mermaid 変換", () => {
  const ZENN_URL = "https://zenn.dev/user/articles/example";
  const OTHER_URL = "https://dev.classmethod.jp/articles/example";

  const makeMermaidSpan = (encodedContent: string) =>
    `<span class="embed-block zenn-embedded zenn-embedded-mermaid">` +
    `<iframe id="zenn-embedded__abc" src="https://embed.zenn.studio/mermaid#zenn-embedded__abc"` +
    ` data-content="${encodedContent}"></iframe></span>`;

  test("zenn.dev では mermaid embed が code ブロックに変換される", () => {
    const span = makeMermaidSpan("flowchart%20TD%0A%20%20A%5BStart%5D%20--%3E%20B%5BEnd%5D");
    const result = transformZennMermaidEmbeds(span, ZENN_URL);
    expect(result).not.toContain("<iframe");
    expect(result).not.toContain("embed.zenn.studio");
    expect(result).toContain("language-mermaid");
    expect(result).toContain("flowchart TD");
    expect(result).toContain("A[Start]");
  });

  test("zenn.dev 以外のドメインでは変換されない（classmethod 等）", () => {
    const span = makeMermaidSpan("flowchart%20TD%0A%20%20A%5BStart%5D%20--%3E%20B%5BEnd%5D");
    const result = transformZennMermaidEmbeds(span, OTHER_URL);
    // 変換されずそのまま返る
    expect(result).toBe(span);
    expect(result).toContain("<iframe");
  });

  test("pageUrl 省略時は変換されない", () => {
    const span = makeMermaidSpan("flowchart%20TD%0A%20%20A%5BStart%5D%20--%3E%20B%5BEnd%5D");
    const result = transformZennMermaidEmbeds(span);
    expect(result).toBe(span);
  });

  test("< > & が HTML エスケープされる (zenn.dev)", () => {
    // mermaid source: A[a<b] --> B{c>d}
    const span = makeMermaidSpan("A%5Ba%3Cb%5D%20--%3E%20B%7Bc%3Ed%7D");
    const result = transformZennMermaidEmbeds(span, ZENN_URL);
    expect(result).toContain("&lt;");
    expect(result).toContain("&gt;");
    expect(result).not.toContain("<b");
  });

  test("data-content がない iframe はそのまま保持される", () => {
    const span =
      `<span class="embed-block zenn-embedded zenn-embedded-mermaid">` +
      `<iframe src="https://embed.zenn.studio/mermaid#id"></iframe></span>`;
    const result = transformZennMermaidEmbeds(span, ZENN_URL);
    expect(result).toContain("<iframe");
  });

  test("mermaid 以外の Zenn embed は変換されない", () => {
    const otherEmbed =
      `<span class="embed-block zenn-embedded zenn-embedded-tweet">` +
      `<iframe src="https://embed.zenn.studio/twitter/xxx"></iframe></span>`;
    const result = transformZennMermaidEmbeds(otherEmbed, ZENN_URL);
    expect(result).toContain("<iframe");
    expect(result).toContain("embed.zenn.studio/twitter");
  });

  test("mermaid embed を含まない通常テキストは変更されない", () => {
    const html = "<p>通常のテキスト</p><pre><code>コードブロック</code></pre>";
    expect(transformZennMermaidEmbeds(html, ZENN_URL)).toBe(html);
  });
});

test.describe("transformZennLinkEmbeds — Zenn card/tweet embed 変換", () => {
  const makeCardSpan = (encodedUrl: string) =>
    `<span class="embed-block zenn-embedded zenn-embedded-card">` +
    `<iframe id="zenn-embedded__xxx" src="https://embed.zenn.studio/card#zenn-embedded__xxx"` +
    ` data-content="${encodedUrl}" frameborder="0" scrolling="no" loading="lazy"></iframe></span>`;

  const makeTweetSpan = (encodedUrl: string) =>
    `<span class="embed-block zenn-embedded zenn-embedded-tweet">` +
    `<iframe src="https://embed.zenn.studio/tweet#zenn-embedded__xxx"` +
    ` data-content="${encodedUrl}" frameborder="0" scrolling="no"></iframe></span>`;

  test("card embed の data-content から URL をデコードしてリンクに変換する", () => {
    const span = makeCardSpan("https%3A%2F%2Fdev.classmethod.jp%2Farticles%2Fexample%2F");
    const result = transformZennLinkEmbeds(span);
    expect(result).not.toContain("<iframe");
    expect(result).not.toContain("embed.zenn.studio");
    expect(result).toContain('<a href="https://dev.classmethod.jp/articles/example/"');
  });

  test("tweet embed の data-content から X/Twitter URL をデコードしてリンクに変換する", () => {
    const span = makeTweetSpan(
      "https%3A%2F%2Fx.com%2Ftenntenn%2Fstatus%2F1808029094111858945%3Fs%3D20",
    );
    const result = transformZennLinkEmbeds(span);
    expect(result).not.toContain("<iframe");
    expect(result).not.toContain("embed.zenn.studio");
    expect(result).toContain('<a href="https://x.com/tenntenn/status/1808029094111858945?s=20"');
  });

  test("zenn.dev 内の card embed も変換される（スキップしない）", () => {
    const span = makeCardSpan("https%3A%2F%2Fzenn.dev%2Fknowledgework%2Farticles%2F0160b8d008d1e9");
    const result = transformZennLinkEmbeds(span);
    expect(result).not.toContain("<iframe");
    expect(result).toContain('<a href="https://zenn.dev/knowledgework/articles/0160b8d008d1e9"');
  });

  test("data-content がない span はそのまま保持される", () => {
    const span =
      `<span class="embed-block zenn-embedded zenn-embedded-card">` +
      `<iframe src="https://embed.zenn.studio/card#id"></iframe></span>`;
    const result = transformZennLinkEmbeds(span);
    expect(result).toContain("<iframe");
  });

  test("javascript: スキームの URL はブロックされる", () => {
    const span = makeCardSpan("javascript%3Aalert(1)");
    const result = transformZennLinkEmbeds(span);
    expect(result).toBe(span);
    expect(result).toContain("<iframe");
  });

  test("embed を含まない通常テキストは変更されない", () => {
    const html = '<p>通常のテキスト</p><a href="https://example.com">リンク</a>';
    expect(transformZennLinkEmbeds(html)).toBe(html);
  });
});

test.describe("rewriteImageUrls — 画像プロキシ書き換え", () => {
  test("https:// の src を /api/image-proxy 経由に書き換える", () => {
    const html = '<img src="https://example.com/photo.jpg" alt="写真">';
    const result = rewriteImageUrls(html);
    expect(result).toContain('src="/api/image-proxy?url=');
    expect(result).toContain(encodeURIComponent("https://example.com/photo.jpg"));
    expect(result).not.toContain('src="https://example.com');
  });

  test("http:// の src も /api/image-proxy 経由に書き換える", () => {
    const html = '<img src="http://example.com/photo.jpg">';
    const result = rewriteImageUrls(html);
    expect(result).toContain("/api/image-proxy?url=");
    expect(result).toContain(encodeURIComponent("http://example.com/photo.jpg"));
  });

  test("相対パスの src は書き換えない", () => {
    const html = '<img src="/images/local.jpg" alt="ローカル">';
    const result = rewriteImageUrls(html);
    expect(result).toBe(html);
  });

  test("srcset の各 URL を /api/image-proxy 経由に書き換える", () => {
    const html =
      '<img src="https://cdn.example.com/img.jpg" srcset="https://cdn.example.com/img@2x.jpg 2x, https://cdn.example.com/img@3x.jpg 3x">';
    const result = rewriteImageUrls(html);
    expect(result).toContain("/api/image-proxy?url=");
    // 2x / 3x のディスクリプタが保持されるか確認
    expect(result).toContain("2x");
    expect(result).toContain("3x");
  });

  test("srcset の data: URL は書き換えない", () => {
    const html =
      '<img srcset="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==">';
    const result = rewriteImageUrls(html);
    // data: URL は書き換えないこと
    expect(result).not.toContain("/api/image-proxy?url=");
  });

  test("複数の img タグを同時に処理する", () => {
    const html =
      '<img src="https://example.com/a.jpg">' +
      "<p>テキスト</p>" +
      '<img src="https://example.com/b.jpg">';
    const result = rewriteImageUrls(html);
    const proxyMatches = result.match(/\/api\/image-proxy\?url=/g);
    expect(proxyMatches).toHaveLength(2);
  });
});

test.describe("wrapTables — テーブルのレスポンシブラップ", () => {
  test("<table> が overflow-x:auto のラッパーで囲まれる", () => {
    const html = "<table><tr><td>セル</td></tr></table>";
    const result = wrapTables(html);
    expect(result).toContain("overflow-x:auto");
    expect(result).toContain("<table>");
    expect(result).toContain("セル");
  });

  test("ラッパー div が table の前後にある通常コンテンツを変更しない", () => {
    const html = "<p>前</p><table><tr><td>テーブル</td></tr></table><p>後</p>";
    const result = wrapTables(html);
    expect(result).toContain("<p>前</p>");
    expect(result).toContain("<p>後</p>");
    expect(result).toContain("overflow-x:auto");
  });

  test("class 属性付き <table> も処理する", () => {
    const html = '<table class="data-table"><tr><th>ヘッダー</th></tr></table>';
    const result = wrapTables(html);
    expect(result).toContain("overflow-x:auto");
    expect(result).toContain('class="data-table"');
  });

  test("テーブルのないコンテンツは変更しない", () => {
    const html = "<p>テキスト</p><ul><li>項目</li></ul>";
    expect(wrapTables(html)).toBe(html);
  });
});

test.describe("sanitizeHtml — フォーム要素のフィッシング対策", () => {
  test("<form> タグを除去し内部コンテンツは保持する", () => {
    const html = '<form action="https://evil.com/steal"><p>フォームの説明</p></form>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("<form");
    expect(result).not.toContain("</form>");
    expect(result).toContain("フォームの説明");
  });

  test('<input type="password"> を除去してパスワード詐取を防ぐ', () => {
    const html =
      '<p>パスワードを入力してください</p><input type="password" placeholder="パスワード">';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("<input");
    expect(result).toContain("パスワードを入力してください");
  });

  test('<input type="text"> を除去する', () => {
    const html = '<input type="text" name="username" placeholder="ユーザー名">';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("<input");
  });

  test("<textarea> 要素を除去する", () => {
    const html = '<p>説明</p><textarea name="content">テキスト</textarea>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("<textarea");
    expect(result).toContain("説明");
  });

  test("<select> 要素を除去する", () => {
    const html = '<select name="choice"><option>選択肢1</option><option>選択肢2</option></select>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("<select");
    expect(result).not.toContain("<option");
  });

  test("フィッシングフォーム全体が無害化される", () => {
    const html =
      "<h2>アカウント認証</h2>" +
      '<form action="https://attacker.example/steal" method="POST">' +
      '<input type="text" name="user" placeholder="ユーザー名">' +
      '<input type="password" name="pass" placeholder="パスワード">' +
      "</form>";
    const result = sanitizeHtml(html);
    expect(result).not.toContain("<form");
    expect(result).not.toContain("<input");
    expect(result).not.toContain("attacker.example");
    expect(result).toContain("アカウント認証");
  });
});

test.describe("extractMainContent 回帰テスト", () => {
  test("article ネスト: 後半本文が切れない", () => {
    const html =
      '<html><body><article class="main"><h1>Title</h1><article class="inner">inner</article><p>後半の本文</p></article></body></html>';
    const result = extractArticle(html);
    expect(result).toContain("後半の本文");
  });

  test("Qiita itemprop: 複数段落がすべて取得される", () => {
    const html =
      '<html><body><div itemprop="articleBody"><p>段落1</p><p>段落2</p><p>段落3</p></div></body></html>';
    const result = extractArticle(html);
    expect(result).toContain("段落1");
    expect(result).toContain("段落2");
    expect(result).toContain("段落3");
  });

  test("Zenn znc: ネストした div 以降も取得される", () => {
    const html =
      '<html><body><div class="znc"><h2>見出し</h2><div class="code-block">コード</div><p>最後の段落</p></div></body></html>';
    const result = extractArticle(html);
    expect(result).toContain("見出し");
    expect(result).toContain("最後の段落");
  });

  test("main タグ: 全コンテンツが取得される", () => {
    const html =
      "<html><body><main><section><h2>セクション1</h2><p>本文1</p></section><section><h2>セクション2</h2><p>本文2</p></section></main></body></html>";
    const result = extractArticle(html);
    expect(result).toContain("セクション1");
    expect(result).toContain("セクション2");
    expect(result).toContain("本文2");
  });

  test("header/nav/footer は除去される", () => {
    const html =
      "<html><body><header>ナビ</header><main><p>本文</p></main><footer>フッター</footer></body></html>";
    const result = extractArticle(html);
    expect(result).toContain("本文");
    expect(result).not.toContain("ナビ");
    expect(result).not.toContain("フッター");
  });
});

test.describe("fixExternalLinks", () => {
  test('外部リンクに target="_blank" と rel="noopener noreferrer" が付与される', () => {
    const result = fixExternalLinks('<a href="https://example.com">リンク</a>');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).toContain('href="https://example.com"');
  });

  test("フラグメントのみ (#anchor) はそのまま保持される", () => {
    const input = '<a href="#section">アンカー</a>';
    const result = fixExternalLinks(input);
    expect(result).toBe(input);
  });

  test("href なしはそのまま保持される", () => {
    const input = "<a>テキスト</a>";
    const result = fixExternalLinks(input);
    expect(result).toBe(input);
  });

  test('既存の target を上書きして "_blank" にする', () => {
    const result = fixExternalLinks('<a href="https://example.com" target="_self">リンク</a>');
    expect(result).toContain('target="_blank"');
    expect(result).not.toContain('target="_self"');
  });

  test("既存の rel 属性に noopener noreferrer を追記する", () => {
    const result = fixExternalLinks('<a href="https://example.com" rel="nofollow">リンク</a>');
    expect(result).toContain("nofollow");
    expect(result).toContain("noopener");
    expect(result).toContain("noreferrer");
  });

  test("クォートなし rel 属性（rel=nofollow）も正しく処理される", () => {
    const result = fixExternalLinks('<a href="https://example.com" rel=nofollow>リンク</a>');
    expect(result).toContain("noopener");
    expect(result).toContain("noreferrer");
    // rel 属性が 1 つだけであることを確認（2 つあるとブラウザが最初の値を優先し noopener が無効になる）
    expect((result.match(/\brel\s*=/gi) ?? []).length).toBe(1);
  });

  test("既に noopener noreferrer があれば重複追加しない", () => {
    const result = fixExternalLinks(
      '<a href="https://example.com" rel="noopener noreferrer">リンク</a>',
    );
    const relMatch = result.match(/rel="([^"]*)"/);
    const relValues = relMatch?.[1].split(/\s+/) ?? [];
    expect(relValues.filter((v) => v === "noopener").length).toBe(1);
    expect(relValues.filter((v) => v === "noreferrer").length).toBe(1);
  });

  test("HTTP リンクにも付与される", () => {
    const result = fixExternalLinks('<a href="http://example.com">リンク</a>');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  test("複数リンクが混在しても正しく処理される", () => {
    const html = '<a href="#top">先頭へ</a><a href="https://example.com">外部</a><a>テキスト</a>';
    const result = fixExternalLinks(html);
    expect(result).toContain('<a href="#top">先頭へ</a>');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
    // アンカーリンクには付与されない
    const anchorPart = result.split('<a href="https://')[0];
    expect(anchorPart).not.toContain('target="_blank"');
  });

  test("相対パスの href を pageUrl ベースで絶対 URL に変換する", () => {
    const result = fixExternalLinks(
      '<a href="/about">About</a>',
      "https://example.com/articles/123",
    );
    expect(result).toContain('href="https://example.com/about"');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  test("相対パスの href は pageUrl なしでは変換されない", () => {
    const result = fixExternalLinks('<a href="/about">About</a>');
    expect(result).toContain('href="/about"');
    expect(result).toContain('target="_blank"');
  });

  test("絶対 URL の href は pageUrl があっても上書きされない", () => {
    const result = fixExternalLinks(
      '<a href="https://other.com/page">Link</a>',
      "https://example.com/articles/123",
    );
    expect(result).toContain('href="https://other.com/page"');
  });
});

test.describe("transformXTweetEmbeds — X (Twitter) ツイート埋め込み変換", () => {
  const makeTweetBlockquote = (tweetUrl: string, content = "ツイート本文") =>
    `<blockquote class="twitter-tweet"><p>${content}</p>` +
    `<a href="${tweetUrl}">リンク</a></blockquote>`;

  test("twitter.com の status URL から iframe embed に変換する", () => {
    const html = makeTweetBlockquote("https://twitter.com/user/status/1234567890123456789");
    const result = transformXTweetEmbeds(html);
    expect(result).not.toContain("<blockquote");
    expect(result).toContain('<div class="tweet-embed-wrapper">');
    expect(result).toContain("<iframe");
    expect(result).toContain("platform.twitter.com/embed/Tweet.html");
    expect(result).toContain("id=1234567890123456789");
  });

  test("x.com の status URL からも iframe embed に変換する", () => {
    const html = makeTweetBlockquote("https://x.com/user/status/9876543210987654321");
    const result = transformXTweetEmbeds(html);
    expect(result).not.toContain("<blockquote");
    expect(result).toContain("id=9876543210987654321");
  });

  test("デフォルトテーマは light である", () => {
    const html = makeTweetBlockquote("https://twitter.com/user/status/1234567890");
    const result = transformXTweetEmbeds(html);
    expect(result).toContain("theme=light");
    expect(result).not.toContain("theme=dark");
  });

  test("theme=dark を指定すると dark テーマで埋め込まれる", () => {
    const html = makeTweetBlockquote("https://twitter.com/user/status/1234567890");
    const result = transformXTweetEmbeds(html, "dark");
    expect(result).toContain("theme=dark");
    expect(result).not.toContain("theme=light");
  });

  test("dnt=true が付与されてプライバシーが保護される", () => {
    const html = makeTweetBlockquote("https://twitter.com/user/status/1234567890");
    const result = transformXTweetEmbeds(html);
    expect(result).toContain("dnt=true");
  });

  test("loading=lazy が付与される", () => {
    const html = makeTweetBlockquote("https://twitter.com/user/status/1234567890");
    const result = transformXTweetEmbeds(html);
    expect(result).toContain('loading="lazy"');
  });

  test("ツイート URL がない blockquote はそのまま保持する", () => {
    const html =
      '<blockquote class="twitter-tweet"><p>テキスト</p><a href="https://example.com">別リンク</a></blockquote>';
    const result = transformXTweetEmbeds(html);
    expect(result).toContain("<blockquote");
    expect(result).not.toContain("<iframe");
  });

  test("twitter-tweet クラスのない blockquote は変換しない", () => {
    const html =
      '<blockquote class="other-quote"><p>引用</p><a href="https://twitter.com/user/status/123">Twitter</a></blockquote>';
    const result = transformXTweetEmbeds(html);
    expect(result).toContain("<blockquote");
    expect(result).not.toContain("<iframe");
  });

  test("blockquote 内の複数リンクのうち最後のリンク（パーマリンク）からツイート ID を取得する", () => {
    // Twitter の標準埋め込みコードは blockquote 内に本文リンクとパーマリンクの2つのリンクを持つ
    const html =
      '<blockquote class="twitter-tweet">' +
      '<p>ツイート本文 <a href="https://example.com">リンク</a></p>' +
      '<a href="https://twitter.com/user/status/1111111111111111111">2024-01-01</a>' +
      "</blockquote>";
    const result = transformXTweetEmbeds(html);
    expect(result).toContain("id=1111111111111111111");
  });

  test("複数のツイート blockquote をすべて変換する", () => {
    const html =
      makeTweetBlockquote("https://twitter.com/user/status/1111111111") +
      "<p>区切り</p>" +
      makeTweetBlockquote("https://twitter.com/user/status/2222222222");
    const result = transformXTweetEmbeds(html);
    expect(result).not.toContain("<blockquote");
    const iframeCount = (result.match(/<iframe/g) ?? []).length;
    expect(iframeCount).toBe(2);
    expect(result).toContain("id=1111111111");
    expect(result).toContain("id=2222222222");
  });

  test("ツイートのない通常テキストは変更されない", () => {
    const html = "<p>通常のテキスト</p><blockquote><p>普通の引用</p></blockquote>";
    expect(transformXTweetEmbeds(html)).toBe(html);
  });
});

test.describe("extractEmbedInfo — YouTube URL パターン", () => {
  test("watch?v= 形式を認識する", () => {
    const info = extractEmbedInfo("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(info).not.toBeNull();
    expect(info!.embedUrl).toContain("dQw4w9WgXcQ");
    expect(info!.type).toBe("video");
  });

  test("shorts/ 形式を認識する", () => {
    const info = extractEmbedInfo("https://www.youtube.com/shorts/dQw4w9WgXcQ");
    expect(info).not.toBeNull();
    expect(info!.embedUrl).toContain("dQw4w9WgXcQ");
  });

  test("youtu.be 短縮 URL を認識する", () => {
    const info = extractEmbedInfo("https://youtu.be/dQw4w9WgXcQ");
    expect(info).not.toBeNull();
    expect(info!.embedUrl).toContain("dQw4w9WgXcQ");
  });

  test("youtu.be に ?si= トラッキングパラメータが付いても認識する", () => {
    const info = extractEmbedInfo("https://youtu.be/dQw4w9WgXcQ?si=TrackingParam123");
    expect(info).not.toBeNull();
    expect(info!.embedUrl).toContain("dQw4w9WgXcQ");
  });

  test("live/ 形式の YouTube Live URL を認識する（回帰テスト）", () => {
    const info = extractEmbedInfo("https://www.youtube.com/live/dQw4w9WgXcQ");
    expect(info).not.toBeNull();
    expect(info!.embedUrl).toContain("dQw4w9WgXcQ");
    expect(info!.type).toBe("video");
  });

  test("live/ 形式に ?feature=shared パラメータが付いても認識する", () => {
    const info = extractEmbedInfo("https://www.youtube.com/live/dQw4w9WgXcQ?feature=shared");
    expect(info).not.toBeNull();
    expect(info!.embedUrl).toContain("dQw4w9WgXcQ");
  });

  test("YouTube 以外の URL は null を返す", () => {
    expect(extractEmbedInfo("https://example.com/article")).toBeNull();
    expect(extractEmbedInfo("https://vimeo.com/123456789")).not.toBeNull(); // Vimeo は対応済み
  });
});

test.describe("processContent — YouTube iframe レスポンシブラップ", () => {
  test("YouTube embed iframe をレスポンシブ div でラップし、フォールバックリンクを追加する", () => {
    const html =
      '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" allowfullscreen></iframe>';
    const result = processContent(html);
    expect(result).toContain("padding-bottom:56.25%");
    expect(result).toContain("<iframe");
    expect(result).toContain("position:absolute");
    expect(result).toContain("youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result).toContain("YouTube で見る");
  });

  test("youtube-nocookie.com embed もラップしフォールバックリンクを追加する", () => {
    const html =
      '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" allowfullscreen></iframe>';
    const result = processContent(html);
    expect(result).toContain("padding-bottom:56.25%");
    expect(result).toContain("youtube.com/watch?v=dQw4w9WgXcQ");
  });

  test("allow 属性が保持される", () => {
    const html =
      '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>';
    const result = processContent(html);
    expect(result).toContain("allow=");
    expect(result).toContain("encrypted-media");
  });

  test("sanitizeHtml を通過した YouTube iframe も正しくラップされる", () => {
    const raw =
      '<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ?si=abc" title="Test" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
    const sanitized = sanitizeHtml(raw);
    const processed = processContent(sanitized);
    expect(processed).toContain("<iframe");
    expect(processed).toContain("padding-bottom:56.25%");
    expect(processed).toContain("allowfullscreen");
    expect(processed).toContain("encrypted-media");
  });

  test("非 YouTube iframe は変更しない", () => {
    const html = '<iframe src="https://example.com/video"></iframe>';
    expect(processContent(html)).toBe(html);
  });
});

test.describe("detectNextPageUrl — 次ページ URL 検出", () => {
  const BASE = "https://example.com/article/page/1";

  test("<link rel='next'> の href を返す", () => {
    const html = `<link rel="next" href="https://example.com/article/page/2">`;
    expect(detectNextPageUrl(html, BASE)).toBe("https://example.com/article/page/2");
  });

  test("<link href='...' rel='next'> 属性順序逆でも検出する", () => {
    const html = `<link href="https://example.com/article/page/2" rel="next">`;
    expect(detectNextPageUrl(html, BASE)).toBe("https://example.com/article/page/2");
  });

  test("<a rel='next'> の href を返す", () => {
    const html = `<a rel="next" href="https://example.com/article/page/2">次へ</a>`;
    expect(detectNextPageUrl(html, BASE)).toBe("https://example.com/article/page/2");
  });

  test("<a href='...' rel='next'> 属性順序逆でも検出する", () => {
    const html = `<a href="https://example.com/article/page/2" rel="next">次へ</a>`;
    expect(detectNextPageUrl(html, BASE)).toBe("https://example.com/article/page/2");
  });

  test("相対 URL を絶対 URL に解決する", () => {
    const html = `<link rel="next" href="/article/page/2">`;
    expect(detectNextPageUrl(html, BASE)).toBe("https://example.com/article/page/2");
  });

  test("別オリジンの URL は null を返す", () => {
    const html = `<link rel="next" href="https://other.com/article/page/2">`;
    expect(detectNextPageUrl(html, BASE)).toBeNull();
  });

  test("現在ページと同一の URL は null を返す", () => {
    const html = `<link rel="next" href="${BASE}">`;
    expect(detectNextPageUrl(html, BASE)).toBeNull();
  });

  test("javascript: href は null を返す", () => {
    const html = `<a rel="next" href="javascript:void(0)">次へ</a>`;
    expect(detectNextPageUrl(html, BASE)).toBeNull();
  });

  test("フラグメントのみの href は null を返す", () => {
    const html = `<a rel="next" href="#section2">次へ</a>`;
    expect(detectNextPageUrl(html, BASE)).toBeNull();
  });

  test("次ページ URL が存在しない場合は null を返す", () => {
    const html = `<a href="https://example.com/article/page/2">次へ</a>`;
    expect(detectNextPageUrl(html, BASE)).toBeNull();
  });

  test("<link rel='next'> が <a rel='next'> より優先される", () => {
    const html = [
      `<link rel="next" href="https://example.com/article/page/2">`,
      `<a rel="next" href="https://example.com/article/page/3">次へ</a>`,
    ].join("\n");
    expect(detectNextPageUrl(html, BASE)).toBe("https://example.com/article/page/2");
  });

  test("クエリパラメータ page= によるページネーションを検出する", () => {
    const html = `<link rel="next" href="https://example.com/article?page=2">`;
    expect(detectNextPageUrl(html, "https://example.com/article")).toBe(
      "https://example.com/article?page=2",
    );
  });

  test("クエリパラメータ page= の変化を検出する", () => {
    const html = `<link rel="next" href="https://example.com/article?page=2">`;
    expect(detectNextPageUrl(html, "https://example.com/article?page=1")).toBe(
      "https://example.com/article?page=2",
    );
  });

  // --- 誤検知ケース ---

  test("シリーズ記事の次記事 URL は null を返す (パスが別記事)", () => {
    // WordPress 等が <link rel="next"> でシリーズ次記事を指す場合
    const html = `<link rel="next" href="https://example.com/posts/another-article">`;
    expect(detectNextPageUrl(html, "https://example.com/posts/this-article")).toBeNull();
  });

  test("ブログ一覧ページネーション URL は null を返す (別パス)", () => {
    // 記事ページが /blog/page/2 (一覧ページ) を指す場合
    const html = `<link rel="next" href="https://example.com/blog/page/2">`;
    expect(detectNextPageUrl(html, "https://example.com/posts/my-article")).toBeNull();
  });

  test("連番記事 ID の次記事 URL は null を返す (/post/123 → /post/124)", () => {
    const html = `<link rel="next" href="https://example.com/post/124">`;
    expect(detectNextPageUrl(html, "https://example.com/post/123")).toBeNull();
  });
});
