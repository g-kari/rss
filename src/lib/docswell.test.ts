// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DOMParser } from "linkedom/worker";
import { getSlideAwareContentCacheId, parseDocswellUrl } from "./docswell";
import { extractEmbedInfo, processContent } from "./embed-utils";
import { sanitizeHtml } from "./html";
import { applyCorePipeline, transformDocswellScriptEmbeds } from "./html-post-processor";
import { extractDocswellTranscript } from "./docswell-content";
import { extractMainContent } from "./content";

const page = "https://www.docswell.com/s/3402128/KVJYJ3-2026-09-15-202358?__readwiseLocation=#p1";
const embed = "https://www.docswell.com/slide/KVJYJ3/embed";
const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
const script = `<script async class="docswell-embed" src="https://www.docswell.com/assets/libs/docswell-embed/docswell-embed.min.js" data-src="${embed}" data-aspect="0.5625"></script>`;

describe("Docswell slides", () => {
  it("versions only Docswell local cache entries", () => {
    expect(getSlideAwareContentCacheId("id", page)).toBe("docswell-v1:id");
    expect(getSlideAwareContentCacheId("id", "https://example.com/article")).toBe("id");
    expect(getSlideAwareContentCacheId("id")).toBe("id");
  });

  it("recognizes the requested page and drops tracking parameters from the player", () => {
    expect(parseDocswellUrl(page)).toEqual({
      id: "KVJYJ3",
      embedUrl: embed,
      pageUrl: page.split("?")[0],
    });
    expect(extractEmbedInfo(page)).toMatchObject({ type: "slides", embedUrl: embed });
    expect(parseDocswellUrl("https://docswell.com/slide/KVJYJ3/embed?mode=extend")).toMatchObject({
      embedUrl: embed,
    });
  });

  it.each([
    "https://www.docswell.com.evil.test/s/user/KVJYJ3-title",
    "https://evil.test/?url=https://www.docswell.com/s/user/KVJYJ3-title",
    "https://evil.test/www.docswell.com/slide/KVJYJ3/embed",
    "http://www.docswell.com/s/user/KVJYJ3-title",
    "https://user:password@www.docswell.com/s/user/KVJYJ3-title",
    "https://www.docswell.com:444/s/user/KVJYJ3-title",
    "https://www.docswell.com/s/user/KVJYJ3-title/extra",
    "https://www.docswell.com/slide/KVJYJ3/embed/extra",
    "https://www.docswell.com/slide/KVJYJ3/embedmalicious",
    "https://www.docswell.com/slide/%4bVJYJ3/embed",
    "javascript:alert(1)",
  ])("rejects lookalike or noncanonical URL %s", (url) => {
    expect(parseDocswellUrl(url)).toBeNull();
    expect(
      parse(sanitizeHtml(`<iframe src="${url}"></iframe>`)).querySelector("iframe"),
    ).toBeNull();
  });

  it("only admits the exact HTTPS player path into the iframe allowlist", () => {
    expect(
      parse(sanitizeHtml(`<iframe src="${page}"></iframe>`)).querySelector("iframe"),
    ).toBeNull();
    const frame = parse(
      sanitizeHtml(`<iframe src="${embed}?redirect=https://evil.test" srcdoc="evil"></iframe>`),
    ).querySelector("iframe")!;
    expect(frame.getAttribute("src")).toBe(embed);
    expect(frame.getAttribute("srcdoc")).toBeNull();
    expect(frame.getAttribute("loading")).toBe("lazy");
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin");
  });

  it("transforms the official script declaratively in RSS and client/cache paths, idempotently", () => {
    for (const transform of [transformDocswellScriptEmbeds, applyCorePipeline, processContent]) {
      const html = transform(script);
      expect(html).not.toContain("<script");
      expect(parse(html).querySelector("iframe")?.getAttribute("src")).toBe(embed);
      expect(transform(html)).toBe(html);
    }
  });

  it.each(["</script bar>", "</script\t\n bar>", "</SCRIPT data-end='yes'>"])(
    "recognizes browser-valid attributed script closing tags: %s",
    (endTag) => {
      const html = script.replace("</script>", `ignoredPublisherCode()${endTag}`);
      const transformed = transformDocswellScriptEmbeds(html);
      expect(transformed).not.toMatch(/<script/i);
      expect(transformed).not.toContain("ignoredPublisherCode");
      expect(parse(applyCorePipeline(html)).querySelector("iframe")?.getAttribute("src")).toBe(
        embed,
      );
    },
  );

  it("does not re-form unsafe iframe markup while deduplicating the fallback player", () => {
    const nested =
      '<ifr<iframe src="https://www.youtube.com/embed/T-TuEmg8MIo"></iframe>ame src="https://evil.test/" onload="evil()"></iframe>';
    const result = extractMainContent(`<article><p>Slide summary</p>${nested}</article>`, page);
    const document = parse(result.content);
    expect(document.querySelectorAll("iframe")).toHaveLength(1);
    expect(document.querySelector("iframe")?.getAttribute("src")).toBe(embed);
    expect(result.content).not.toContain("onload");
    expect(document.querySelector("script")).toBeNull();
  });

  it("does not turn script body text or title attributes into trusted players", () => {
    const hostile = `<script title='class="docswell-embed" data-src="${embed}"'>evil()</script>`;
    expect(parse(applyCorePipeline(hostile)).querySelector("iframe")).toBeNull();
    expect(
      parse(applyCorePipeline(script.replace(embed, "https://evil.test/embed"))).querySelector(
        "iframe",
      ),
    ).toBeNull();
  });

  it("extracts ordered page text rather than related-slide recommendations", () => {
    const result = extractMainContent(
      `<html><body><h1>Test slides</h1><h2>関連スライド</h2><p>Unrelated noise</p>
      <div><h5>各ページのテキスト</h5>
      <div><a data-page="1" href="#p1" onclick="evil()">1.</a><div><p>First page &lt;script&gt;safe text&lt;/script&gt;</p></div></div>
      <div><a data-page="2" href="#p2">2.</a><div><p>Second page\nline two</p></div></div></div>
      <script>evil()</script></body></html>`,
      page,
    );
    expect(result.content).toContain("First page");
    expect(result.content).toContain("Second page");
    expect(result.content).not.toContain("Unrelated noise");
    expect(result.content).not.toContain("onclick");
    expect(parse(result.content).querySelector("script")).toBeNull();
    expect(parse(result.content).querySelectorAll("iframe")).toHaveLength(1);
    expect(parse(result.content).querySelectorAll("h3")).toHaveLength(2);
  });

  it("bounds and deduplicates transcript pages while escaping all source markup", () => {
    const makePage = (number: number, text: string) =>
      `<div><a data-page="${number}" href="#p${number}">${number}.</a><div><p>${text}</p></div></div>`;
    const html =
      makePage(2, "Second") +
      makePage(1, "First") +
      makePage(2, "Duplicate") +
      makePage(501, "Beyond limit") +
      makePage(3, "x".repeat(30_000));
    const result = extractDocswellTranscript(html, page)!;
    expect(result.indexOf("First")).toBeLessThan(result.indexOf("Second"));
    expect(result).not.toContain("Duplicate");
    expect(result).not.toContain("Beyond limit");
    expect(result).toContain("x".repeat(20_000));
    expect(result).not.toContain("x".repeat(20_001));
  });

  it("keeps a viewer plus a readable fallback when the transcript is absent", () => {
    const result = extractMainContent(
      "<html><body><article><p>Slide summary</p></article></body></html>",
      page,
    );
    expect(result.content).toContain("Slide summary");
    expect(parse(result.content).querySelectorAll("iframe")).toHaveLength(1);
    expect(result.content).toContain("Docswell で開く");
  });

  it("does not invoke site-specific extraction on a lookalike domain", () => {
    const result = extractMainContent(
      "<article><p>Ordinary article content</p></article>",
      "https://evil.test/s/user/KVJYJ3-title",
    );
    expect(result.content).not.toContain(embed);
  });
});
