import { getSlideAwareContentCacheId, parseDocswellUrl } from "./docswell";

export type SlideProvider = "docswell" | "speakerdeck" | "slideshare" | "google-slides";
export interface SlideEmbed {
  provider: SlideProvider;
  label: string;
  embedUrl: string;
  pageUrl: string;
}
export const SPEAKERDECK_EMBED_PATH = /^\/player\/([a-fA-F0-9]{1,64})\/?$/;
export const SLIDESHARE_EMBED_PATH =
  /^\/slideshow\/embed_code\/(?:key\/[a-zA-Z0-9]{1,64}|[0-9]{1,20})\/?$/;
export const GOOGLE_SLIDES_EMBED_PATH =
  /^\/presentation\/d\/e\/(2PACX-[a-zA-Z0-9_-]{10,200})\/(?:embed|pubembed)\/?$/;
const GOOGLE_SLIDES_PUBLISHED_PATH =
  /^\/presentation\/d\/e\/(2PACX-[a-zA-Z0-9_-]{10,200})\/(?:pub|embed|pubembed)\/?$/;
const SLIDESHARE_PAGE_PATH = /^\/slideshow\/[^/]+\/([0-9]{1,20})\/?$/;
const PUBLIC_DECK_PATH = /^\/[a-zA-Z0-9_-]+\/[^/]+\/?$/;
const LABELS: Record<SlideProvider, string> = {
  docswell: "Docswell",
  speakerdeck: "Speaker Deck",
  slideshare: "SlideShare",
  "google-slides": "Google Slides",
};

function safeUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port ? url : null;
  } catch {
    return null;
  }
}

/** Only known player endpoints or published deck URLs; ordinary Google editor/share URLs are excluded. */
export function parseSlideUrl(value: string): SlideEmbed | null {
  const docswell = parseDocswellUrl(value);
  if (docswell) return { ...docswell, provider: "docswell", label: LABELS.docswell };
  const url = safeUrl(value);
  if (!url) return null;
  let provider: SlideProvider;
  let embedUrl: string;
  let pageUrl = `${url.origin}${url.pathname}`;
  if (url.hostname === "speakerdeck.com" && SPEAKERDECK_EMBED_PATH.test(url.pathname)) {
    provider = "speakerdeck";
    embedUrl = `https://speakerdeck.com${url.pathname.replace(/\/$/, "")}`;
    const slide = url.searchParams.get("slide");
    if (slide && /^[1-9][0-9]{0,3}$/.test(slide)) embedUrl += `?slide=${slide}`;
  } else if (["www.slideshare.net", "slideshare.net"].includes(url.hostname)) {
    provider = "slideshare";
    if (SLIDESHARE_EMBED_PATH.test(url.pathname)) {
      embedUrl = `https://www.slideshare.net${url.pathname.replace(/\/$/, "")}`;
    } else {
      const match = url.pathname.match(SLIDESHARE_PAGE_PATH);
      if (!match) return null;
      embedUrl = `https://www.slideshare.net/slideshow/embed_code/${match[1]}`;
    }
  } else if (url.hostname === "docs.google.com") {
    const match = url.pathname.match(GOOGLE_SLIDES_PUBLISHED_PATH);
    if (!match) return null;
    provider = "google-slides";
    const base = `https://docs.google.com/presentation/d/e/${match[1]}`;
    embedUrl = `${base}/pubembed?start=false&loop=false&delayms=3000`;
    pageUrl = `${base}/pub?start=false&loop=false&delayms=3000`;
  } else return null;
  return { provider, label: LABELS[provider], embedUrl, pageUrl };
}

/** Some public pages need their published HTML metadata to resolve a player ID. */
export function getSlidePageProvider(value: string): SlideProvider | null {
  const direct = parseSlideUrl(value);
  if (direct) return direct.provider;
  const url = safeUrl(value);
  if (!url || !PUBLIC_DECK_PATH.test(url.pathname)) return null;
  if (url.hostname === "speakerdeck.com" && !/^\/(player|features|help)\//.test(url.pathname))
    return "speakerdeck";
  if (
    ["www.slideshare.net", "slideshare.net"].includes(url.hostname) &&
    !/^\/(slideshow|settings|login)\//.test(url.pathname)
  )
    return "slideshare";
  return null;
}

export function getSlideSourceUrl(value: string): string | null {
  if (!getSlidePageProvider(value)) return null;
  const direct = parseSlideUrl(value);
  if (direct) return direct.pageUrl;
  const url = safeUrl(value)!;
  return `${url.origin}${url.pathname}`;
}

/** Keep the already shipped Docswell namespace; refresh only newly supported providers. */
export function getProviderContentCacheId(id: string, url?: string): string {
  const provider = url ? getSlidePageProvider(url) : null;
  if (provider === "docswell") return getSlideAwareContentCacheId(id, url);
  return provider ? `slides-v1:${id}` : id;
}
