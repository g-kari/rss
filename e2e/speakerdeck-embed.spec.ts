import { test, expect } from "@playwright/test";
import {
  extractEmbedInfo,
  processContent,
  collectIframeUrlsFromHtml,
} from "../src/lib/embed-utils";
import {
  transformSpeakerDeckScriptEmbeds,
  transformSlideShareEmbedLinks,
} from "../src/lib/html-post-processor";

// ── extractEmbedInfo: SpeakerDeck player URL ─────────────────

test.describe("extractEmbedInfo — SpeakerDeck", () => {
  test("player URL を認識する", () => {
    const info = extractEmbedInfo(
      "https://speakerdeck.com/player/0c10de77615947f082ce9f8daa5c5569",
    );
    expect(info).not.toBeNull();
    expect(info!.type).toBe("video");
    expect(info!.embedUrl).toBe("https://speakerdeck.com/player/0c10de77615947f082ce9f8daa5c5569");
  });

  test("player URL のクエリパラメータ付きも認識する", () => {
    const info = extractEmbedInfo("https://speakerdeck.com/player/abc123def456?slide=5");
    expect(info).not.toBeNull();
    expect(info!.embedUrl).toContain("speakerdeck.com/player/abc123def456");
  });

  test("SpeakerDeck ページ URL は認識しない（player URL のみ）", () => {
    const info = extractEmbedInfo("https://speakerdeck.com/carta_engineering/some-talk");
    expect(info).toBeNull();
  });
});

// ── processContent: SpeakerDeck iframe ラッピング ────────────

test.describe("processContent — SpeakerDeck", () => {
  test("SpeakerDeck iframe をレスポンシブラッパーで包む", () => {
    const html = `<p>スライド:</p><iframe class="speakerdeck-iframe" src="https://speakerdeck.com/player/0c10de77615947f082ce9f8daa5c5569" width="710" height="399" style="aspect-ratio:710/399;" frameborder="0" allowfullscreen="allowfullscreen"></iframe>`;
    const result = processContent(html);
    expect(result).toContain("padding-bottom:");
    expect(result).toContain("speakerdeck.com/player/0c10de77615947f082ce9f8daa5c5569");
    expect(result).toContain("position:relative");
  });

  test("フォールバックリンクが生成される", () => {
    const html = `<iframe src="https://speakerdeck.com/player/abc123" width="710" height="399"></iframe>`;
    const result = processContent(html);
    expect(result).toContain("Speaker Deck で見る");
    expect(result).toContain("speakerdeck.com/player/abc123");
  });
});

// ── collectIframeUrlsFromHtml: SpeakerDeck ───────────────────

test.describe("collectIframeUrlsFromHtml — SpeakerDeck", () => {
  test("SpeakerDeck player iframe の src を収集する", () => {
    const html = `<iframe src="https://speakerdeck.com/player/abc123"></iframe>`;
    const urls = collectIframeUrlsFromHtml(html);
    expect(urls).toContain("https://speakerdeck.com/player/abc123");
  });
});

// ── transformSpeakerDeckScriptEmbeds ─────────────────────────

test.describe("transformSpeakerDeckScriptEmbeds", () => {
  test("speakerdeck-embed script タグを iframe に変換する", () => {
    const html = `<p>発表資料:</p><script async class="speakerdeck-embed" data-id="0c10de77615947f082ce9f8daa5c5569" data-ratio="1.7777777777777777" src="//speakerdeck.com/assets/embed.js"></script>`;
    const result = transformSpeakerDeckScriptEmbeds(html);
    expect(result).not.toContain("<script");
    expect(result).toContain(
      'src="https://speakerdeck.com/player/0c10de77615947f082ce9f8daa5c5569"',
    );
    expect(result).toContain("iframe");
    expect(result).toContain("発表資料:");
  });

  test("data-id がない script は変換しない", () => {
    const html = `<script class="speakerdeck-embed" src="//speakerdeck.com/assets/embed.js"></script>`;
    const result = transformSpeakerDeckScriptEmbeds(html);
    expect(result).toContain("<script");
  });

  test("data-ratio から aspect-ratio を算出する", () => {
    const html = `<script class="speakerdeck-embed" data-id="abc123" data-ratio="1.3333" src="//speakerdeck.com/assets/embed.js"></script>`;
    const result = transformSpeakerDeckScriptEmbeds(html);
    expect(result).toContain("aspect-ratio:");
  });

  test("data-ratio がない場合はデフォルト 16:9", () => {
    const html = `<script class="speakerdeck-embed" data-id="abc123" src="//speakerdeck.com/assets/embed.js"></script>`;
    const result = transformSpeakerDeckScriptEmbeds(html);
    expect(result).toContain("560/315");
  });

  test("複数の script タグを一括変換する", () => {
    const html = `<script class="speakerdeck-embed" data-id="aaa" src="//speakerdeck.com/assets/embed.js"></script><script class="speakerdeck-embed" data-id="bbb" src="//speakerdeck.com/assets/embed.js"></script>`;
    const result = transformSpeakerDeckScriptEmbeds(html);
    expect(result).toContain("speakerdeck.com/player/aaa");
    expect(result).toContain("speakerdeck.com/player/bbb");
    expect(result).not.toContain("<script");
  });

  test("speakerdeck-embed 以外の script は変換しない", () => {
    const html = `<script src="https://example.com/app.js"></script><script class="speakerdeck-embed" data-id="abc" src="//speakerdeck.com/assets/embed.js"></script>`;
    const result = transformSpeakerDeckScriptEmbeds(html);
    expect(result).toContain('src="https://example.com/app.js"');
    expect(result).toContain("speakerdeck.com/player/abc");
  });

  test("data-id に不正な文字が含まれる場合は変換しない", () => {
    const html = `<script class="speakerdeck-embed" data-id="abc<script>alert(1)</script>" src="//speakerdeck.com/assets/embed.js"></script>`;
    const result = transformSpeakerDeckScriptEmbeds(html);
    expect(result).not.toContain("speakerdeck.com/player/abc<script>");
  });

  test("self-closing script タグも変換する", () => {
    const html = `<script class="speakerdeck-embed" data-id="abc123" data-ratio="1.77" src="//speakerdeck.com/assets/embed.js" />`;
    const result = transformSpeakerDeckScriptEmbeds(html);
    expect(result).toContain("speakerdeck.com/player/abc123");
  });
});

