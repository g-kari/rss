import { test, expect } from "@playwright/test";
import {
  replaceUntilStable,
  processNestedBlocks,
  tryParseBase,
  wrapTables,
  removeNoise,
  transformZennLinkEmbeds,
  transformZennMermaidEmbeds,
  fixLazyImages,
  fixImageDimensions,
  rewriteImageUrls,
  fixExternalLinks,
  transformXTweetEmbeds,
  removeSmallThumbnailImages,
  postProcess,
  postProcessMarkdownContent,
  applyCorePipeline,
} from "../src/lib/html-post-processor";

// ── replaceUntilStable ──────────────────────────────────────────

test.describe("replaceUntilStable", () => {
  test("単純な置換が動作する", () => {
    const result = replaceUntilStable("abc", /b/g, "");
    expect(result).toBe("ac");
  });

  test("多段バイパスを潰す（<scr<script></script>ipt>）", () => {
    const result = replaceUntilStable(
      "<scr<script></script>ipt>alert(1)</script>",
      /<script\b[^>]*>[\s\S]*?<\/script>/gi,
    );
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert(1)");
  });

  test("変化しない文字列はそのまま返す", () => {
    const result = replaceUntilStable("hello world", /xyz/g, "");
    expect(result).toBe("hello world");
  });

  test("空文字列を処理できる", () => {
    const result = replaceUntilStable("", /abc/g, "");
    expect(result).toBe("");
  });

  test("最大8回で停止する（無限ループ防止）", () => {
    // replaceUntilStable は不動点反復なので、全ての x を除去すれば 1 回で安定
    const result = replaceUntilStable("x".repeat(100), /x/g, "");
    expect(result).toBe("");
  });
});

// ── tryParseBase ────────────────────────────────────────────────

test.describe("tryParseBase", () => {
  test("有効な URL を解析する", () => {
    const url = tryParseBase("https://example.com/path");
    expect(url).not.toBeNull();
    expect(url!.hostname).toBe("example.com");
  });

  test("空文字列は null を返す", () => {
    expect(tryParseBase("")).toBeNull();
  });

  test("不正な URL は null を返す", () => {
    expect(tryParseBase("not-a-url")).toBeNull();
  });
});

// ── removeNoise ─────────────────────────────────────────────────

test.describe("removeNoise", () => {
  test("Qiita のいいねボタンを除去する", () => {
    const html = '<div class="LikesButton">いいね</div><p>本文</p>';
    const result = removeNoise(html);
    expect(result).not.toContain("LikesButton");
    expect(result).not.toContain("いいね");
    expect(result).toContain("<p>本文</p>");
  });

  test("Qiita のシェアボタンを除去する", () => {
    const html = '<div class="ShareButtons"><button>共有</button></div><p>本文</p>';
    const result = removeNoise(html);
    expect(result).not.toContain("ShareButtons");
    expect(result).toContain("<p>本文</p>");
  });

  test("Zenn のチャプターリストを除去する", () => {
    const html = '<div class="ChapterList"><ul><li>Ch1</li></ul></div><p>記事本文</p>';
    const result = removeNoise(html);
    expect(result).not.toContain("ChapterList");
    expect(result).toContain("<p>記事本文</p>");
  });

  test("汎用の related / share クラスを除去する", () => {
    const html = '<div class="related-articles">関連記事</div><p>本文</p>';
    const result = removeNoise(html);
    expect(result).not.toContain("related-articles");
    expect(result).toContain("<p>本文</p>");
  });

  test("EC ギャラリーの画像を hidden div に変換する", () => {
    const html =
      '<ul class="product__media"><li><img src="a.jpg"></li><li><img src="b.jpg"></li></ul><p>商品説明</p>';
    const result = removeNoise(html);
    expect(result).toContain("<div hidden>");
    expect(result).toContain('src="a.jpg"');
    expect(result).toContain('src="b.jpg"');
    expect(result).toContain("<p>商品説明</p>");
  });

  test("ネストした div でも正しく除去する", () => {
    const html = '<div class="SideBar"><div class="inner"><p>サイドバー</p></div></div><p>本文</p>';
    const result = removeNoise(html);
    expect(result).not.toContain("SideBar");
    expect(result).not.toContain("サイドバー");
    expect(result).toContain("<p>本文</p>");
  });

  test("画像のみの UL（3件以上）を hidden div に変換する", () => {
    const html =
      '<ul><li><img src="1.jpg"></li><li><img src="2.jpg"></li><li><img src="3.jpg"></li></ul>';
    const result = removeNoise(html);
    expect(result).toContain("<div hidden>");
    expect(result).toContain('src="1.jpg"');
    expect(result).toContain('src="2.jpg"');
    expect(result).toContain('src="3.jpg"');
  });

  test("テキスト付き LI は UL を変換しない", () => {
    const html =
      '<ul><li><img src="1.jpg">長いテキスト説明</li><li><img src="2.jpg">説明2</li><li><img src="3.jpg">説明3</li></ul>';
    const result = removeNoise(html);
    expect(result).not.toContain("<div hidden>");
    expect(result).toContain("<ul>");
  });

  test("画像なし UL は変換しない", () => {
    const html = "<ul><li>テキスト1</li><li>テキスト2</li><li>テキスト3</li></ul>";
    const result = removeNoise(html);
    expect(result).toContain("<ul>");
    expect(result).not.toContain("<div hidden>");
  });

  test("2件以下の画像のみ UL は変換しない", () => {
    const html = '<ul><li><img src="1.jpg"></li><li><img src="2.jpg"></li></ul>';
    const result = removeNoise(html);
    expect(result).toContain("<ul>");
    expect(result).not.toContain("<div hidden>");
  });

  test("ノイズのない本文はそのまま返す", () => {
    const html = "<p>普通の段落</p><h2>見出し</h2><p>本文</p>";
    const result = removeNoise(html);
    expect(result).toBe(html);
  });
});

