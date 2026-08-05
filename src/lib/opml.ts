import { escapeHtml } from "@/lib/html";
import { toArray } from "@/lib/xml-parser";
import { stripControlChars } from "@/lib/validation";
import { sortByOrder } from "@/lib/sort-utils";
import { FEED_GROUP_NAME_MAX_LENGTH } from "@/lib/feed-groups";
import type { Feed, FeedGroup } from "@/types";

const MAX_OPML_DEPTH = 10;
const MAX_TITLE_LENGTH = 500;
const MAX_SITE_URL_LENGTH = 2048;
const EMPTY_OPML =
  '<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>RSS Reader Feeds</title>\n  </head>\n  <body>\n\n  </body>\n</opml>';

export interface FeedEntry {
  url: string;
  title: string;
  siteUrl: string;
  folder?: string;
}

export interface OpmlOutline {
  "@_xmlUrl"?: string;
  "@_text"?: string;
  "@_title"?: string;
  "@_htmlUrl"?: string;
  outline?: OpmlOutline | OpmlOutline[];
}

/** OPML title を制御文字除去 + 長さ制限 (MAX_TITLE_LENGTH) で sanitize する。 */
function sanitizeTitle(title: string): string {
  return stripControlChars(title).slice(0, MAX_TITLE_LENGTH);
}

/**
 * OPML siteUrl (`htmlUrl` 属性) を sanitize する。
 * 空文字 / 長さ超過 / parse 失敗 / http(s) 以外のスキームはすべて空文字を返す。
 */
function sanitizeSiteUrl(url: string): string {
  if (!url || url.length > MAX_SITE_URL_LENGTH) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return url;
  } catch {
    return "";
  }
}

/** フォルダ名を制御文字除去 + 長さ制限 (FEED_GROUP_NAME_MAX_LENGTH) で sanitize する。 */
function sanitizeFolderName(name: string): string {
  return stripControlChars(name).slice(0, FEED_GROUP_NAME_MAX_LENGTH);
}

/**
 * feed 一覧 + feed group を OPML 2.0 XML 文字列にシリアライズする。
 * group に属する feed は `<outline>` ネストで、所属なし feed は body 直下に列挙する。
 * title / url / siteUrl は escapeHtml で XML エスケープされ、空 group は出力されない。
 *
 * @param feeds - シリアライズ対象の feed 配列
 * @param groups - feed の親 group 配列。`sortByOrder` で表示順に整列して出力する
 * @returns OPML 2.0 形式の XML 文字列 (UTF-8 宣言 + `<opml version="2.0">` ルート)
 */
export function buildOpml(feeds: Feed[], groups: FeedGroup[]): string {
  if (feeds.length === 0) return EMPTY_OPML;
  const sortedGroups = sortByOrder(groups);
  const groupMap = new Map<string, Feed[]>();
  const ungrouped: Feed[] = [];
  const groupIds = new Set<string>();
  for (const group of sortedGroups) groupIds.add(group.id);

  for (const f of feeds) {
    if (f.groupId && groupIds.has(f.groupId)) {
      const list = groupMap.get(f.groupId);
      if (list) {
        list.push(f);
      } else {
        groupMap.set(f.groupId, [f]);
      }
    } else {
      ungrouped.push(f);
    }
  }

  const feedOutline = (f: Feed, indent: string): string => {
    const title = escapeHtml(f.title);
    const xmlUrl = escapeHtml(f.url);
    const htmlUrl = escapeHtml(f.siteUrl);
    return `${indent}<outline text="${title}" title="${title}" type="rss" xmlUrl="${xmlUrl}" htmlUrl="${htmlUrl}"/>`;
  };

  const lines: string[] = [];

  for (const group of sortedGroups) {
    const groupFeeds = groupMap.get(group.id);
    if (!groupFeeds || groupFeeds.length === 0) continue;
    const name = escapeHtml(group.name);
    lines.push(`    <outline text="${name}" title="${name}">`);
    for (const f of groupFeeds) {
      lines.push(feedOutline(f, "      "));
    }
    lines.push("    </outline>");
  }

  for (const f of ungrouped) {
    lines.push(feedOutline(f, "    "));
  }

  const outlines = lines.join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>RSS Reader Feeds</title>\n  </head>\n  <body>\n${outlines}\n  </body>\n</opml>`;
}

/**
 * OPML `<outline>` tree を再帰走査して feed の URL / title / siteUrl / 所属 folder 名を抽出する。
 * 深さ制限 (`MAX_OPML_DEPTH = 10`) で循環参照や攻撃的な深ネストを防ぐ。
 * `@_xmlUrl` を持つ outline は feed として results に push、持たないが子 outline がある場合は folder と判断して
 * `@_title` / `@_text` を folder 名として子に伝播する。
 *
 * @param outline - 走査対象の OPML outline (root から再帰呼び出しされる)
 * @param depth - 再帰深度。MAX_OPML_DEPTH を超えると空配列を返す
 * @param folder - 親 folder 名。子 feed の `folder` フィールドにそのまま入る
 * @returns 抽出された feed エントリ配列
 */
export function extractFeeds(outline: OpmlOutline, depth = 0, folder?: string): FeedEntry[] {
  if (depth > MAX_OPML_DEPTH) return [];
  const results: FeedEntry[] = [];
  if (outline["@_xmlUrl"]) {
    results.push({
      url: outline["@_xmlUrl"],
      title: sanitizeTitle(outline["@_title"] ?? outline["@_text"] ?? outline["@_xmlUrl"]),
      siteUrl: sanitizeSiteUrl(outline["@_htmlUrl"] ?? ""),
      folder,
    });
  }
  const isFolder = !outline["@_xmlUrl"] && outline.outline;
  const childFolder = isFolder
    ? sanitizeFolderName(outline["@_title"] ?? outline["@_text"] ?? "") || undefined
    : folder;
  for (const child of toArray(outline.outline)) {
    results.push(...extractFeeds(child, depth + 1, childFolder));
  }
  return results;
}
