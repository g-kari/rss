import { XMLParser } from 'fast-xml-parser';
import { sanitizeHtml, unescapeHtml } from './html';

/** XML 属性を持つノード（fast-xml-parser の属性プレフィックス "@_" 付き） */
interface XmlAttr {
  '@_url'?: string;
  '@_medium'?: string;
  '@_type'?: string;
  '@_rel'?: string;
  '@_href'?: string;
}

/** fast-xml-parser がテキストノードをオブジェクト化した場合の形 */
type XmlTextNode = { '#text'?: string | number } | string | number | null | undefined;

/** RSS item / Atom entry の共通フィールド */
interface FeedItem {
  guid?: { '#text'?: string | number } | string;
  title?: XmlTextNode;
  link?: string | XmlAttr | XmlAttr[];
  description?: XmlTextNode;
  'content:encoded'?: XmlTextNode;
  'dc:creator'?: XmlTextNode;
  'dc:date'?: string;
  '@_rdf:about'?: string;
  author?: XmlTextNode | { name?: XmlTextNode };
  pubDate?: string;
  published?: string;
  updated?: string;
  id?: string;
  content?: XmlTextNode;
  summary?: XmlTextNode;
  enclosure?: XmlAttr;
  'media:thumbnail'?: XmlAttr | XmlAttr[];
  'media:content'?: XmlAttr | XmlAttr[];
  'media:group'?: {
    'media:thumbnail'?: XmlAttr | XmlAttr[];
    'media:content'?: XmlAttr | XmlAttr[];
  };
}

/** fast-xml-parser が返すトップレベル構造 */
interface RawParsedXml {
  rss?: {
    channel?: {
      title?: XmlTextNode;
      link?: string;
      item?: FeedItem | FeedItem[];
    };
  };
  feed?: {
    title?: XmlTextNode;
    link?: XmlAttr | XmlAttr[];
    entry?: FeedItem | FeedItem[];
    author?: { name?: XmlTextNode };
  };
  /** RSS 1.0 / RDF Site Summary */
  'rdf:RDF'?: {
    channel?: {
      title?: XmlTextNode;
      link?: string;
    };
    item?: FeedItem | FeedItem[];
  };
}

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
  // GHSA-jp2q-39xq-3w4g (entity 展開 DoS) は fast-xml-parser v4.2.4 以降で修正済み。
  // v5.x では processEntities オブジェクト形式で制限値を個別に設定できる。
  //
  // デフォルト maxTotalExpansions=1000 では HTML エンティティ（&amp; 等）を多用する
  // フィード（例: 記事本文が長い技術ブログ）で "Entity expansion limit exceeded" が発生する。
  // XMLボム攻撃（Billion Laughs）は maxExpansionDepth=10 と maxEntityCount=100 で防ぐ。
  // freee blog など 10000 超のフィードに対応するため 100000 に引き上げる。
  processEntities: {
    enabled: true,
    maxTotalExpansions: 100000,
    maxEntitySize: 10000,
    maxExpansionDepth: 10,
    maxExpandedLength: 500000,
    maxEntityCount: 100,
  },
  htmlEntities: true,
  // デフォルト 100 では深いネスト構造を持つ HTML コンテンツ埋め込みフィードで
  // "Maximum nested tags exceeded" が発生する（例: nlab.itmedia.co.jp）
  maxNestedTags: 500,
});

function toArray<T>(val: T | T[] | undefined): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * 日付文字列を ISO 8601 形式に変換する。
 * `new Date().toISOString()` は Invalid Date に対して RangeError を投げるため、
 * NaN チェックを挟んで不正な日付文字列は null を返す。
 */
function parseDate(s: string | undefined | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function str(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'object' && '#text' in (val as object))
    return String((val as { '#text': unknown })['#text']);
  return String(val);
}

/** author フィールドから表示名を取得する（Atom の author.name / RSS の dc:creator 両対応） */
function authorStr(author: FeedItem['author']): string {
  if (!author) return '';
  if (typeof author === 'object' && author !== null && 'name' in author) {
    return str((author as { name?: unknown }).name);
  }
  return str(author);
}

/** XmlAttr または XmlAttr[] から最初の @_url を取得する */
function firstAttrUrl(val: XmlAttr | XmlAttr[] | undefined): string {
  if (!val) return '';
  const first = Array.isArray(val) ? val[0] : val;
  return first?.['@_url'] ? String(first['@_url']) : '';
}

/** RSS item / Atom entry から最初の画像 URL を取得 */
function extractImage(item: FeedItem): string {
  // 1. media:thumbnail (直下 or media:group 内)
  const thumb = item['media:thumbnail'] ?? item['media:group']?.['media:thumbnail'];
  const thumbUrl = firstAttrUrl(thumb);
  if (thumbUrl) return thumbUrl;

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
  if (m?.[1] && !m[1].startsWith('data:')) return unescapeHtml(m[1]);

  return '';
}

export function parseFeed(xml: string): ParsedFeed {
  const parsed = parser.parse(xml) as RawParsedXml;

  // RSS 2.0
  if (parsed?.rss?.channel) {
    const ch = parsed.rss.channel;
    return {
      title: stripHtml(str(ch.title)),
      siteUrl: str(ch.link),
      items: toArray(ch.item).map((item) => {
        const raw = str(item['content:encoded'] ?? item.description ?? '');
        return {
          guid: str(item.guid ?? item.link),
          title: stripHtml(str(item.title)),
          link: str(item.link),
          summary: stripHtml(raw).slice(0, 200),
          content: sanitizeHtml(raw),
          ogImage: extractImage(item),
          author: stripHtml(str(item['dc:creator']) || authorStr(item.author)).trim(),
          publishedAt: parseDate(str(item.pubDate) || null),
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
        // Atom の link は isArray 設定により常に XmlAttr[] になる
        const entryLinks = toArray<XmlAttr>(entry.link as XmlAttr | XmlAttr[] | undefined);
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
          author: stripHtml(authorStr(entry.author) || authorStr(feed.author)).trim(),
          publishedAt: entry.published ?? entry.updated ?? null,
        };
      }),
    };
  }

  // RSS 1.0 / RDF Site Summary
  // <rdf:RDF> がルートで、<channel> と <item> が兄弟要素として並ぶ形式
  if (parsed?.['rdf:RDF']) {
    const rdf = parsed['rdf:RDF'];
    return {
      title: stripHtml(str(rdf.channel?.title)),
      siteUrl: str(rdf.channel?.link),
      items: toArray(rdf.item).map((item) => {
        const raw = str(item['content:encoded'] ?? item.description ?? '');
        // RSS 1.0 は guid がなく rdf:about 属性が識別子を兼ねる
        const guid = str(item.guid ?? item['@_rdf:about'] ?? item.link);
        return {
          guid,
          title: stripHtml(str(item.title)),
          link: str(item.link) || str(item['@_rdf:about']),
          summary: stripHtml(raw).slice(0, 200),
          content: sanitizeHtml(raw),
          ogImage: extractImage(item),
          author: stripHtml(str(item['dc:creator']) || authorStr(item.author)).trim(),
          // RSS 1.0 は pubDate がなく dc:date （ISO 8601）を使う
          publishedAt: parseDate(str(item.pubDate) || null) ?? parseDate(item['dc:date'] ?? null),
        };
      }),
    };
  }

  throw new Error('Unrecognized feed format');
}
