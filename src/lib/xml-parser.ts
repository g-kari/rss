import { XMLParser } from "fast-xml-parser";
import { unescapeHtml, stripHtml, stripHtmlWithBreaks } from "./html";
import { applyCorePipeline } from "./html-post-processor";
import { isAbsoluteHttpUrl } from "./url";

/** XML 属性を持つノード（fast-xml-parser の属性プレフィックス "@_" 付き） */
interface XmlAttr {
  "@_url"?: string;
  "@_medium"?: string;
  "@_type"?: string;
  "@_rel"?: string;
  "@_href"?: string;
}

/** fast-xml-parser がテキストノードをオブジェクト化した場合の形 */
type XmlTextNode = { "#text"?: string | number } | string | number | null | undefined;

/** RSS / Atom の著者ノード（Atom person construct またはRSSテキスト） */
type FeedAuthor = XmlTextNode | { name?: XmlTextNode };

/** RSS 2.0 guid ノード（isPermaLink 省略時は仕様上 true） */
interface RssGuid {
  "#text"?: string | number;
  "@_isPermaLink"?: string;
}

/** RSS item / Atom entry の共通フィールド */
interface FeedItem {
  guid?: RssGuid | string;
  title?: XmlTextNode;
  link?: string | XmlAttr | XmlAttr[];
  description?: XmlTextNode;
  "content:encoded"?: XmlTextNode;
  "dc:creator"?: XmlTextNode;
  "dc:date"?: string;
  "@_rdf:about"?: string;
  author?: FeedAuthor | FeedAuthor[];
  pubDate?: string;
  published?: string;
  updated?: string;
  id?: string;
  content?: XmlTextNode;
  summary?: XmlTextNode;
  enclosure?: XmlAttr;
  "media:thumbnail"?: XmlAttr | XmlAttr[];
  "media:content"?: XmlAttr | XmlAttr[];
  "media:group"?: {
    "media:thumbnail"?: XmlAttr | XmlAttr[];
    "media:content"?: XmlAttr | XmlAttr[];
  };
  "itunes:image"?: { "@_href"?: string } | { "@_href"?: string }[];
  category?: XmlTextNode | XmlTextNode[];
}

/** fast-xml-parser が返すトップレベル構造 */
interface RawParsedXml {
  rss?: {
    channel?: {
      title?: XmlTextNode;
      link?: string;
      item?: FeedItem | FeedItem[];
      /** channel-level 著者 (item に author がないとき fallback、Atom feed.author / JSON feedAuthors と対称) */
      "dc:creator"?: XmlTextNode;
    };
  };
  feed?: {
    title?: XmlTextNode;
    link?: XmlAttr | XmlAttr[];
    entry?: FeedItem | FeedItem[];
    author?: FeedAuthor | FeedAuthor[];
  };
  /** RSS 1.0 / RDF Site Summary */
  "rdf:RDF"?: {
    channel?: {
      title?: XmlTextNode;
      link?: string;
      /** channel-level 著者 (item に author がないとき fallback) */
      "dc:creator"?: XmlTextNode;
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
  categories: string[];
  /** 標準フィールド以外のカスタム XML タグ値（dc:corp, business_form 等） */
  metadata: Array<{ key: string; value: string }>;
}

export interface ParsedFeed {
  title: string;
  siteUrl: string;
  items: ParsedItem[];
}

/**
 * Article.summary の最大文字数 (#721)。
 *
 * 旧 200 制限では VRChat seller bot 等の長い `<description>` が冒頭で切られて
 * 「すべて表示されていない」とユーザー報告があった。5000 に緩和して大半の RSS で
 * 完全表示できるようにしつつ、悪意ある巨大 description (1MB+) による R2 storage /
 * シリアライズコスト DoS を防ぐため上限は残す。
 */
const MAX_SUMMARY_LENGTH = 5000;

const BASE_PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name: string) => ["item", "entry", "link", "category"].includes(name),
  // GHSA-jp2q-39xq-3w4g (entity 展開 DoS) は fast-xml-parser v4.2.4 以降で修正済み。
  // v5.x では processEntities オブジェクト形式で制限値を個別に設定できる。
  //
  // デフォルト maxTotalExpansions=1000 では HTML エンティティ（&amp; 等）を多用する
  // フィード（例: 記事本文が長い技術ブログ）で "Entity expansion limit exceeded" が発生する。
  // XMLボム攻撃（Billion Laughs）は maxExpansionDepth=10 と maxEntityCount=100 で防ぐ。
  // Cloudflare changelog など数千記事を含む巨大フィードでは 100000 でも超過するため
  // 1000000 に引き上げる。カスタムエンティティ制限（maxEntityCount=100）は維持するため
  // XXE リスクは変わらない。
  processEntities: {
    enabled: true,
    maxTotalExpansions: 1000000,
    maxEntitySize: 10000,
    maxExpansionDepth: 10,
    maxExpandedLength: 5000000,
    maxEntityCount: 100,
  },
  htmlEntities: true,
  // デフォルト 100 では深いネスト構造を持つ HTML コンテンツ埋め込みフィードで
  // "Maximum nested tags exceeded" が発生する（例: nlab.itmedia.co.jp）
  maxNestedTags: 500,
};

