import { parseHTML } from "linkedom/worker";
import { escapeHtml } from "./html";
import { parseDocswellUrl } from "./docswell";
import type { LDDocument } from "./linkedom-types";

/** Extract only the published page transcript, never navigation/related slides or scripts.
 * The DOM shape is from Docswell's public "各ページのテキスト" section (2026-09).
 * Output uses escaped text rather than copying publisher HTML. */
export function extractDocswellTranscript(html: string, pageUrl: string): string | null {
  if (!parseDocswellUrl(pageUrl)) return null;
  try {
    const { document } = parseHTML(html) as { document: LDDocument };
    const pages = new Map<number, string>();
    let remaining = 200_000;
    for (const link of document.querySelectorAll("a[data-page][href]")) {
      const page = Number(link.getAttribute("data-page"));
      if (!Number.isInteger(page) || page < 1 || page > 500 || pages.has(page)) continue;
      if (link.getAttribute("href") !== `#p${page}`) continue;
      const text = link.parentElement?.querySelector("p")?.textContent?.trim();
      if (!text) continue;
      const bounded = text.slice(0, Math.min(20_000, remaining));
      if (!bounded) break;
      pages.set(page, bounded);
      remaining -= bounded.length;
    }
    if (!pages.size) return null;
    return `<section class="docswell-transcript"><h2>各ページのテキスト</h2>${[...pages]
      .sort(([a], [b]) => a - b)
      .map(
        ([page, text]) =>
          `<h3>${page} ページ</h3><p style="white-space:pre-wrap">${escapeHtml(text)}</p>`,
      )
      .join("")}</section>`;
  } catch {
    return null;
  }
}
