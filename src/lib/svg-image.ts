import { DOMParser } from "linkedom/worker";
import { XMLValidator } from "fast-xml-parser";
import { escapeHtml } from "./html";

interface ParsedNode {
  nodeType: number;
  textContent: string | null;
}
// linkedom has array-based collections rather than browser NodeList objects.
interface ParsedElement extends ParsedNode {
  tagName: string;
  getAttribute(name: string): string | null;
  attributes: Iterable<{ name: string; value: string }>;
  querySelectorAll(selector: string): Iterable<ParsedElement>;
  childNodes: Iterable<ParsedNode>;
}

/** External SVGs are rebuilt as a small static image subset, never passed through. */
export const MAX_SVG_BYTES = 512 * 1024;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const MAX_NODES = 5000;
const MAX_DEPTH = 64;
const MAX_STYLE_SELECTORS = 256;
const MAX_ATTRIBUTE_CHARS = 64 * 1024;
const MAX_PRESENTATION_CHARS = 1024;
const TAGS = new Set([
  "svg",
  "g",
  "defs",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "title",
  "desc",
  "clipPath",
  "mask",
  "linearGradient",
  "radialGradient",
  "stop",
  "symbol",
]);
const ATTRIBUTES = new Set([
  "id",
  "viewBox",
  "preserveAspectRatio",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "width",
  "height",
  "d",
  "points",
  "transform",
  "pathLength",
  "dx",
  "dy",
  "gradientTransform",
  "gradientUnits",
  "spreadMethod",
  "fx",
  "fy",
  "fr",
  "offset",
  "clipPathUnits",
  "maskUnits",
  "maskContentUnits",
  "textLength",
  "lengthAdjust",
]);
const PRESENTATION = new Set([
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "opacity",
  "color",
  "clip-path",
  "clip-rule",
  "mask",
  "stop-color",
  "stop-opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
  "dominant-baseline",
  "alignment-baseline",
  "letter-spacing",
  "word-spacing",
  "vector-effect",
  "paint-order",
]);

function parseSvg(bytes: Uint8Array): ParsedElement | null {
  if (bytes.byteLength > MAX_SVG_BYTES) return null;
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
  } catch {
    return null;
  }
  // No DTD, entities, or processing instructions. The optional XML declaration
  // has no effect on the canonical UTF-8 output.
  source = source.replace(/^<\?xml\s[^?]*\?>\s*/i, "");
  // Bound DOM allocation before parsing, including unsupported nodes. Counting
  // all markup markers is deliberately conservative (comments/CDATA included).
  let marker = -1;
  let markers = 0;
  while ((marker = source.indexOf("<", marker + 1)) !== -1) {
    if (++markers > MAX_NODES * 2) return null;
  }
  try {
    if (/<!DOCTYPE|<!ENTITY|<\?/i.test(source) || XMLValidator.validate(source) !== true)
      return null;
    const root = new DOMParser().parseFromString(source, "image/svg+xml")
      .documentElement as ParsedElement;
    if (!root || root.tagName !== "svg") return null;
    const namespace = root.getAttribute("xmlns");
    if (namespace && namespace !== SVG_NAMESPACE) return null;
    return root;
  } catch {
    return null;
  }
}

export function isSvgImage(bytes: Uint8Array): boolean {
  return parseSvg(bytes) !== null;
}

