import { XMLParser } from 'fast-xml-parser';

interface ParsedItem {
  guid: string;
  title: string;
  link: string;
  summary: string;
  publishedAt: string | null;
}

export interface ParsedFeed {
  title: string;
  siteUrl: string;
  items: ParsedItem[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['item', 'entry', 'link'].includes(name),
});

function toArray<T>(val: T | T[] | undefined): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

function str(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'object' && '#text' in (val as object))
    return String((val as { '#text': unknown })['#text']);
  return String(val);
}

export function parseFeed(xml: string): ParsedFeed {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed: any = parser.parse(xml);

  // RSS 2.0
  if (parsed?.rss?.channel) {
    const ch = parsed.rss.channel;
    return {
      title: stripHtml(str(ch.title)),
      siteUrl: str(ch.link),
      items: toArray(ch.item).map((item) => ({
        guid: str(item.guid?.['#text'] ?? item.guid ?? item.link),
        title: stripHtml(str(item.title)),
        link: str(item.link),
        summary: stripHtml(str(item.description)).slice(0, 500),
        publishedAt: item.pubDate ? new Date(str(item.pubDate)).toISOString() : null,
      })),
    };
  }

  // Atom
  if (parsed?.feed) {
    const feed = parsed.feed;
    const feedLinks = toArray<{ '@_rel'?: string; '@_href'?: string }>(feed.link);
    return {
      title: stripHtml(str(feed.title)),
      siteUrl: feedLinks.find((l) => l['@_rel'] !== 'self')?.['@_href'] ?? '',
      items: toArray(feed.entry).map((entry) => {
        const entryLinks = toArray<{ '@_rel'?: string; '@_href'?: string }>(entry.link);
        return {
          guid: str(entry.id),
          title: stripHtml(str(entry.title)),
          link:
            entryLinks.find((l) => l['@_rel'] !== 'self')?.['@_href'] ??
            entryLinks[0]?.['@_href'] ??
            '',
          summary: stripHtml(str(entry.summary ?? entry.content)).slice(0, 500),
          publishedAt: entry.published ?? entry.updated ?? null,
        };
      }),
    };
  }

  throw new Error('Unrecognized feed format');
}