// ── SlideShare: extractEmbedInfo ────────────────────────────────

test.describe("extractEmbedInfo — SlideShare", () => {
  test("embed_code URL を認識する", () => {
    const info = extractEmbedInfo("https://www.slideshare.net/slideshow/embed_code/287205719");
    expect(info).not.toBeNull();
    expect(info!.type).toBe("video");
    expect(info!.embedUrl).toBe("https://www.slideshare.net/slideshow/embed_code/287205719");
  });

  test("SlideShare ページ URL は認識しない（embed_code のみ）", () => {
    const info = extractEmbedInfo("https://www.slideshare.net/slideshow/claude-code/287205719");
    expect(info).toBeNull();
  });
});

// ── SlideShare: transformSlideShareEmbedLinks ───────────────────

test.describe("transformSlideShareEmbedLinks", () => {
  test("SlideShare リンクを iframe に変換する", () => {
    const html = `<a href="https://www.slideshare.net/slideshow/claude-code-claude-code-chatgpt-claude-code/287205719">Slides</a>`;
    const result = transformSlideShareEmbedLinks(html);
    expect(result).toContain("slideshare.net/slideshow/embed_code/287205719");
    expect(result).toContain("<iframe");
    expect(result).toContain("padding-bottom:56.25%");
  });

  test("フォールバックリンクが生成される", () => {
    const html = `<a href="https://www.slideshare.net/slideshow/test-slides/12345">Test</a>`;
    const result = transformSlideShareEmbedLinks(html);
    expect(result).toContain("SlideShare で見る");
    expect(result).toContain("slideshare.net/slideshow/test-slides/12345");
  });

  test("数値 ID がない SlideShare URL は変換しない", () => {
    const html = `<a href="https://www.slideshare.net/user123/some-deck">Link</a>`;
    const result = transformSlideShareEmbedLinks(html);
    expect(result).toBe(html);
  });

  test("ドット入りスラッグの URL も変換する", () => {
    const html = `<a href="https://www.slideshare.net/slideshow/node.js-best-practices/55555">Node</a>`;
    const result = transformSlideShareEmbedLinks(html);
    expect(result).toContain("slideshare.net/slideshow/embed_code/55555");
  });

  test("www なしの URL も変換する", () => {
    const html = `<a href="https://slideshare.net/slideshow/my-talk/99999">Talk</a>`;
    const result = transformSlideShareEmbedLinks(html);
    expect(result).toContain("slideshare.net/slideshow/embed_code/99999");
  });

  test("他のリンクは変換しない", () => {
    const html = `<a href="https://example.com/slides">Slides</a>`;
    const result = transformSlideShareEmbedLinks(html);
    expect(result).toBe(html);
  });

  test("複数の SlideShare リンクを一括変換する", () => {
    const html =
      `<a href="https://www.slideshare.net/slideshow/a/111">A</a>` +
      `<a href="https://www.slideshare.net/slideshow/b/222">B</a>`;
    const result = transformSlideShareEmbedLinks(html);
    expect(result).toContain("embed_code/111");
    expect(result).toContain("embed_code/222");
  });
});

// ── SlideShare: processContent iframe ラッピング ────────────────

test.describe("processContent — SlideShare", () => {
  test("SlideShare iframe をレスポンシブラッパーで包む", () => {
    const html = `<iframe src="https://www.slideshare.net/slideshow/embed_code/287205719" width="595" height="485"></iframe>`;
    const result = processContent(html);
    expect(result).toContain("position:relative");
    expect(result).toContain("slideshare.net/slideshow/embed_code/287205719");
  });

  test("フォールバックリンクが生成される", () => {
    const html = `<iframe src="https://www.slideshare.net/slideshow/embed_code/12345" width="595" height="485"></iframe>`;
    const result = processContent(html);
    expect(result).toContain("SlideShare で見る");
  });
});

// ── SlideShare: collectIframeUrlsFromHtml ───────────────────────

test.describe("collectIframeUrlsFromHtml — SlideShare", () => {
  test("SlideShare embed iframe の src を収集する", () => {
    const html = `<iframe src="https://www.slideshare.net/slideshow/embed_code/287205719"></iframe>`;
    const urls = collectIframeUrlsFromHtml(html);
    expect(urls).toContain("https://www.slideshare.net/slideshow/embed_code/287205719");
  });
});
