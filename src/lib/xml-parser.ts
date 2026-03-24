import { XMLParser } from 'fast-xml-parser';
import { sanitizeHtml } from './html';

export interface ParsedItem {
  guid: string;
  title: string;
  link: string;
  summary: string;
  content: string;
  ogImage: string;
  author: string;
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
  // GHSA-jp2q-39xq-3w4g 対策: entity 展開制限を明示的に 200 に設定
  // (0 を指定すると falsy 判定で無制限になる脆弱性があるため非ゼロ値を使う)
  processEntities: true,
  htmlEntities: true,
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

/** RSS item / Atom entry から最初の画像 URL を取得 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractImage(item: any): string {
  // 1. media:thumbnail (直下 or media:group 内)
  const thumb = item['media:thumbnail'] ?? item['media:group']?.['media:thumbnail'];
  if (thumb?.['@_url']) return String(thumb['@_url']);
  // 配列の場合は最初の要素
  if (Array.isArray(thumb) && thumb[0]?.['@_url']) return String(thumb[0]['@_url']);

  // 2. media:content (画像タイプ、直下 or media:group 内)
  const mcRaw = item['media:content'] ?? item['media:group']?.['media:content'];
  const mcArr = Array.isArray(mcRaw) ? mcRaw : mcRaw ? [mcRaw] : [];
  for (const m of mcArr) {
    if (
      m?.['@_url'] &&
      (m['@_medium'] === 'image' || String(m['@_type'] ?? '').startsWith('image/'))
    ) {
      return String(m['@_url']);
    }
  }

  // 3. enclosure (type=image/* または URL が画像拡張子・不正 type の場合も許容)
  const enc = item.enclosure;
  if (enc?.['@_url']) {
    const encType = String(enc['@_type'] ?? '');
    const encUrl = String(enc['@_url']);
    const isAudioVideo = encType.startsWith('audio/') || encType.startsWith('video/');
    const looksLikeImage = /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(encUrl);
    if (encType.startsWith('image/') || (!isAudioVideo && looksLikeImage)) {
      return encUrl;
    }
    // Zenn など type="false" 等の不正値でも URL があれば採用
    if (encUrl && !isAudioVideo && encType !== '' && !encType.includes('/')) {
      return encUrl;
    }
  }

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
          author: stripHtml(str(item['dc:creator'] ?? item.author ?? '')).trim(),
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
          author: stripHtml(str(entry.author?.name ?? entry.author ?? feed.author?.name ?? '')).trim(),
          publishedAt: entry.published ?? entry.updated ?? null,
        };
      }),
    };
  }

  throw new Error('Unrecognized feed format');
}
