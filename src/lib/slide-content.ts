import { parseHTML } from "linkedom/worker";
import { escapeHtml } from "./html";
import {
  getSlidePageProvider,
  getSlideSourceUrl,
  parseSlideUrl,
  type SlideEmbed,
} from "./slide-providers";
import type { LDDocument } from "./linkedom-types";

/** Resolve only metadata/frames published on a matching provider's public page. Never runs scripts. */
export function resolveSlideEmbed(pageUrl: string, html?: string | null): SlideEmbed | null {
  const provider = getSlidePageProvider(pageUrl);
  if (!provider) return null;
  const sourceUrl = getSlideSourceUrl(pageUrl)!;
  if (html && (provider === "speakerdeck" || provider === "slideshare")) {
    try {
      const { document } = parseHTML(html) as { document: LDDocument };
      for (const element of document.querySelectorAll(
        'meta[property="og:video"], meta[name="twitter:player"], .speakerdeck-embed[data-id], iframe[src]',
      )) {
        const id = provider === "speakerdeck" ? element.getAttribute("data-id") : null;
        const value =
          id && /^[a-fA-F0-9]{1,64}$/.test(id)
            ? `https://speakerdeck.com/player/${id}`
            : (element.getAttribute("content") ?? element.getAttribute("src") ?? "");
        const slide = parseSlideUrl(value);
        if (slide?.provider === provider) return { ...slide, pageUrl: sourceUrl };
      }
    } catch {
      /* A missing/changed provider document still gets the direct-link fallback. */
    }
  }
  return parseSlideUrl(pageUrl);
}

/** Public transcript selectors only. No recommendations, scripts, private APIs, OCR, or downloads. */
export function extractProviderSlideContent(html: string, pageUrl: string): string | null {
  const slide = resolveSlideEmbed(pageUrl, html);
  if (!slide || slide.provider === "docswell") return null;
  let transcript = "";
  let description = "";
  try {
    const { document } = parseHTML(html) as { document: LDDocument };
    for (const meta of document.querySelectorAll('meta[name="description"]')) {
      description = (meta.getAttribute("content") ?? "").trim().slice(0, 10_000);
      break;
    }
    const selector =
      slide.provider === "speakerdeck"
        ? "#transcript .slide-transcript"
        : slide.provider === "slideshare"
          ? ".transcript > div > ul > li, .transcript > ul > li, .transcript > ol > li, .slideshow-transcript > ol > li"
          : "";
    if (selector) {
      let remaining = 200_000;
      let page = 0;
      for (const element of document.querySelectorAll(selector)) {
        if (page >= 500 || remaining <= 0) break;
        const text = element.textContent?.trim().slice(0, Math.min(20_000, remaining)) ?? "";
        page++;
        if (!text) continue;
        remaining -= text.length;
        transcript += `<h3>${page} ページ</h3><p style="white-space:pre-wrap">${escapeHtml(text)}</p>`;
      }
    }
  } catch {
    /* Keep the viewer and source link when the transcript is unavailable. */
  }
  return (
    `<iframe src="${escapeHtml(slide.embedUrl)}" title="${slide.label} スライド" loading="lazy" sandbox="allow-scripts allow-same-origin" allow="fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" style="border:0;width:100%;height:auto;aspect-ratio:16/10;max-height:80dvh"></iframe>` +
    `<p><a href="${escapeHtml(slide.pageUrl)}" target="_blank" rel="noopener noreferrer">${slide.label} で開く ↗</a></p>` +
    (description ? `<p>${escapeHtml(description)}</p>` : "") +
    (transcript
      ? `<section class="slide-transcript"><h2>各ページのテキスト</h2>${transcript}</section>`
      : "<p>このスライドの本文テキストは配信元で公開されていないか、取得できませんでした。プレイヤーまたは元ページでご覧ください。</p>")
  );
}
