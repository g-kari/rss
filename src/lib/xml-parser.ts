import { XMLParser } from 'fast-xml-parser';

interface ParsedItem {
  guid: string;
  title: string;
  link: string;
  summary: string;
  content: string;
  ogImage: string;
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

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, '')
    .trim();
}

function str(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'object' && '#text' in (val as object))
    return String((val as { '#text': unknown })['#text']);
  return String(val);
}

/** RSS item / Atom entry から最初の画像 URL を取得 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractImage(item: any): string {
  // 1. media:thumbnail
  const thumb = item['media:thumbnail'];
  if (thumb?.['@_url']) return String(thumb['@_url']);

  // 2. media:content (画像タイプ)
  const mc = item['media:content'];
  const mcArr = Array.isArray(mc) ? mc : mc ? [mc] : [];
  for (const m of mcArr) {
    if (
      m?.['@_url'] &&
      (m['@_medium'] === 'image' || String(m['@_type'] ?? '').startsWith('image/'))
    ) {
      return String(m['@_url']);
    }
  }

  // 3. enclosure (画像タイプ)
  const enc = item.enclosure;
  if (enc?.['@_url'] && String(enc['@_type'] ?? '').startsWith('image/'))
    return String(enc['@_url']);

  // 4. content/description 中の最初の <img>
  const html = str(item['content:encoded'] ?? item.description ?? item.content ?? item.summary ?? '');
  const m = html.match(/<img[^>]+src=["']([^"'#][^"']{4,})["']/i);
  if (m?.[1] && !m[1].startsWith('data:')) return m[1];

  return '';
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
      items: toArray(ch.item).map((item) => {
        const raw = str(item['content:encoded'] ?? item.description ?? '');
        return {
          guid: str(item.guid?.['#text'] ?? item.guid ?? item.link),
          title: stripHtml(str(item.title)),
          link: str(item.link),
          summary: stripHtml(raw).slice(0, 200),
          content: sanitizeHtml(raw),
          ogImage: extractImage(item),
          publishedAt: item.pubDate ? new Date(str(item.pubDate)).toISOString() : null,
        };
      }),
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
        const raw = str(entry.content ?? entry.summary ?? '');
        return {
          guid: str(entry.id),
          title: stripHtml(str(entry.title)),
          link:
            entryLinks.find((l) => l['@_rel'] !== 'self')?.['@_href'] ??
            entryLinks[0]?.['@_href'] ??
            '',
          summary: stripHtml(raw).slice(0, 200),
          content: sanitizeHtml(raw),
          ogImage: extractImage(entry),
          publishedAt: entry.published ?? entry.updated ?? null,
        };
      }),
    };
  }

  throw new Error('Unrecognized feed format');
}
