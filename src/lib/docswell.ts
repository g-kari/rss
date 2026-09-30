/** Docswell's public deck and player URLs. No publisher script or URL is executed. */
export const DOCSWELL_HOSTS = ["www.docswell.com", "docswell.com"] as const;
export const DOCSWELL_EMBED_PATH = /^\/slide\/([a-zA-Z0-9]{6})\/embed\/?$/;
const DOCSWELL_PAGE_PATH = /^\/s\/[a-zA-Z0-9_-]+\/([a-zA-Z0-9]{6})(?:-[^/]+)?\/?$/;

export interface DocswellSlide {
  id: string;
  embedUrl: string;
  pageUrl: string;
}

export function parseDocswellUrl(value: string): DocswellSlide | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !DOCSWELL_HOSTS.some((host) => host === url.hostname) ||
      url.port ||
      url.username ||
      url.password
    )
      return null;
    const match = url.pathname.match(DOCSWELL_EMBED_PATH) ?? url.pathname.match(DOCSWELL_PAGE_PATH);
    if (!match) return null;
    const embedUrl = `https://www.docswell.com/slide/${match[1]}/embed`;
    return {
      id: match[1],
      embedUrl,
      pageUrl: DOCSWELL_PAGE_PATH.test(url.pathname)
        ? `https://www.docswell.com${url.pathname}`
        : embedUrl,
    };
  } catch {
    return null;
  }
}

/** Refresh pre-feature slide extraction in the shared local cache without invalidating other articles. */
export function getSlideAwareContentCacheId(id: string, url?: string): string {
  return url && parseDocswellUrl(url) ? `docswell-v1:${id}` : id;
}