const parser = new XMLParser(BASE_PARSER_OPTIONS);

/**
 * 通常パースが失敗した際のフォールバックパーサー。
 * content 系ノードを生テキストとして素通りさせることで、CDATA 内の ]]> や
 * 不正エンティティが原因のパースエラーを回避する。
 * 出力には <![CDATA[...]]> マーカーが残るため unwrapCdata() で展開する。
 */
const parserLenient = new XMLParser({
  ...BASE_PARSER_OPTIONS,
  stopNodes: ["*.description", "*.content:encoded", "*.content", "*.summary"],
});

/**
 * XML パース前の前処理:
 * 1. BOM (U+FEFF) を除去
 * 2. XML 宣言 / ルート要素より前のゴミ（PHP エラー、余分な改行等）を除去
 * 3. XML 1.0 で禁止されている制御文字を除去 (U+0000-U+0008, U+000B, U+000C, U+000E-U+001F)
 */
function preprocessXml(xml: string): string {
  const noBom = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;
  const start = noBom.search(/<(\?xml\b|rss\b|feed\b|rdf:RDF\b)/i);
  const trimmed = start > 0 ? noBom.slice(start) : noBom;
  // eslint-disable-next-line no-control-regex -- XML 1.0 仕様で不正な制御文字を除去
  return trimmed.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

/**
 * stopNodes モードで返される生の CDATA マーカーを展開する。
 * 通常パースでは fast-xml-parser が自動展開するため、両モードで安全に使える（ノーオペ）。
 */
function unwrapCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)]]>/g, "$1");
}

export function toArray<T>(val: T | T[] | undefined): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

/**
 * Atom の表示先リンクを選ぶ。
 * RFC 4287 に従い rel="alternate" と rel 省略を優先し、非標準フィードとの互換性のため
 * alternate 相当がなければ従来どおり最初の non-self link へフォールバックする。
 */
function getAtomAlternateHref(links: XmlAttr[]): string {
  return (
    links.find((link) => {
      const rel = link["@_rel"];
      return rel === undefined || rel === "alternate";
    })?.["@_href"] ??
    links.find((link) => link["@_rel"] !== "self")?.["@_href"] ??
    links[0]?.["@_href"] ??
    ""
  );
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
  if (val == null) return "";
  if (typeof val === "object" && "#text" in (val as object))
    return String((val as { "#text": unknown })["#text"]);
  return String(val);
}

/**
 * RSS アイテムからカスタムフィールド値を抽出する。
 * skipKeys に含まれる標準フィールドと属性キー（@_ 接頭辞）は除外する。
 * HTML を含む長い値は 500 文字に切り詰める。
 */
function extractMetadata(
  item: FeedItem,
  skipKeys: Set<string>,
): Array<{ key: string; value: string }> {
  const entries: Array<{ key: string; value: string }> = [];
  for (const [key, val] of Object.entries(item) as [string, unknown][]) {
    if (skipKeys.has(key) || key.startsWith("@_") || key === "#text") continue;
    const value = str(val).trim().slice(0, 500);
    if (value) entries.push({ key, value });
  }
  return entries;
}