function safePresentation(value: string): boolean {
  if (value.length > MAX_PRESENTATION_CHARS) return false;
  // No escapes, quotes, @rules, URLs, variables, or CSS declarations can cross
  // this boundary. Local paint/clip references are the one supported URL form.
  if (/url\s*\(/i.test(value)) return /^url\(\s*#[\w.-]+\s*\)$/.test(value);
  return /^[\w\s.,%()+#-]+$/.test(value) && !/var\s*\(|expression\s*\(/i.test(value);
}

function readDeclarations(css: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const declaration of css.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    const name = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim();
    if (PRESENTATION.has(name) && safePresentation(value)) result.set(name, value);
  }
  return result;
}

/**
 * Rebuild only static geometry/text and local references. Simple .class rules
 * and inline presentation styles become attributes; no CSS or active nodes are
 * emitted. Unsupported effects/animation, external raster/font assets, and
 * use-instance expansion are omitted. Oversized, malformed, or too-complex
 * SVG fails closed.
 */
export function sanitizeSvgImage(bytes: Uint8Array): Uint8Array<ArrayBuffer> | null {
  const root = parseSvg(bytes);
  if (!root) return null;
  // Index each class's final declarations once. Source order is retained so an
  // element's class attribute order cannot reverse CSS's last-rule precedence.
  const classRules = new Map<string, Map<string, { value: string; order: number }>>();
  let selectorCount = 0;
  let ruleOrder = 0;
  for (const style of root.querySelectorAll("style")) {
    const source = style.textContent ?? "";
    // Linear scans only: an unclosed comment or a style with no opening brace
    // must not repeatedly backtrack across the whole (up to 512 KiB) input.
    const parts: string[] = [];
    let cursor = 0;
    while (cursor < source.length) {
      const start = source.indexOf("/*", cursor);
      if (start < 0) {
        parts.push(source.slice(cursor));
        break;
      }
      parts.push(source.slice(cursor, start));
      const end = source.indexOf("*/", start + 2);
      if (end < 0) break;
      cursor = end + 2;
    }
    const css = parts.join("");
    cursor = 0;
    while (cursor < css.length) {
      const open = css.indexOf("{", cursor);
      if (open < 0) break;
      const close = css.indexOf("}", open + 1);
      if (close < 0) break;
      const names = css.slice(cursor, open).split(",", MAX_STYLE_SELECTORS + 1);
      const declarations = css.slice(open + 1, close);
      cursor = close + 1;
      selectorCount += names.length;
      if (selectorCount > MAX_STYLE_SELECTORS) return null;
      const normalizedNames = names.map((name) => name.trim());
      if (!normalizedNames.every((name) => /^\.[\w-]+$/.test(name))) continue;
      const parsed = readDeclarations(declarations);
      for (const name of normalizedNames) {
        const className = name.slice(1);
        const current =
          classRules.get(className) ?? new Map<string, { value: string; order: number }>();
        for (const [key, value] of parsed) current.set(key, { value, order: ruleOrder });
        classRules.set(className, current);
      }
      ruleOrder++;
    }
  }
  let nodes = 0;
  let remainingBytes = MAX_SVG_BYTES;
  const output: string[] = [];
  const encoder = new TextEncoder();
  function emit(part: string): void {
    // The code-unit check is a lower bound and happens before allocating bytes.
    if (part.length > remainingBytes) throw new Error("SVG output limit");
    const bytes = encoder.encode(part).byteLength;
    if (bytes > remainingBytes) throw new Error("SVG output limit");
    remainingBytes -= bytes;
    output.push(part);
  }
  function emitEscaped(value: string): void {
    if (value.length > remainingBytes) throw new Error("SVG output limit");
    emit(escapeHtml(value));
  }
  function render(element: ParsedElement, depth: number): void {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) throw new Error("SVG complexity limit");
    const name = element.tagName;
    if (!TAGS.has(name)) return;
    if (element.getAttribute("xmlns") && element.getAttribute("xmlns") !== SVG_NAMESPACE) return;
    const attributes = new Map<string, string>();
    if (depth === 0) attributes.set("xmlns", SVG_NAMESPACE);
    for (const attr of Array.from(element.attributes)) {
      if (ATTRIBUTES.has(attr.name)) {
        if (attr.value.length > MAX_ATTRIBUTE_CHARS) throw new Error("SVG attribute limit");
        attributes.set(attr.name, attr.value);
      } else if (PRESENTATION.has(attr.name) && safePresentation(attr.value))
        attributes.set(attr.name, attr.value);
      else if (
        (attr.name === "href" || attr.name === "xlink:href") &&
        /^(?:linearGradient|radialGradient)$/.test(name) &&
        /^#[\w.-]+$/.test(attr.value)
      ) {
        attributes.set("href", attr.value);
      }
    }
    const classes = new Set((element.getAttribute("class") ?? "").split(/\s+/));
    const matched = new Map<string, { value: string; order: number }>();
    for (const className of classes) {
      for (const [key, declaration] of classRules.get(className) ?? []) {
        if (!matched.has(key) || declaration.order > matched.get(key)!.order) {
          matched.set(key, declaration);
        }
      }
    }
    for (const [key, declaration] of matched) attributes.set(key, declaration.value);
    for (const [key, value] of readDeclarations(element.getAttribute("style") ?? ""))
      attributes.set(key, value);
    emit(`<${name}`);
    for (const [key, value] of attributes) {
      emit(` ${key}="`);
      emitEscaped(value);
      emit('"');
    }
    emit(">");
    for (const node of element.childNodes) {
      if (node.nodeType === 1) render(node as ParsedElement, depth + 1);
      else if (node.nodeType === 3 || node.nodeType === 4) emitEscaped(node.textContent ?? "");
    }
    emit(`</${name}>`);
  }
  try {
    render(root, 0);
    // All chunks have already consumed the bounded UTF-8 output budget.
    return encoder.encode(output.join(""));
  } catch {
    return null;
  }
}

export const SVG_IMAGE_RESPONSE_HEADERS = {
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Content-Disposition": 'inline; filename="image.svg"',
};