// ── fixLazyImages ───────────────────────────────────────────────

test.describe("fixLazyImages", () => {
  test("data-src を src に変換する", () => {
    const html = '<img src="placeholder.gif" data-src="https://example.com/image.jpg">';
    const result = fixLazyImages(html);
    expect(result).toContain('src="https://example.com/image.jpg"');
    expect(result).not.toContain("placeholder.gif");
  });

  test("data-src の {width} プレースホルダーを 800 に解決する", () => {
    const html = '<img data-src="https://cdn.example.com/img_{width}.jpg" src="thumb.gif">';
    const result = fixLazyImages(html);
    expect(result).toContain('src="https://cdn.example.com/img_800.jpg"');
  });

  test("src 属性がない場合に data-src から src を追加する", () => {
    const html = '<img data-src="https://example.com/lazy.jpg" alt="image">';
    const result = fixLazyImages(html);
    expect(result).toContain('src="https://example.com/lazy.jpg"');
  });

  test("data-srcset を srcset に昇格する", () => {
    const html = '<img src="x.jpg" data-srcset="a.jpg 1x, b.jpg 2x">';
    const result = fixLazyImages(html);
    expect(result).toContain('srcset="a.jpg 1x, b.jpg 2x"');
  });

  test("既存の srcset を data-srcset で上書きする", () => {
    const html = '<img src="x.jpg" srcset="old.jpg 1x" data-srcset="new.jpg 1x, new2.jpg 2x">';
    const result = fixLazyImages(html);
    expect(result).toContain('srcset="new.jpg 1x, new2.jpg 2x"');
    expect(result).not.toContain("old.jpg");
  });

  test("Shopify の _NNNxNNN サフィックスを _800x に置換する", () => {
    const html = '<img src="https://cdn.shopify.com/product_300x300.jpg">';
    const result = fixLazyImages(html);
    expect(result).toContain("product_800x.jpg");
  });

  test("Shopify の _NNNx@Nx サフィックスを _800x に置換する", () => {
    const html = '<img src="https://cdn.shopify.com/product_100x100@2x.png">';
    const result = fixLazyImages(html);
    expect(result).toContain("product_800x.png");
  });

  test("data-src も data-srcset もない img はそのまま返す", () => {
    const html = '<img src="https://example.com/normal.jpg" alt="test">';
    const result = fixLazyImages(html);
    expect(result).toContain('src="https://example.com/normal.jpg"');
  });
});

// ── fixImageDimensions ──────────────────────────────────────────

