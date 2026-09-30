// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DOMParser } from "linkedom/worker";
import { processContent } from "./embed-utils";
import { sanitizeHtml } from "./html";

// Observed at https://panora.tokyo/archives/156910 (the user's blank NAMED embed).
const lazyIframe =
  '<iframe title="NAMED - 松永依織 (Official MV)" width="840" height="473" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen="" data-src="https://www.youtube.com/embed/T-TuEmg8MIo?feature=oembed" class="lazyload" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="></iframe>';
const frame = (html: string) =>
  new DOMParser().parseFromString(html, "text/html").querySelector("iframe");

describe("trusted lazy iframe normalization", () => {
  it("promotes the observed trusted data-src so the browser loads YouTube instead of a GIF", () => {
    const result = processContent(lazyIframe);
    const iframe = frame(result)!;
    expect(iframe.getAttribute("src")).toContain("https://www.youtube.com/embed/T-TuEmg8MIo?");
    expect(iframe.getAttribute("src")).toContain("origin=https%3A%2F%2Frss.0g0.xyz");
    expect(iframe.getAttribute("data-src")).toBeNull();
    expect(iframe.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
    expect(iframe.style.position).toBe("absolute");
    expect(result).toContain("YouTube で見る");
  });

  it.each(["", ' src="about:blank"', ' src="data:image/gif;base64,AA=="'])(
    "recovers missing/placeholder src %s before server-side sanitizing",
    (placeholder) => {
      const html = `<iframe data-src='//www.youtube.com/embed/T-TuEmg8MIo'${placeholder}></iframe>`;
      const result = sanitizeHtml(html);
      expect(frame(result)?.getAttribute("src")).toBe("https://www.youtube.com/embed/T-TuEmg8MIo");
      expect(sanitizeHtml(result)).toBe(result);
    },
  );

  it.each([
    '<iframe data-src="https://www.youtube.com/embed/T-TuEmg8MIo" src="https://evil.example/"></iframe>',
    '<iframe title="src=https://www.youtube.com/embed/T-TuEmg8MIo" src="https://evil.example/"></iframe>',
    '<iframe src="data:text/html,evil" data-src="https://www.youtube.com/embed/T-TuEmg8MIo"></iframe>',
    '<iframe data-src="https://evil.example/?youtube.com/embed/T-TuEmg8MIo"></iframe>',
    '<iframe data-src="javascript:alert(1)"></iframe>',
  ])("does not let data-src or quoted lookalikes authorize an untrusted frame", (html) => {
    expect(frame(sanitizeHtml(html))).toBeNull();
  });

  it("rebuilds a single trusted src without srcdoc or stale layout/referrer attributes", () => {
    const result = processContent(
      '<iframe src="https://www.youtube.com/embed/T-TuEmg8MIo?start=20&amp;origin=https://old.example" srcdoc="&lt;script&gt;evil&lt;/script&gt;" style="display:none;height:0" referrerpolicy="no-referrer"></iframe>',
    );
    const iframe = frame(result)!;
    expect(iframe.getAttribute("srcdoc")).toBeNull();
    const src = new URL(iframe.getAttribute("src")!);
    expect(src.searchParams.getAll("origin")).toEqual(["https://rss.0g0.xyz"]);
    expect(src.searchParams.get("start")).toBe("20");
    expect(iframe.style.display).not.toBe("none");
    expect(iframe.style.height).toBe("100%");
    expect(iframe.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
  });
});