const RSS2_SKIP_KEYS = new Set([
  "title",
  "link",
  "description",
  "content:encoded",
  "dc:creator",
  "dc:date",
  "author",
  "pubDate",
  "guid",
  "category",
  "enclosure",
  "media:thumbnail",
  "media:content",
  "media:group",
]);

const ATOM_SKIP_KEYS = new Set([
  "title",
  "link",
  "id",
  "content",
  "summary",
  "author",
  "published",
  "updated",
  "category",
  "enclosure",
  "media:thumbnail",
  "media:content",
  "media:group",
]);

const RDF_SKIP_KEYS = new Set([...RSS2_SKIP_KEYS, "@_rdf:about"]);

/** author フィールドから表示名を取得する（Atom の author.name / RSS の dc:creator 両対応） */
function authorStr(author: FeedItem["author"]): string {
  return toArray<FeedAuthor>(author)
    .map((entry) =>
      typeof entry === "object" && entry !== null && "name" in entry ? str(entry.name) : str(entry),
    )
    .filter(Boolean)
    .join(", ");
}

/**
 * 危険なスキーム（javascript:, vbscript:, data: 等）を持つ URL を空文字に変換する。
 * unescapeHtml でエンティティデコード・制御文字除去後にスキームを確認する。
 * これにより &#106;avascript: 等のバイパスを防ぐ。
 */
function safeUrl(url: string): string {
  if (!url) return "";
  // unescapeHtml: エンティティデコード + ゼロ幅文字除去
  // 先頭の ASCII 制御文字・空白も除去（ブラウザの URL 正規化に倣う）
  // eslint-disable-next-line no-control-regex -- URL 正規化でブラウザに倣い ASCII 制御文字を除去
  const decoded = unescapeHtml(url).replace(/^[\u0000-\u0020\u007F]+/, "");
  // decoded を返すことで HTML エンティティ（&amp; 等）を正規化した URL を格納する
  return isAbsoluteHttpUrl(decoded) ? decoded : "";
}

/** RSS item の明示 link を優先し、欠落時のみ permalink GUID へフォールバックする。 */
function getRssItemLink(item: FeedItem): string {
  const explicitLink = str(item.link);
  if (explicitLink) return safeUrl(explicitLink);

  const guid = item.guid;
  if (typeof guid === "object" && guid?.["@_isPermaLink"] === "false") return "";
  return safeUrl(str(guid));
}

/** XmlAttr または XmlAttr[] から最初の @_url を取得する */
function firstAttrUrl(val: XmlAttr | XmlAttr[] | undefined): string {
  if (!val) return "";
  const first = Array.isArray(val) ? val[0] : val;
  return first?.["@_url"] ? String(first["@_url"]) : "";
}

