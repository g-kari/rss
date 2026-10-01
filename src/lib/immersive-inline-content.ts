import { parseHTML } from "linkedom";
import { sanitizeHtml } from "./html";
/** Inline reading never imports a publisher's native-media autoplay preference. */
export function prepareImmersiveInlineContent(html: string): string {
  const safe = sanitizeHtml(html);
  if (!/<(?:video|audio|iframe)\b/i.test(safe)) return safe;
  const { document } = parseHTML(`<html><body>${safe}</body></html>`);
  for (const media of document.querySelectorAll("video, audio")) {
    media.removeAttribute("autoplay");
    media.setAttribute("controls", "");
  }
  for (const frame of document.querySelectorAll("iframe")) {
    const permissions = (frame.getAttribute("allow") || "")
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part && !/^autoplay(?:\s|$)/i.test(part));
    frame.setAttribute("allow", permissions.join("; "));
  }
  return sanitizeHtml(document.body.innerHTML);
}