test.describe("fixImageDimensions", () => {
  test("小さい width/height 属性（トラッキングピクセル）を除去する", () => {
    const html = '<img src="x.gif" width="1" height="1">';
    const result = fixImageDimensions(html);
    expect(result).not.toContain("width=");
    expect(result).not.toContain("height=");
  });

  test("意味のあるサイズ（16px以上）は保持する", () => {
    const html = '<img src="photo.jpg" width="800" height="600">';
    const result = fixImageDimensions(html);
    expect(result).toContain("width=");
    expect(result).toContain("height=");
    expect(result).toContain("max-width: 800px");
  });

  test("相対 src を pageUrl ベースで絶対 URL に変換する", () => {
    const html = '<img src="/images/photo.jpg">';
    const result = fixImageDimensions(html, "https://example.com/article/1");
    expect(result).toContain('src="https://example.com/images/photo.jpg"');
  });

  test("既に絶対 URL の src は変換しない", () => {
    const html = '<img src="https://cdn.example.com/photo.jpg">';
    const result = fixImageDimensions(html, "https://example.com/");
    expect(result).toContain('src="https://cdn.example.com/photo.jpg"');
  });

  test("loading='lazy' を自動挿入する", () => {
    const html = '<img src="photo.jpg">';
    const result = fixImageDimensions(html);
    expect(result).toContain('loading="lazy"');
  });

  test("既存の loading 属性がある場合は追加しない", () => {
    const html = '<img src="photo.jpg" loading="eager">';
    const result = fixImageDimensions(html);
    expect(result).toContain('loading="eager"');
    const loadingCount = (result.match(/loading=/gi) || []).length;
    expect(loadingCount).toBe(1);
  });

  test("inline style の width/height を除去する", () => {
    const html = '<img src="photo.jpg" style="width:100px;height:50px;border:none">';
    const result = fixImageDimensions(html);
    expect(result).toContain("border:none");
    expect(result).not.toMatch(/width\s*:\s*100px/);
    expect(result).not.toMatch(/height\s*:\s*50px/);
  });

  test("srcset 内の相対 URL も絶対 URL に変換する", () => {
    const html = '<img src="photo.jpg" srcset="/images/small.jpg 480w, /images/large.jpg 1024w">';
    const result = fixImageDimensions(html, "https://example.com/article");
    expect(result).toContain("https://example.com/images/small.jpg");
    expect(result).toContain("https://example.com/images/large.jpg");
  });

  test("pageUrl が空の場合は相対 URL をそのまま保持する", () => {
    const html = '<img src="/images/photo.jpg">';
    const result = fixImageDimensions(html, "");
    expect(result).toContain('src="/images/photo.jpg"');
  });

  test("width のみの場合は属性を除去する", () => {
    const html = '<img src="x.jpg" width="400">';
    const result = fixImageDimensions(html);
    expect(result).not.toContain("width=");
  });
});

// ── rewriteImageUrls ────────────────────────────────────────────

test.describe("rewriteImageUrls", () => {
  test("http(s) URL を /api/image-proxy 経由に書き換える", () => {
    const html = '<img src="https://example.com/photo.jpg">';
    const result = rewriteImageUrls(html);
    expect(result).toContain("/api/image-proxy?url=");
    expect(result).toContain(encodeURIComponent("https://example.com/photo.jpg"));
  });

  test("相対 URL は書き換えない", () => {
    const html = '<img src="/images/local.jpg">';
    const result = rewriteImageUrls(html);
    expect(result).toContain('src="/images/local.jpg"');
    expect(result).not.toContain("/api/image-proxy");
  });

  test("srcset 内の URL もプロキシ経由に書き換える", () => {
    const html =
      '<img src="https://a.com/x.jpg" srcset="https://a.com/small.jpg 480w, https://a.com/large.jpg 1024w">';
    const result = rewriteImageUrls(html);
    expect(result).toContain(
      "/api/image-proxy?url=" + encodeURIComponent("https://a.com/small.jpg"),
    );
    expect(result).toContain(
      "/api/image-proxy?url=" + encodeURIComponent("https://a.com/large.jpg"),
    );
  });

  test("HTML エンティティ (&amp;) を含む URL を正しくデコードして書き換える", () => {
    const html = '<img src="https://example.com/img?a=1&amp;b=2">';
    const result = rewriteImageUrls(html);
    expect(result).toContain(encodeURIComponent("https://example.com/img?a=1&b=2"));
  });

  test("複数の img タグを一括で書き換える", () => {
    const html = '<img src="https://a.com/1.jpg"><img src="https://b.com/2.jpg">';
    const result = rewriteImageUrls(html);
    expect(result).toContain(encodeURIComponent("https://a.com/1.jpg"));
    expect(result).toContain(encodeURIComponent("https://b.com/2.jpg"));
  });
});

