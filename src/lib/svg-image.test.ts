// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isSvgImage, MAX_SVG_BYTES, sanitizeSvgImage } from "./svg-image";

const encode = (source: string) => new TextEncoder().encode(source);
const sanitize = (source: string) => {
  const result = sanitizeSvgImage(encode(source));
  return result === null ? null : new TextDecoder().decode(result);
};

describe("static SVG image reconstruction", () => {
  it("preserves paths, text, local gradients, clipping, and simple presentation styles", () => {
    const clean = sanitize(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
      <style>.logo { fill: red; stroke-width: 2 } .text { font-size: 18px }</style>
      <defs><linearGradient id="g"><stop offset="0%" stop-color="blue"/></linearGradient>
      <clipPath id="c"><rect width="100" height="100"/></clipPath></defs>
      <path class="logo" d="M 0 0 L 100 100" style="stroke: blue"/>
      <rect fill="url(#g)" clip-path="url(#c)" width="100" height="100"/>
      <text class="text" x="10" y="40">A &amp; B &lt; C</text></svg>`)!;
    expect(clean).toContain('viewBox="0 0 200 100"');
    expect(clean).toContain('fill="url(#g)"');
    expect(clean).toContain('clip-path="url(#c)"');
    expect(clean).toContain('<path d="M 0 0 L 100 100" fill="red" stroke-width="2" stroke="blue">');
    expect(clean).toContain('font-size="18px"');
    expect(clean).toContain("A &amp; B &lt; C");
    expect(clean).not.toMatch(/<style|class=|style=/);
    expect(sanitize(clean)).toBe(clean);
  });

  it("drops scripts, event handlers, foreign objects, animations, links and external resources", () => {
    const clean =
      sanitize(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" onload="alert(1)">
      <script>alert(1)</script><foreignObject><iframe src="https://evil.example/x"/></foreignObject>
      <image href="https://evil.example/image"/><a href="javascript:alert(1)"><text>click</text></a>
      <use href="https://evil.example/sprite#x"/><use xlink:href="#safe"/>
      <animate attributeName="href" values="javascript:alert(1)"/>
      <rect onclick="alert(1)" fill="url(https://evil.example/paint)" style="filter:url(https://evil.example/f);fill:var(--bad);stroke:red"/>
      <text>&lt;script&gt;not executable&lt;/script&gt;</text>
    </svg>`)!;
    expect(clean).not.toMatch(
      /<script|foreignObject|iframe|<image|<a\b|<animate|onload|onclick|evil\.example|javascript:|var\(|filter=/,
    );
    expect(clean).not.toContain("<use");
    expect(clean).toContain('stroke="red"');
    expect(clean).toContain("&lt;script&gt;not executable&lt;/script&gt;");
  });

  it.each([
    '<!DOCTYPE svg [<!ENTITY x "boom">]><svg><text>&x;</text></svg>',
    '<?xml-stylesheet href="https://evil.example/a.css"?><svg/>',
    "<html><svg/></html>",
    '<svg xmlns="http://www.w3.org/1999/xhtml"/>',
    "<svg><script></svg>",
    '<svg width="1" width="2"/>',
  ])("rejects malformed or non-SVG input %s", (source) => {
    expect(isSvgImage(encode(source))).toBe(false);
    expect(sanitize(source)).toBeNull();
  });

  it("accepts an XML declaration but emits a canonical UTF-8 SVG document", () => {
    expect(sanitize('<?xml version="1.0" encoding="UTF-8"?><svg><path d="M0 0"/></svg>')).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"></path></svg>',
    );
  });

  it("rejects oversized, deeply nested, and excessive-node inputs", () => {
    expect(sanitize(`<svg>${" ".repeat(MAX_SVG_BYTES)}</svg>`)).toBeNull();
    expect(sanitize(`<svg>${"<g>".repeat(70)}${"</g>".repeat(70)}</svg>`)).toBeNull();
    expect(sanitize(`<svg>${"<path/>".repeat(5001)}</svg>`)).toBeNull();
    const tooManyElements = `<svg>${"<g/>".repeat(10000)}</svg>`;
    expect(encode(tooManyElements).byteLength).toBeLessThan(MAX_SVG_BYTES);
    expect(isSvgImage(encode(tooManyElements))).toBe(false);
    expect(sanitize(tooManyElements)).toBeNull();
  });

  it("handles a large malformed stylesheet without backtracking and caps rule complexity", () => {
    expect(
      sanitize(`<svg><style>${"x".repeat(MAX_SVG_BYTES - 100)}</style><path d="M0 0"/></svg>`),
    ).toContain('<path d="M0 0">');
    expect(sanitize(`<svg><style>${"/*".repeat(10000)}</style><path d="M0 0"/></svg>`)).toContain(
      '<path d="M0 0">',
    );
    expect(sanitize(`<svg><style>${".a { fill: red }".repeat(257)}</style></svg>`)).toBeNull();
  });

  it("rejects selector amplification below the byte and node caps, including across stylesheets", () => {
    const source = `<svg><style>${".a,".repeat(99999)}.a{fill:red}</style>${'<path d="M0 0"/>'.repeat(4998)}</svg>`;
    expect(encode(source).byteLength).toBeLessThan(MAX_SVG_BYTES);
    expect(sanitize(source)).toBeNull();
    expect(
      sanitize(
        `<svg><style>${".a,".repeat(127)}.a{fill:red}</style><style>${".b,".repeat(128)}.b{fill:blue}</style></svg>`,
      ),
    ).toBeNull();
  });

  it("indexes class declarations without changing CSS source-order or inline-style precedence", () => {
    const source =
      '<svg><style>.a {fill:red;stroke:black}.b {fill:blue}.a {stroke:green}</style><path class="b a" d="M0 0"/><path class="a b" d="M0 0" style="fill:white"/></svg>';
    const clean = sanitize(source)!;
    expect(clean).toContain('<path d="M0 0" fill="blue" stroke="green">');
    expect(clean).toContain('<path d="M0 0" fill="white" stroke="green">');
  });

  it("bounds output before materializing repeated class declarations or oversized attributes", () => {
    const oversizedValue = `<svg><style>.a{font-family:${"x".repeat(50000)}}</style>${'<text class="a">X</text>'.repeat(1000)}</svg>`;
    const withoutOversizedStyle = sanitize(oversizedValue)!;
    expect(withoutOversizedStyle).not.toContain("font-family");
    expect(encode(withoutOversizedStyle).byteLength).toBeLessThan(MAX_SVG_BYTES);
    const amplified = `<svg><style>.a{font-family:${"x".repeat(1000)}}</style>${'<text class="a">X</text>'.repeat(1000)}</svg>`;
    expect(encode(amplified).byteLength).toBeLessThan(MAX_SVG_BYTES);
    expect(sanitize(amplified)).toBeNull();
    expect(sanitize(`<svg><path d="${"x".repeat(64 * 1024 + 1)}"/></svg>`)).toBeNull();
  });
});