/** RSS item / Atom entry から最初の画像 URL を取得 */
function extractImage(item: FeedItem): string {
  // 1. media:content (画像タイプ、直下 or media:group 内) — Issue #117: media:thumbnail より優先
  const mcRaw = item["media:content"] ?? item["media:group"]?.["media:content"];
  const mcArr = Array.isArray(mcRaw) ? mcRaw : mcRaw ? [mcRaw] : [];
  for (const m of mcArr) {
    if (
      m?.["@_url"] &&
      (m["@_medium"] === "image" || String(m["@_type"] ?? "").startsWith("image/"))
    ) {
      return String(m["@_url"]);
    }
  }

  // 2. media:thumbnail (直下 or media:group 内)
  const thumb = item["media:thumbnail"] ?? item["media:group"]?.["media:thumbnail"];
  const thumbUrl = firstAttrUrl(thumb);
  if (thumbUrl) return thumbUrl;

  // 3. itunes:image (Podcast など): href 属性
  const itunesRaw = item["itunes:image"];
  const itunes = Array.isArray(itunesRaw) ? itunesRaw[0] : itunesRaw;
  const itunesHref = itunes?.["@_href"] ? String(itunes["@_href"]) : "";
  if (itunesHref) return itunesHref;

  // 4. enclosure (type=image/* または URL が画像拡張子・不正 type の場合も許容)
  const enc = item.enclosure;
  if (enc?.["@_url"]) {
    const encType = String(enc["@_type"] ?? "");
    const encUrl = String(enc["@_url"]);
    const isAudioVideo = encType.startsWith("audio/") || encType.startsWith("video/");
    const looksLikeImage = /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(encUrl);
    if (encType.startsWith("image/") || (!isAudioVideo && looksLikeImage)) {
      return encUrl;
    }
    // Zenn など type="false" 等の不正値でも URL があれば採用
    if (encUrl && !isAudioVideo && encType !== "" && !encType.includes("/")) {
      return encUrl;
    }
  }

  // 5. content/description 中の <video poster="..."> (Twitter/X など video 主体の RSS 用、#645)
  //    description に <video> タグが含まれる場合、その poster をサムネとして採用する。
  //    <img> より優先することで、ユーザーアバターのような副次画像が拾われるのを防ぐ。
  const html = str(
    item["content:encoded"] ?? item.description ?? item.content ?? item.summary ?? "",
  );
  const videoPoster = html.match(/<video[^>]+poster=["']([^"'#][^"']{4,})["']/i);
  if (videoPoster?.[1] && !videoPoster[1].startsWith("data:")) return unescapeHtml(videoPoster[1]);

  // 6. content/description 中の最初の <img>
  const m = html.match(/<img[^>]+src=["']([^"'#][^"']{4,})["']/i);
  if (m?.[1] && !m[1].startsWith("data:")) return unescapeHtml(m[1]);

  return "";
}

// ── JSON Feed ─────────────────────────────────────────────────────────────────

interface JsonFeedAuthor {
  name?: string;
}

interface JsonFeedAttachment {
  url?: string;
  mime_type?: string;
}

interface JsonFeedItem {
  id?: string;
  url?: string;
  external_url?: string;
  title?: string;
  content_html?: string;
  content_text?: string;
  summary?: string;
  image?: string;
  banner_image?: string;
  date_published?: string;
  date_modified?: string;
  authors?: JsonFeedAuthor[];
  /** JSON Feed v1.0 互換フィールド */
  author?: JsonFeedAuthor;
  tags?: string[];
  attachments?: JsonFeedAttachment[];
  language?: string;
}

interface JsonFeedRoot {
  version: string;
  title?: string;
  home_page_url?: string;
  authors?: JsonFeedAuthor[];
  /** JSON Feed v1.0 互換フィールド */
  author?: JsonFeedAuthor;
  items?: JsonFeedItem[];
  language?: string;
}

/**
 * JSON Feed の `version` 文字列が仕様通りの `https://jsonfeed.org/version/...` かを判定する。
 *
 * 単純な `includes("jsonfeed.org")` では
 * `https://evil.example/?x=jsonfeed.org` のように任意 URL にホスト名を混入させて
 * なりすまされるため、URL としてパースし hostname を完全一致で検証する。
 */
function isJsonFeedVersion(version: string): boolean {
  try {
    const url = new URL(version);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    return url.hostname === "jsonfeed.org" || url.hostname === "www.jsonfeed.org";
  } catch {
    return false;
  }
}

function getJsonFeedImage(item: JsonFeedItem): string {
  const image = safeUrl(item.image ?? "");
  if (image) return image;

  const bannerImage = safeUrl(item.banner_image ?? "");
  if (bannerImage) return bannerImage;

  for (const attachment of item.attachments ?? []) {
    if (typeof attachment.mime_type !== "string") continue;
    if (!attachment.mime_type.toLowerCase().startsWith("image/")) continue;

    const attachmentUrl = safeUrl(attachment.url ?? "");
    if (attachmentUrl) return attachmentUrl;
  }

  return "";
}

function getJsonFeedLanguage(itemLanguage: unknown, feedLanguage: unknown): string {
  for (const language of [itemLanguage, feedLanguage]) {
    if (typeof language !== "string") continue;
    const normalized = language.trim();
    if (normalized) return normalized;
  }
  return "";
}

function parseJsonFeed(data: JsonFeedRoot): ParsedFeed {
  const feedAuthors = data.authors ?? (data.author ? [data.author] : []);
  const items: ParsedItem[] = (data.items ?? []).map((item) => {
    const raw = item.content_html ?? item.content_text ?? item.summary ?? "";
    const isHtml = !!item.content_html;
    const link = safeUrl(item.url ?? "") || safeUrl(item.external_url ?? "");
    const content = isHtml ? applyCorePipeline(raw, link) : raw;
    const summary = item.summary
      ? stripHtmlWithBreaks(item.summary).slice(0, MAX_SUMMARY_LENGTH)
      : (isHtml ? stripHtmlWithBreaks(raw) : raw).slice(0, MAX_SUMMARY_LENGTH);
    const itemAuthors = item.authors ?? (item.author ? [item.author] : feedAuthors);
    const author = itemAuthors
      .map((a) => a.name ?? "")
      .filter(Boolean)
      .join(", ");
    const language = getJsonFeedLanguage(item.language, data.language);
    return {
      guid: item.id ?? item.url ?? item.external_url ?? "",
      title: item.title ?? "",
      link,
      summary,
      content,
      ogImage: getJsonFeedImage(item),
      author,
      publishedAt: parseDate(item.date_published) ?? parseDate(item.date_modified),
      categories: item.tags ?? [],
      metadata: language ? [{ key: "language", value: language }] : [],
    };
  });
  return { title: data.title ?? "", siteUrl: data.home_page_url ?? "", items };
}

// ─────────────────────────────────────────────────────────────────────────────

export function parseFeed(xml: string): ParsedFeed {
  const cleaned = preprocessXml(xml);

  // JSON Feed の検出: 先頭が `{` ならまず JSON としてパースを試みる
  if (cleaned.trimStart().startsWith("{")) {
    try {
      const data = JSON.parse(cleaned) as JsonFeedRoot;
      // JSON Feed 仕様書どおり version は `https://jsonfeed.org/version/...` 形式。
      // `includes("jsonfeed.org")` だと任意 URL にホスト名を含ませてなりすまし可能なため
      // ホスト名を URL としてパースして完全一致で判定する。
      if (typeof data?.version === "string" && isJsonFeedVersion(data.version)) {
        return parseJsonFeed(data);
      }
    } catch {
      // JSON パース失敗 → XML として継続
    }
  }

  // まず厳密パースを試み、失敗時は stopNodes による寛容パースにフォールバックする。
  // 寛容パースは CDATA 内の ]]> や不正エンティティが原因のエラーを回避できる。
  let parsed: RawParsedXml;
  try {
    parsed = parser.parse(cleaned) as RawParsedXml;
  } catch (strictErr) {
    try {
      parsed = parserLenient.parse(cleaned) as RawParsedXml;
    } catch (lenientErr) {
      throw new Error(`XML パースに失敗しました (strict: ${strictErr}, lenient: ${lenientErr})`);
    }
  }

  // RSS 2.0
  if (parsed?.rss?.channel) {
    const ch = parsed.rss.channel;
    return {
      title: stripHtml(str(ch.title)),
      siteUrl: str(ch.link),
      items: toArray(ch.item).map((item) => {
        const raw = unwrapCdata(str(item["content:encoded"] ?? item.description ?? ""));
        const link = getRssItemLink(item);
        return {
          guid: str(item.guid ?? item.link),
          title: stripHtml(str(item.title)),
          link,
          summary: stripHtmlWithBreaks(raw).slice(0, MAX_SUMMARY_LENGTH),
          content: applyCorePipeline(raw, link),
          ogImage: safeUrl(extractImage(item)),
          // item に著者がないとき channel-level dc:creator に fallback (Atom feed.author /
          // JSON feedAuthors と対称、単一著者ブログの channel dc:creator のみ提供パターン対応)。
          author: stripHtml(
            str(item["dc:creator"]) || authorStr(item.author) || str(ch["dc:creator"]),
          ).trim(),
          // RSS 2.0 native は pubDate。一部 feed は Dublin Core (dc:date) のみで日付を提供する
          // ため fallback にする (dc:creator を既に読んでおり dc:date も RSS2_SKIP_KEYS 済 =
          // date として消費する前提、RDF の dc:date || pubDate と対称)。
          publishedAt: parseDate(str(item.pubDate) || str(item["dc:date"]) || null),
          categories: toArray(item.category)
            .map((c) => str(c))
            .filter(Boolean),
          metadata: extractMetadata(item, RSS2_SKIP_KEYS),
        };
      }),
    };
  }

  // Atom
  if (parsed?.feed) {
    const feed = parsed.feed;
    const feedLinks = toArray<{ "@_rel"?: string; "@_href"?: string }>(feed.link);
    return {
      title: stripHtml(str(feed.title)),
      siteUrl: getAtomAlternateHref(feedLinks),
      items: toArray(feed.entry).map((entry) => {
        // Atom の link は isArray 設定により常に XmlAttr[] になる
        const entryLinks = toArray<XmlAttr>(entry.link as XmlAttr | XmlAttr[] | undefined);
        const raw = unwrapCdata(str(entry.content ?? entry.summary ?? ""));
        const link = safeUrl(getAtomAlternateHref(entryLinks));
        return {
          // <id> 欠落の Atom entry は link を fallback にする (RSS 2.0 `guid ?? link` /
          // RDF `guid ?? rdf:about ?? link` と対称)。fallback がないと id-less entry が全て
          // guid="" → 同一 article id に collapse して dedup で 1 件以外失われる。
          guid: str(entry.id) || link,
          title: stripHtml(str(entry.title)),
          link,
          summary: stripHtmlWithBreaks(raw).slice(0, MAX_SUMMARY_LENGTH),
          content: applyCorePipeline(raw, link),
          ogImage: safeUrl(extractImage(entry)),
          author: stripHtml(authorStr(entry.author) || authorStr(feed.author)).trim(),
          publishedAt: parseDate(entry.published ?? entry.updated),
          categories: toArray(entry.category)
            .map((c) =>
              typeof c === "object" && c !== null && "@_term" in c
                ? String((c as { "@_term"?: unknown })["@_term"] ?? "")
                : str(c),
            )
            .filter(Boolean),
          metadata: extractMetadata(entry, ATOM_SKIP_KEYS),
        };
      }),
    };
  }

  // RSS 1.0 / RDF Site Summary
  // <rdf:RDF> がルートで、<channel> と <item> が兄弟要素として並ぶ形式
  if (parsed?.["rdf:RDF"]) {
    const rdf = parsed["rdf:RDF"];
    return {
      title: stripHtml(str(rdf.channel?.title)),
      siteUrl: str(rdf.channel?.link),
      items: toArray(rdf.item).map((item) => {
        const raw = unwrapCdata(str(item["content:encoded"] ?? item.description ?? ""));
        // RSS 1.0 は guid がなく rdf:about 属性が識別子を兼ねる
        const guid = str(item.guid ?? item["@_rdf:about"] ?? item.link);
        const link = safeUrl(str(item.link) || str(item["@_rdf:about"]));
        return {
          guid,
          title: stripHtml(str(item.title)),
          link,
          summary: stripHtmlWithBreaks(raw).slice(0, MAX_SUMMARY_LENGTH),
          content: applyCorePipeline(raw, link),
          ogImage: safeUrl(extractImage(item)),
          // item に著者がないとき channel-level dc:creator に fallback (RSS 2.0 / Atom / JSON と対称)。
          author: stripHtml(
            str(item["dc:creator"]) || authorStr(item.author) || str(rdf.channel?.["dc:creator"]),
          ).trim(),
          // RSS 1.0 は dc:date（ISO 8601）が主要。pubDate は一部サイト独自の拡張として存在しうるためフォールバックに使う
          publishedAt: parseDate(str(item["dc:date"]) || str(item.pubDate) || null),
          categories: toArray(item.category)
            .map((c) => str(c))
            .filter(Boolean),
          metadata: extractMetadata(item, RDF_SKIP_KEYS),
        };
      }),
    };
  }

  throw new Error("Unrecognized feed format");
}
