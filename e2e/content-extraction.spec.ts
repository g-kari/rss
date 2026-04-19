import { test, expect } from "@playwright/test";
import {
  detectCharset,
  detectNextPageUrl,
  extractMainContent,
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
import { extractEmbedInfo, processContent, stripIframes } from "../src/lib/embed-utils";

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
  test("意味のある width/height 属性は保持して aspect-ratio 推論を有効にする", () => {
    // 元 HTML に width="640" height="480" があるとブラウザが aspect-ratio を推論でき、
    // 画像読み込み中の layout shift・アスペクト比崩れを防げる (Issue #86)。
    const html = '<img src="https://example.com/img.jpg" width="640" height="480" alt="test">';
    const result = fixImageDimensions(html);
    expect(result).toContain('width="640"');
    expect(result).toContain('height="480"');
    expect(result).toContain("src=");
  });

  test("ダミーサイズ (1x1 プレースホルダ) の width/height は削除する", () => {
    const html = '<img src="https://example.com/img.jpg" width="1" height="1">';
    const result = fixImageDimensions(html);
    expect(result).not.toContain("width=");
    expect(result).not.toContain("height=");
  });

  test("favicon サイズ (16x16) の width/height は保持する", () => {
    const html = '<img src="https://example.com/favicon.png" width="16" height="16">';
    const result = fixImageDimensions(html);
    expect(result).toContain('width="16"');
    expect(result).toContain('height="16"');
  });

  test("片方のみの width 属性は削除する (aspect-ratio 推論に使えないため)", () => {
    const html = '<img src="https://example.com/img.jpg" width="640">';
    const result = fixImageDimensions(html);
    expect(result).not.toContain("width=");
  });

  test("style 内の固定 width/height は常に削除する (意味のある属性は保持したまま)", () => {
    const html =
      '<img src="https://example.com/img.jpg" width="800" height="600" style="width:200px; height:150px; border:1px solid red">';
    const result = fixImageDimensions(html);
    expect(result).toContain('width="800"');
    expect(result).toContain('height="600"');
    expect(result).not.toMatch(/style="[^"]*\bwidth\s*:/i);
    expect(result).not.toMatch(/style="[^"]*\bheight\s*:/i);
    expect(result).toMatch(/style="[^"]*border\s*:/i);
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

test.describe("extractMainContent — Zenn 埋め込み回帰 (Issue #88)", () => {
  // 報告: zenn 記事内の埋め込みカード/ツイートが全て削除される。
  // 原因: Readability が iframe 含む <span class="zenn-embedded"> を本文外と判定して削除。
  // 対策: extractMainContent 側で Readability 実行前に <p><a> へ変換しておく。

  const buildZennArticleHtml = (embedSpan: string) => `
    <html>
      <head><title>テスト記事</title></head>
      <body>
        <article>
          <h1>CSS のアクセシビリティ Tips</h1>
          <p>本記事では、CSS で実装できるアクセシビリティ向上の Tips をいくつか紹介します。
          特に色やコントラスト、フォーカス制御に焦点を当てた具体例を交えて解説します。
          こうした小さな積み重ねが、より多くのユーザーに優しい Web 体験を生み出します。</p>
          ${embedSpan}
          <p>以下も合わせてご参照ください。サンプルコードを通じて理解を深めることができます。
          実装時にはブラウザの開発者ツールで実際の挙動を確認することをおすすめします。</p>
        </article>
      </body>
    </html>
  `;

  test("Zenn card embed が Readability 経由でも本文に保持される", () => {
    const cardSpan =
      `<span class="embed-block zenn-embedded zenn-embedded-card">` +
      `<iframe id="zenn-embedded__abc" src="https://embed.zenn.studio/card#zenn-embedded__abc"` +
      ` data-content="https%3A%2F%2Fzenn.dev%2Fgemcook%2Farticles%2Fcss-tips" frameborder="0"></iframe>` +
      `</span>`;
    const html = buildZennArticleHtml(cardSpan);
    const { content } = extractMainContent(html, "https://zenn.dev/gemcook/articles/css-tips3");
    expect(content).toContain("zenn.dev/gemcook/articles/css-tips");
    expect(content).not.toContain("embed.zenn.studio");
  });

  test("Zenn tweet embed が Readability 経由でも本文に保持される", () => {
    const tweetSpan =
      `<span class="embed-block zenn-embedded zenn-embedded-tweet">` +
      `<iframe src="https://embed.zenn.studio/tweet#zenn-embedded__xxx"` +
      ` data-content="https%3A%2F%2Fx.com%2Fexample%2Fstatus%2F1234567890"></iframe>` +
      `</span>`;
    const html = buildZennArticleHtml(tweetSpan);
    const { content } = extractMainContent(html, "https://zenn.dev/example/articles/test");
    expect(content).toContain("x.com/example/status/1234567890");
    expect(content).not.toContain("embed.zenn.studio");
  });

  test("Zenn mermaid embed が Readability 経由でも本文に保持される", () => {
    const mermaidSpan =
      `<span class="embed-block zenn-embedded zenn-embedded-mermaid">` +
      `<iframe src="https://embed.zenn.studio/mermaid#abc"` +
      ` data-content="flowchart%20TD%0A%20%20A%5BStart%5D%20--%3E%20B%5BEnd%5D"></iframe>` +
      `</span>`;
    const html = buildZennArticleHtml(mermaidSpan);
    const { content } = extractMainContent(html, "https://zenn.dev/example/articles/test");
    // Readability は class 属性を剥がすため `language-mermaid` クラスは保証しない。
    // 重要なのはソース本文が保持されること（埋め込みが消えなくなったこと）。
    expect(content).toContain("flowchart TD");
    expect(content).toContain("A[Start]");
    expect(content).not.toContain("embed.zenn.studio");
  });
});