// ── transformZennLinkEmbeds ─────────────────────────────────────

test.describe("transformZennLinkEmbeds", () => {
  test("Zenn card embed を外部リンクに変換する", () => {
    const html =
      '<span class="embed-block zenn-embedded zenn-embedded-card">' +
      '<iframe src="https://embed.zenn.studio/card#zenn-embedded__abc" ' +
      'data-content="https%3A%2F%2Fexample.com%2Farticle"></iframe></span>';
    const result = transformZennLinkEmbeds(html);
    expect(result).toContain('<a href="https://example.com/article"');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).not.toContain("<iframe");
    expect(result).not.toContain("embed.zenn.studio");
  });

  test("Zenn tweet embed を外部リンクに変換する", () => {
    const html =
      '<span class="embed-block zenn-embedded zenn-embedded-tweet">' +
      '<iframe src="https://embed.zenn.studio/tweet#zenn-embedded__xyz" ' +
      'data-content="https%3A%2F%2Ftwitter.com%2Fuser%2Fstatus%2F123"></iframe></span>';
    const result = transformZennLinkEmbeds(html);
    expect(result).toContain("https://twitter.com/user/status/123");
    expect(result).toContain("<a href=");
  });

  test("data-content がない場合はそのまま返す", () => {
    const html =
      '<span class="embed-block zenn-embedded zenn-embedded-card">' +
      '<iframe src="https://embed.zenn.studio/card#zenn-embedded__abc"></iframe></span>';
    const result = transformZennLinkEmbeds(html);
    expect(result).toBe(html);
  });

  test("javascript: スキームの URL はブロックする（XSS防止）", () => {
    const html =
      '<span class="embed-block zenn-embedded zenn-embedded-card">' +
      '<iframe src="https://embed.zenn.studio/card" ' +
      'data-content="javascript%3Aalert(1)"></iframe></span>';
    const result = transformZennLinkEmbeds(html);
    expect(result).toBe(html);
    expect(result).not.toContain("<a href=");
  });

  test("data: スキームの URL はブロックする", () => {
    const html =
      '<span class="embed-block zenn-embedded zenn-embedded-card">' +
      '<iframe src="https://embed.zenn.studio/card" ' +
      'data-content="data%3Atext%2Fhtml%3B..."></iframe></span>';
    const result = transformZennLinkEmbeds(html);
    expect(result).not.toContain("<a href=");
  });

  test("URL 内の特殊文字が HTML エスケープされる", () => {
    const html =
      '<span class="embed-block zenn-embedded zenn-embedded-card">' +
      '<iframe src="https://embed.zenn.studio/card" ' +
      'data-content="https%3A%2F%2Fexample.com%2F%3Fa%3D1%26b%3D2"></iframe></span>';
    const result = transformZennLinkEmbeds(html);
    expect(result).toContain("&amp;");
    expect(result).not.toContain('"https://example.com/?a=1&b=2"');
  });

  test("embed 以外の span はそのまま返す", () => {
    const html = '<span class="other-class">テキスト</span>';
    const result = transformZennLinkEmbeds(html);
    expect(result).toBe(html);
  });
});

// ── transformZennMermaidEmbeds ──────────────────────────────────

