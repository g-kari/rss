import { escapeHtml } from "@/lib/html";
import { toArray } from "@/lib/xml-parser";
import { stripControlChars } from "@/lib/validation";
import { sortByOrder } from "@/lib/sort-utils";
import type { Feed, FeedGroup } from "@/types";

const FEED_GROUP_NAME_MAX_LENGTH = 50;
const MAX_OPML_DEPTH = 10;
const MAX_TITLE_LENGTH = 500;
const MAX_SITE_URL_LENGTH = 2048;

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

function sanitizeTitle(title: string): string {
  return stripControlChars(title).slice(0, MAX_TITLE_LENGTH);
}

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

function sanitizeFolderName(name: string): string {
  return stripControlChars(name).slice(0, FEED_GROUP_NAME_MAX_LENGTH);
}

export function buildOpml(feeds: Feed[], groups: FeedGroup[]): string {
  const sortedGroups = sortByOrder(groups);
  const groupMap = new Map<string, Feed[]>();
  const ungrouped: Feed[] = [];
  const groupIds = new Set(sortedGroups.map((g) => g.id));

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