test.describe("extractMainContent — Color Me Shop ギャラリー (Issue #82)", () => {
  // 報告: shop-pro.jp の商品ページで画像一覧が生成されない。
  // 原因: 商品画像が <form> 内の <div class="p-product-img__main-item"> に格納されており、
  //       Readability が <form> 配下を本文外と判定して全て除去する。
  // 対策: extractThumbListImgs に Color Me Shop の BEM クラスパターンを追加し、
  //       Readability 結果に hidden div としてギャラリーを付与する。

  const buildShopProHtml = () => `
    <html>
      <head><title>商品ページ</title></head>
      <body>
        <div class="p-product">
          <form name="product_form" method="post" action="/cart">
            <div class="p-product-img">
              <div class="p-product-img__main js-images-slider">
                <div class="p-product-img__main-item">
                  <img src="https://img21.shop-pro.jp/PA01498/757/product/191498462.jpg?cmsp_timestamp=20260417185350" alt="" />
                </div>
                <div class="p-product-img__main-item">
                  <img src="https://img21.shop-pro.jp/PA01498/757/product/191498462_o1.jpg?cmsp_timestamp=20260417185350" alt="" />
                </div>
                <div class="p-product-img__main-item">
                  <img src="https://img21.shop-pro.jp/PA01498/757/product/191498462_o2.jpg?cmsp_timestamp=20260417185350" alt="" />
                </div>
              </div>
            </div>
            <div class="p-product-detail">
              <h1>商品タイトル</h1>
              <p>こちらは商品の説明文です。十分な長さの説明文を書いておくことで Readability が本文として認識します。
              更に詳細な仕様や注意事項についてもこちらに記載されることが想定されます。
              この説明文を Readability が本文として抽出し、商品画像が外側にあると除外される構造を再現します。</p>
            </div>
          </form>
        </div>
      </body>
    </html>
  `;

  test("p-product-img__main-item 内の <img> がすべて hidden div に追加される", () => {
    const html = buildShopProHtml();
    const { content } = extractMainContent(html, "https://mitubado.shop-pro.jp/?pid=191498462");

    // 全 3 枚の画像 URL が後工程で /api/image-proxy 経由に書き換えられる。
    expect(content).toContain(encodeURIComponent("191498462.jpg"));
    expect(content).toContain(encodeURIComponent("191498462_o1.jpg"));
    expect(content).toContain(encodeURIComponent("191498462_o2.jpg"));
  });

  test("ギャラリーは <div hidden> として本文末尾に付与される", () => {
    const html = buildShopProHtml();
    const { content } = extractMainContent(html, "https://mitubado.shop-pro.jp/?pid=191498462");
    expect(content).toContain("<div hidden>");
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

  // issue #111: Cloudinary / imgix のように URL 内に encoded 区切り文字
  // (`%2C` = `,` / `%3F` = `?`) を含む形式でも src が壊されず丸ごと保持されること
  test("encoded delimiter (%2C / %3F) を含む src をそのまま proxy URL に渡す", () => {
    const src =
      "https://res.cloudinary.com/zenn/image/fetch/s--vROFFf0H--/c_limit%2Cf_auto%2Cfl_progressive%2Cq_auto%2Cw_1200/https://storage.googleapis.com/zenn-user-upload/deployed-images/ec22ab26a251daa56c50e608.png%3Fsha%3D164ce70563d1f6c510c273bafaaf5aeea8aa1edd";
    const html = `<img src="${src}">`;
    const result = rewriteImageUrls(html);
    expect(result).toContain(`url=${encodeURIComponent(src)}`);
    // サーバー側の decodeURIComponent で元 URL に戻せること
    const m = result.match(/url=([^"'\s]+)/);
    expect(m).not.toBeNull();
    expect(decodeURIComponent(m![1])).toBe(src);
  });

  // issue #111: Cloudinary の変換パラメータは path 内に生の `,` で埋め込まれることがある。
  // srcset は `,` を候補区切りに使うため、URL 内の `,` で壊れないこと。
  test("srcset 内の URL path に `,` が含まれていても候補が壊れない", () => {
    const url1 =
      "https://res.cloudinary.com/demo/image/fetch/c_limit,f_auto,q_auto,w_800/https://storage.googleapis.com/a.png";
    const url2 =
      "https://res.cloudinary.com/demo/image/fetch/c_limit,f_auto,q_auto,w_1600/https://storage.googleapis.com/a.png";
    const html = `<img srcset="${url1} 1x, ${url2} 2x">`;
    const result = rewriteImageUrls(html);
    // 各 URL 全体が proxy URL として保持されていること（途中で切れない）
    expect(result).toContain(`url=${encodeURIComponent(url1)}`);
    expect(result).toContain(`url=${encodeURIComponent(url2)}`);
    expect(result).toContain(" 1x");
    expect(result).toContain(" 2x");
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

  test("非 YouTube iframe は sanitizeHtml で除去される", () => {
    const html = '<iframe src="https://example.com/video"></iframe>';
    expect(processContent(html)).not.toContain("iframe");
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

  // --- Issue #87: bare numeric suffix ページネーション (denfaminicogamer 等) ---

  test("bare numeric suffix: /slug → /slug/2 のテキスト '2' リンクを検出する", () => {
    // rel="next" を持たないが <a>2</a> だけのページネーション
    const html = `<nav><a href="https://news.denfaminicogamer.jp/interview/260417u">1</a><a href="https://news.denfaminicogamer.jp/interview/260417u/2">2</a></nav>`;
    expect(detectNextPageUrl(html, "https://news.denfaminicogamer.jp/interview/260417u")).toBe(
      "https://news.denfaminicogamer.jp/interview/260417u/2",
    );
  });

  test("bare numeric suffix: /slug/2 → /slug/3 のテキスト '3' リンクを検出する", () => {
    const html = `<nav><a href="https://example.com/interview/abc-123">1</a><a href="https://example.com/interview/abc-123/2">2</a><a href="https://example.com/interview/abc-123/3">3</a></nav>`;
    expect(detectNextPageUrl(html, "https://example.com/interview/abc-123/2")).toBe(
      "https://example.com/interview/abc-123/3",
    );
  });

  test("bare numeric suffix: 連番記事 ID はテキスト '124' があっても null (slug 判定)", () => {
    // /post の末尾セグメント "post" は slug らしくないため誤検知されない
    const html = `<a href="https://example.com/post/124">124</a>`;
    expect(detectNextPageUrl(html, "https://example.com/post/123")).toBeNull();
  });

  test("bare numeric suffix: trailing slash 付き base URL (WordPress wp_link_pages) を検出する", () => {
    // WordPress サイトは pretty permalink で pathname 末尾に / が付く。
    // pagination リンクは /.../2/ のように /N/ が追加される。
    // さらに <a> の中身は <span class="page-number">2</span> と入れ子になっている。
    const html = `<div class="page-links">Pages: <span class="post-page-numbers current" aria-current="page"><span class="page-number">1</span></span> <a href="https://example.com/2026/04/11/sample-post-slug/2/" class="post-page-numbers"><span class="page-number">2</span></a> <a href="https://example.com/2026/04/11/sample-post-slug/3/" class="post-page-numbers"><span class="page-number">3</span></a></div>`;
    expect(detectNextPageUrl(html, "https://example.com/2026/04/11/sample-post-slug/")).toBe(
      "https://example.com/2026/04/11/sample-post-slug/2/",
    );
  });

  test("bare numeric suffix: trailing slash 付き /2/ → /3/ へも検出する", () => {
    const html = `<a href="https://example.com/2026/04/11/sample-post-slug/3/"><span class="page-number">3</span></a>`;
    expect(detectNextPageUrl(html, "https://example.com/2026/04/11/sample-post-slug/2/")).toBe(
      "https://example.com/2026/04/11/sample-post-slug/3/",
    );
  });

  test("bare numeric suffix: 別記事へのリンクは除外する", () => {
    const html = `<a href="https://news.denfaminicogamer.jp/other-article/2">2</a>`;
    expect(
      detectNextPageUrl(html, "https://news.denfaminicogamer.jp/interview/260417u"),
    ).toBeNull();
  });

  test("bare numeric suffix: 記事本文中の数字リンクは除外する (paginated variant でない)", () => {
    // 本文中に <a href="外部URL">2</a> のようなリンクがあっても拾わない
    const html = `<p><a href="https://example.com/chapter-2">2</a> 章を参照</p>`;
    expect(detectNextPageUrl(html, "https://example.com/interview/260417u")).toBeNull();
  });

  test("bare numeric suffix: 日付アーカイブ (/2025/01 → /2025/02) は誤検知しない", () => {
    // base 最終セグメント /2025 は純数字のため slug と見なさない
    const html = `<a href="https://example.com/2025/02">02</a>`;
    expect(detectNextPageUrl(html, "https://example.com/2025/01")).toBeNull();
  });
});

test.describe("processContent — XSS サニタイズ（フォールバック経路含む）", () => {
  // issue #51: RSS 本文フォールバック経路で sanitizeHtml が適用されているか確認
  // processContent は sanitizeHtml(transformXTweetEmbeds(html, theme)) で先にサニタイズする

  test("<script> タグが除去される", () => {
    const html = "<p>記事本文</p><script>alert(document.cookie)</script>";
    const result = processContent(html);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert(document.cookie)");
    expect(result).toContain("<p>記事本文</p>");
  });

  test("onerror イベントハンドラが除去される", () => {
    const html = '<img src="x" onerror="alert(1)"><p>本文</p>';
    const result = processContent(html);
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("alert(1)");
    expect(result).toContain("<p>本文</p>");
  });

  test("javascript: href が除去される", () => {
    const html = '<a href="javascript:alert(1)">クリック</a>';
    const result = processContent(html);
    expect(result).not.toContain("javascript:");
    expect(result).toContain("クリック");
  });

  test("data: URI の src が除去される", () => {
    const html = '<img src="data:text/html,<script>alert(1)</script>">';
    const result = processContent(html);
    expect(result).not.toContain("data:");
    expect(result).not.toContain("alert(1)");
  });

  test("信頼済みドメイン以外の <iframe> が除去される（RSS 本文に埋め込まれた場合）", () => {
    const html = '<iframe src="https://evil.example/phishing"></iframe><p>本文</p>';
    const result = processContent(html);
    expect(result).not.toContain("evil.example");
    expect(result).not.toContain("<iframe");
    expect(result).toContain("<p>本文</p>");
  });

  test("YouTube iframe は processContent 後も保持される", () => {
    const html = '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>';
    const result = processContent(html);
    expect(result).toContain("youtube.com/embed");
    expect(result).toContain("<iframe");
  });

  test("ダークテーマでも XSS が除去される", () => {
    const html = '<p>本文</p><script>document.write("evil")</script>';
    const result = processContent(html, "dark");
    expect(result).not.toContain("<script");
    expect(result).not.toContain("document.write");
    expect(result).toContain("<p>本文</p>");
  });
});

test.describe("stripIframes — XSS サニタイズ（埋め込みメディア経路）", () => {
  // issue #51: embedInfo が存在する場合の stripIframes 経路でも sanitizeHtml が適用されているか確認

  test("iframe が除去される", () => {
    const html = '<iframe src="https://evil.example/"></iframe><p>本文</p>';
    const result = stripIframes(html);
    expect(result).not.toContain("<iframe");
    expect(result).toContain("<p>本文</p>");
  });

  test("iframe 除去後も残った XSS が sanitizeHtml で除去される", () => {
    // iframe 除去後に残る可能性のある悪意あるコンテンツも sanitizeHtml で除去
    const html = "<p>本文</p><script>alert(1)</script>";
    const result = stripIframes(html);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert(1)");
    expect(result).toContain("<p>本文</p>");
  });

  test("iframe に onerror を含む場合も全体が除去される", () => {
    const html = '<iframe src="x" onerror="alert(1)"></iframe><p>本文</p>';
    const result = stripIframes(html);
    expect(result).not.toContain("<iframe");
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("alert(1)");
    expect(result).toContain("<p>本文</p>");
  });

  test("YouTube iframe も stripIframes で除去される（embedInfo 経路では iframe 不要）", () => {
    const html = '<iframe src="https://www.youtube.com/embed/abc123"></iframe><p>本文</p>';
    const result = stripIframes(html);
    expect(result).not.toContain("<iframe");
    expect(result).toContain("<p>本文</p>");
  });
});