test.describe("transformZennMermaidEmbeds", () => {
  test("zenn.dev の mermaid embed をコードブロックに変換する", () => {
    const html =
      '<span class="embed-block zenn-embedded zenn-embedded-mermaid">' +
      '<iframe src="https://embed.zenn.studio/mermaid" ' +
      'data-content="graph%20TD%0AA%20--%3E%20B"></iframe></span>';
    const result = transformZennMermaidEmbeds(html, "https://zenn.dev/user/articles/123");
    expect(result).toContain("<pre");
    expect(result).toContain('<code class="language-mermaid">');
    expect(result).toContain("graph TD");
    expect(result).not.toContain("<iframe");
  });

  test("zenn.dev 以外のドメインでは変換しない", () => {
    const html =
      '<span class="embed-block zenn-embedded zenn-embedded-mermaid">' +
      '<iframe src="https://embed.zenn.studio/mermaid" ' +
      'data-content="graph%20TD"></iframe></span>';
    const result = transformZennMermaidEmbeds(html, "https://classmethod.jp/articles/123");
    expect(result).toBe(html);
  });

  test("pageUrl が空の場合は変換しない", () => {
    const html =
      '<span class="embed-block zenn-embedded zenn-embedded-mermaid">' +
      '<iframe src="https://embed.zenn.studio/mermaid" ' +
      'data-content="graph%20TD"></iframe></span>';
    const result = transformZennMermaidEmbeds(html, "");
    expect(result).toBe(html);
  });

  test("data-content がない場合はそのまま返す", () => {
    const html =
      '<span class="embed-block zenn-embedded zenn-embedded-mermaid">' +
      '<iframe src="https://embed.zenn.studio/mermaid"></iframe></span>';
    const result = transformZennMermaidEmbeds(html, "https://zenn.dev/user/articles/123");
    expect(result).toBe(html);
  });

  test("mermaid ソース内の HTML 特殊文字がエスケープされる", () => {
    const html =
      '<span class="embed-block zenn-embedded zenn-embedded-mermaid">' +
      '<iframe data-content="A%20%3C--%3E%20B"></iframe></span>';
    const result = transformZennMermaidEmbeds(html, "https://zenn.dev/user/articles/1");
    expect(result).toContain("&lt;");
    expect(result).toContain("&gt;");
  });
});

// ── transformXTweetEmbeds ───────────────────────────────────────

test.describe("transformXTweetEmbeds", () => {
  test("twitter-tweet blockquote を iframe に変換する", () => {
    const html =
      '<blockquote class="twitter-tweet">' +
      "<p>ツイート内容</p>" +
      '<a href="https://twitter.com/user/status/1234567890">リンク</a>' +
      "</blockquote>";
    const result = transformXTweetEmbeds(html);
    expect(result).toContain("<iframe");
    expect(result).toContain("platform.twitter.com/embed/Tweet.html?id=1234567890");
    expect(result).toContain("dnt=true");
    expect(result).toContain("theme=light");
    expect(result).not.toContain("<blockquote");
  });

  test("x.com の URL にも対応する", () => {
    const html =
      '<blockquote class="twitter-tweet">' +
      '<a href="https://x.com/user/status/9876543210">link</a>' +
      "</blockquote>";
    const result = transformXTweetEmbeds(html);
    expect(result).toContain("id=9876543210");
  });

  test("dark テーマを指定できる", () => {
    const html =
      '<blockquote class="twitter-tweet">' +
      '<a href="https://twitter.com/user/status/123">link</a>' +
      "</blockquote>";
    const result = transformXTweetEmbeds(html, "dark");
    expect(result).toContain("theme=dark");
  });

  test("ツイート URL がない場合は元のまま返す", () => {
    const html = '<blockquote class="twitter-tweet">' + "<p>ツイート内容のみ</p>" + "</blockquote>";
    const result = transformXTweetEmbeds(html);
    expect(result).toContain("<blockquote");
    expect(result).not.toContain("<iframe");
  });

  test("twitter-tweet 以外の blockquote は変換しない", () => {
    const html =
      '<blockquote class="other-quote">' +
      "<p>引用</p>" +
      '<a href="https://twitter.com/user/status/123">link</a>' +
      "</blockquote>";
    const result = transformXTweetEmbeds(html);
    expect(result).toBe(html);
  });

  test("複数の blockquote.twitter-tweet を変換する", () => {
    const html =
      '<blockquote class="twitter-tweet"><a href="https://twitter.com/a/status/111">l</a></blockquote>' +
      '<blockquote class="twitter-tweet"><a href="https://x.com/b/status/222">l</a></blockquote>';
    const result = transformXTweetEmbeds(html);
    expect(result).toContain("id=111");
    expect(result).toContain("id=222");
    expect(result).not.toContain("<blockquote");
  });
});

// ── fixExternalLinks ────────────────────────────────────────────

