// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseSlideUrl, getSlidePageProvider } from "./slide-providers";
import { resolveSlideEmbed, extractProviderSlideContent } from "./slide-content";
import { DOMParser } from "linkedom/worker";
import { processContent } from "./embed-utils";
import { getProviderContentCacheId } from "./slide-providers";
import { sanitizeHtml } from "./html";

const sd = "https://speakerdeck.com/player/31f86a9069ae0132dede22511952b5a3";
const ss = "https://www.slideshare.net/slideshow/embed_code/key/lNgbnj7xXLMj97";
const gs = "https://docs.google.com/presentation/d/e/2PACX-1vPublicPublishedExample123";

describe("safe slide providers", () => {
  it("recognizes SpeakerDeck players and SlideShare numeric/key players and public pages", () => {
    expect(parseSlideUrl(sd)?.provider).toBe("speakerdeck");
    expect(parseSlideUrl(ss)?.embedUrl).toBe(ss);
    expect(parseSlideUrl("https://slideshare.net/slideshow/my-talk/12345")?.embedUrl).toBe(
      "https://www.slideshare.net/slideshow/embed_code/12345",
    );
    expect(getSlidePageProvider("https://speakerdeck.com/jnunemaker/atom")).toBe("speakerdeck");
  });
  it("only embeds Google Slides published IDs and disables automatic advance", () => {
    expect(parseSlideUrl(`${gs}/pub?start=true&loop=true`)?.embedUrl).toBe(
      `${gs}/pubembed?start=false&loop=false&delayms=3000`,
    );
    expect(parseSlideUrl(`${gs}/embed`)?.provider).toBe("google-slides");
    expect(parseSlideUrl(`${gs}/pubembed`)?.provider).toBe("google-slides");
    expect(parseSlideUrl("https://docs.google.com/presentation/d/private-file-id/edit")).toBeNull();
    expect(
      parseSlideUrl("https://docs.google.com/presentation/d/private-file-id/embed"),
    ).toBeNull();
  });
  it.each([
    "https://speakerdeck.com.evil.test/player/abc123",
    "https://evil.test/?url=https://speakerdeck.com/player/abc123",
    "https://user:pass@speakerdeck.com/player/abc123",
    "https://speakerdeck.com:444/player/abc123",
    "http://speakerdeck.com/player/abc123",
    "https://speakerdeck.com/player/abc123/other",
    "https://www.slideshare.net/slideshow/embed_code/key/valid/extra",
    "https://docs.google.com/document/d/e/2PACX-valid/pubembed",
    `${gs}/pubembed/extra`,
    "https://docs.google.com/presentation/d/e/not-published/embed",
  ])("rejects URL confusion: %s", (url) => {
    expect(parseSlideUrl(url)).toBeNull();
    expect(sanitizeHtml(`<iframe src="${url}"></iframe>`)).not.toContain("<iframe");
  });
  it.each([sd, ss])(
    "keeps inline player layout bounded without duplicate style attributes: %s",
    (url) => {
      const html = processContent(
        `<iframe src="${url}" style="width:99999px;height:99999px"></iframe>`,
      );
      const frame = new DOMParser().parseFromString(html, "text/html").querySelector("iframe")!;
      expect(frame.style.position).toBe("absolute");
      expect(frame.style.width).toBe("100%");
      expect(frame.style.height).toBe("100%");
    },
  );
  it("versions new provider caches without changing the shipped Docswell version", () => {
    expect(getProviderContentCacheId("id", "https://speakerdeck.com/user/deck")).toBe(
      "slides-v1:id",
    );
    expect(getProviderContentCacheId("id", ss)).toBe("slides-v1:id");
    expect(getProviderContentCacheId("id", "https://www.docswell.com/s/user/KVJYJ3-title")).toBe(
      "docswell-v1:id",
    );
    expect(getProviderContentCacheId("id", "https://example.com/article")).toBe("id");
  });

  it("allows exact published Google and SlideShare key frame paths, never editor or Google pub pages", () => {
    expect(sanitizeHtml(`<iframe src="${ss}"></iframe>`)).toContain(ss);
    expect(sanitizeHtml(`<iframe src="${gs}/pubembed?start=true"></iframe>`)).toContain(
      "start=false",
    );
    expect(sanitizeHtml(`<iframe src="${gs}/pub"></iframe>`)).not.toContain("<iframe");
  });
  it("resolves the current SpeakerDeck data-id and public transcript without executing scripts", () => {
    const url = "https://speakerdeck.com/jnunemaker/atom";
    const html =
      '<div class="speakerdeck-embed" data-id="31f86a9069ae0132dede22511952b5a3"></div><div id="transcript"><ol><li><div class="slide-transcript"><h3>Page one</h3><p>Public notes</p></div></li><li><div class="slide-transcript">Page two &lt;script&gt;</div></li></ol></div><aside>Other decks</aside>';
    expect(resolveSlideEmbed(url, html)).toMatchObject({ embedUrl: sd, pageUrl: url });
    const result = extractProviderSlideContent(html, url)!;
    expect(result).toContain("Public notes");
    expect(result).toContain("2 ページ");
    expect(result).not.toContain("Other decks");
    expect(result).not.toContain("<script>");
  });
  it("uses SlideShare twitter:player key metadata and numbered public transcripts", () => {
    const url = "https://www.slideshare.net/slideshow/my-talk/152193732";
    const html = `<meta name="twitter:player" content="${ss}"><div class="transcript"><div><ul><li><span>1.</span><div><a>Title</a><span>First text</span></div></li><li><span>2.</span><div>Second text</div></li></ul></div></div>`;
    expect(resolveSlideEmbed(url, html)?.embedUrl).toBe(ss);
    expect(extractProviderSlideContent(html, url)).toContain("First text");
  });
  it("does not adopt metadata from unrelated providers or host lookalikes", () => {
    expect(
      resolveSlideEmbed(
        "https://www.slideshare.net/slideshow/deck/12345",
        `<meta name="twitter:player" content="${sd}">`,
      )?.embedUrl,
    ).toBe("https://www.slideshare.net/slideshow/embed_code/12345");
    expect(
      resolveSlideEmbed(
        "https://speakerdeck.com/user/deck",
        `<meta property="og:video" content="${ss}">`,
      ),
    ).toBeNull();
    expect(
      extractProviderSlideContent(
        `<meta name="twitter:player" content="${ss}">`,
        "https://evil.test/deck",
      ),
    ).toBeNull();
  });
});