test.describe("fixExternalLinks", () => {
  test("外部リンクに target='_blank' を付与する", () => {
    const html = '<a href="https://example.com">Link</a>';
    const result = fixExternalLinks(html);
    expect(result).toContain('target="_blank"');
  });

  test("rel='noopener noreferrer' を付与する", () => {
    const html = '<a href="https://example.com">Link</a>';
    const result = fixExternalLinks(html);
    expect(result).toContain('rel="noopener noreferrer"');
  });

  test("フラグメントリンク (#anchor) はそのまま保持する", () => {
    const html = '<a href="#section1">セクション1へ</a>';
    const result = fixExternalLinks(html);
    expect(result).toBe(html);
  });

  test("href なしのアンカーはそのまま保持する", () => {
    const html = "<a>テキスト</a>";
    const result = fixExternalLinks(html);
    expect(result).toBe(html);
  });

  test("相対 href を pageUrl ベースで絶対 URL に変換する", () => {
    const html = '<a href="/page/2">次のページ</a>';
    const result = fixExternalLinks(html, "https://example.com/article/1");
    expect(result).toContain('href="https://example.com/page/2"');
  });

  test("既存の target 属性を上書きする", () => {
    const html = '<a href="https://example.com" target="_self">Link</a>';
    const result = fixExternalLinks(html);
    expect(result).toContain('target="_blank"');
    expect(result).not.toContain("_self");
  });

  test("既存の rel 属性に noopener を追記する", () => {
    const html = '<a href="https://example.com" rel="external">Link</a>';
    const result = fixExternalLinks(html);
    expect(result).toContain("noopener");
    expect(result).toContain("noreferrer");
    expect(result).toContain("external");
  });

  test("data: URL は相対 URL 変換しないが target/rel は付与される", () => {
    const html = '<a href="data:text/plain;base64,SGVsbG8=">Link</a>';
    const result = fixExternalLinks(html, "https://example.com/");
    // data: URL は相対 URL 変換されないが、target="_blank" は付与される
    expect(result).toContain('target="_blank"');
    expect(result).toContain("data:text/plain");
  });
});

// ── wrapTables ──────────────────────────────────────────────────

test.describe("wrapTables", () => {
  test("table をスクロール可能なラッパーで包む", () => {
    const html = "<table><tr><td>セル</td></tr></table>";
    const result = wrapTables(html);
    expect(result).toContain("overflow-x:auto");
    expect(result).toContain("-webkit-overflow-scrolling:touch");
    expect(result).toContain("<table><tr><td>セル</td></tr></table>");
  });

  test("ネストした table にも対応する", () => {
    const html = "<table><tr><td><table><tr><td>内側</td></tr></table></td></tr></table>";
    const result = wrapTables(html);
    // 外側の table がラップされている
    expect(result).toContain("overflow-x:auto");
    expect(result).toContain("内側");
  });

  test("table がない場合はそのまま返す", () => {
    const html = "<p>テーブルなし</p>";
    const result = wrapTables(html);
    expect(result).toBe(html);
  });

  test("複数の table を個別にラップする", () => {
    const html =
      "<table><tr><td>表1</td></tr></table><p>中間テキスト</p><table><tr><td>表2</td></tr></table>";
    const result = wrapTables(html);
    const wrapperCount = (result.match(/overflow-x:auto/g) || []).length;
    expect(wrapperCount).toBe(2);
  });
});

// ── removeSmallThumbnailImages ──────────────────────────────────

test.describe("removeSmallThumbnailImages", () => {
  test("小さいサムネイル画像 (-30x30) を除去する", () => {
    const html = '<img src="https://example.com/image-30x30.jpg">';
    const result = removeSmallThumbnailImages(html);
    expect(result).toBe("");
  });

  test("大きいサムネイル画像 (-300x200) は保持する", () => {
    const html = '<img src="https://example.com/image-300x200.jpg">';
    const result = removeSmallThumbnailImages(html);
    expect(result).toBe(html);
  });

  test("サムネイルパターンでない画像は保持する", () => {
    const html = '<img src="https://example.com/photo.jpg">';
    const result = removeSmallThumbnailImages(html);
    expect(result).toBe(html);
  });

  test("width/height の片方だけ大きい場合は保持する", () => {
    const html = '<img src="https://example.com/banner-500x50.jpg">';
    const result = removeSmallThumbnailImages(html);
    expect(result).toBe(html);
  });

  test("99x99 は除去される（閾値100未満）", () => {
    const html = '<img src="https://example.com/thumb-99x99.png">';
    const result = removeSmallThumbnailImages(html);
    expect(result).toBe("");
  });

  test("100x100 は保持される（閾値ちょうど）", () => {
    const html = '<img src="https://example.com/thumb-100x100.png">';
    const result = removeSmallThumbnailImages(html);
    expect(result).toBe(html);
  });
});

// ── postProcess（統合テスト）─────────────────────────────────────

test.describe("postProcess — 統合テスト", () => {
  test("ノイズ除去 + 画像処理 + リンク修正 + サニタイズが一連で動作する", () => {
    const html =
      '<div class="ShareButtons"><button>共有</button></div>' +
      "<p>本文</p>" +
      '<img src="https://example.com/photo.jpg">' +
      '<a href="https://example.com">リンク</a>';
    const result = postProcess(html, "https://example.com/article");
    // ノイズが除去されている
    expect(result).not.toContain("ShareButtons");
    // 画像がプロキシ経由に書き換えられている
    expect(result).toContain("/api/image-proxy");
    // リンクに target="_blank" が付与されている
    expect(result).toContain('target="_blank"');
    // 本文が残っている
    expect(result).toContain("<p>本文</p>");
  });

  test("<script> タグが除去される（sanitizeHtml 経由）", () => {
    const html = '<p>本文</p><script>alert("XSS")</script>';
    const result = postProcess(html);
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
    expect(result).toContain("<p>本文</p>");
  });

  test("onerror イベントハンドラが除去される（sanitizeHtml 経由）", () => {
    const html = '<img src="x" onerror="alert(1)">';
    const result = postProcess(html);
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("alert(1)");
  });

  test("javascript: URL が除去される（sanitizeHtml 経由）", () => {
    const html = '<a href="javascript:alert(1)">Click</a>';
    const result = postProcess(html);
    expect(result).not.toContain("javascript:");
  });

  test("空のコンテンツでもエラーにならない", () => {
    const result = postProcess("");
    expect(result).toBe("");
  });

  test("遅延ロード画像が解決される", () => {
    const html = '<img data-src="https://example.com/lazy.jpg" src="placeholder.gif">';
    const result = postProcess(html);
    // data-src が解決され、プロキシ経由に書き換えられる
    expect(result).toContain("/api/image-proxy");
    expect(result).toContain(encodeURIComponent("https://example.com/lazy.jpg"));
  });

  test("小さいサムネイル画像が除去される", () => {
    const html = '<p>本文</p><img src="https://example.com/icon-16x16.jpg">';
    const result = postProcess(html);
    expect(result).not.toContain("icon-16x16.jpg");
    expect(result).toContain("<p>本文</p>");
  });

  test("table がラップされる", () => {
    const html = "<table><tr><td>データ</td></tr></table>";
    const result = postProcess(html);
    expect(result).toContain("overflow-x:auto");
  });
});

// ── postProcessMarkdownContent ──────────────────────────────────

test.describe("postProcessMarkdownContent", () => {
  test("Markdown 変換後の HTML に画像処理とサニタイズが適用される", () => {
    const html = '<p>本文</p><img src="https://example.com/photo.jpg">';
    const result = postProcessMarkdownContent(html, "https://example.com/");
    expect(result).toContain("/api/image-proxy");
    expect(result).toContain("<p>本文</p>");
  });

  test("Zenn embed 変換は適用されない（Markdown 変換で消失済み）", () => {
    const html = '<span class="zenn-embedded-card">something</span><p>本文</p>';
    const result = postProcessMarkdownContent(html);
    // Zenn embed 変換は postProcessMarkdownContent では実行されない
    // ただし sanitizeHtml は適用される
    expect(result).toContain("<p>本文</p>");
  });

  test("<script> タグが除去される", () => {
    const html = "<p>ok</p><script>bad()</script>";
    const result = postProcessMarkdownContent(html);
    expect(result).not.toContain("<script>");
    expect(result).toContain("<p>ok</p>");
  });
});

// ── applyCorePipeline ───────────────────────────────────────────

test.describe("applyCorePipeline", () => {
  test("パイプラインの順序が正しい（fixImageDimensions → rewriteImageUrls → fixExternalLinks → wrapTables → sanitizeHtml）", () => {
    const html =
      '<img src="/relative/photo.jpg">' +
      '<a href="/page">Link</a>' +
      "<table><tr><td>data</td></tr></table>" +
      '<script>alert("xss")</script>';
    const result = applyCorePipeline(html, "https://example.com/article");

    // 相対パスが絶対 URL に変換 → プロキシ経由に書き換え
    expect(result).toContain("/api/image-proxy");
    expect(result).toContain(encodeURIComponent("https://example.com/relative/photo.jpg"));

    // リンクの相対パスが絶対 URL に変換
    expect(result).toContain('href="https://example.com/page"');
    expect(result).toContain('target="_blank"');

    // テーブルがラップされている
    expect(result).toContain("overflow-x:auto");

    // XSS が除去されている
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
  });

  // #709: RSS の content/description に SpeakerDeck script や SlideShare リンクが含まれる場合、
  // xml-parser → applyCorePipeline 経路 (= 全文取得しない) でも iframe 化されていること。
  // content.ts:340-345 の Readability 前変換は維持しつつ、applyCorePipeline 側で
  // RSS 直流入経路も補完する設計 (両経路で冪等な多重呼出 OK)。
  test("SpeakerDeck の <script class='speakerdeck-embed'> を sanitize 直前で iframe 化する (#709)", () => {
    const html =
      "<p>本日の発表資料</p>" +
      '<script async class="speakerdeck-embed" data-id="0c10de77615947f082ce9f8daa5c5569" data-ratio="1.7777777777777777" src="//speakerdeck.com/assets/embed.js"></script>';
    const result = applyCorePipeline(html, "https://example.com/article");

    // <script> が iframe に置き換わっている (sanitize 後も残る)
    expect(result).not.toContain("<script");
    expect(result).toContain("speakerdeck.com/player/0c10de77615947f082ce9f8daa5c5569");
    expect(result).toContain("<iframe");
    // 本文の <p> は保持されている
    expect(result).toContain("本日の発表資料");
  });

  test("SlideShare の <a href='.../slideshow/{slug}/{id}'> を sanitize 直前で iframe 化する (#709)", () => {
    const html =
      "<p>共有スライド:</p>" +
      '<a href="https://www.slideshare.net/slideshow/claude-code-demo/287205719">スライドを開く</a>';
    const result = applyCorePipeline(html, "https://example.com/article");

    // <a> が iframe + フォールバックリンクに変換されている
    expect(result).toContain("slideshare.net/slideshow/embed_code/287205719");
    expect(result).toContain("<iframe");
    expect(result).toContain("SlideShare で見る");
  });

  test("transform 結果の iframe が sanitizeHtml の TRUSTED_IFRAME_RULES を通過する (#709)", () => {
    // sanitize より後段で transform を呼ぶと iframe が除去される回帰を防ぐ
    const html =
      '<script class="speakerdeck-embed" data-id="abc1234567890def" src="//speakerdeck.com/assets/embed.js"></script>';
    const result = applyCorePipeline(html, "https://example.com/article");

    expect(result).toContain("<iframe");
    expect(result).toContain("speakerdeck.com/player/abc1234567890def");
  });
});

// ── processNestedBlocks 直接 spec ──────────────────────────────────────────
// removeNoise 経由の indirect 観測のみだったため、unclosed-tag fallback path を含む
// 全 4 code path を 8 ケース canonical (boundary value 網羅) で固定する。

test.describe("processNestedBlocks", () => {
  test("対応する閉じタグがない場合は開きタグをそのまま出力する (unclosed fallback)", () => {
    const result = processNestedBlocks(
      '<div class="target">開きっぱなし',
      ["div"],
      (tag) => tag.includes('class="target"'),
      (_open, inner) => `<section>${inner}</section>`,
    );
    expect(result).toBe('<div class="target">開きっぱなし');
  });

  test("filter=null のとき全 tag に replacer を適用する", () => {
    const result = processNestedBlocks(
      "<div>content</div>",
      ["div"],
      null,
      (_open, inner) => `<p>${inner}</p>`,
    );
    expect(result).toBe("<p>content</p>");
  });

  test("深くネストした同一タグを正しく depth 追跡して処理する", () => {
    const result = processNestedBlocks(
      "<div><div>inner</div></div>",
      ["div"],
      null,
      (_open, inner) => `<span>${inner}</span>`,
    );
    expect(result).toBe("<span><div>inner</div></span>");
  });

  test("filter で false 返却された open tag はそのまま出力する", () => {
    const result = processNestedBlocks(
      '<div class="keep">untouched</div>',
      ["div"],
      (tag) => tag.includes('class="target"'),
      (_open, inner) => `<section>${inner}</section>`,
    );
    expect(result).toBe('<div class="keep">untouched</div>');
  });
});
