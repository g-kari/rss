/**
 * RSSフィードを取得して public/data/ に保存するスクリプト
 * GitHub Actions の cron から実行される
 */
import { XMLParser } from 'fast-xml-parser';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'public', 'data');

const feedsPath = join(dataDir, 'feeds.json');
const articlesPath = join(dataDir, 'articles.json');

const feeds = JSON.parse(readFileSync(feedsPath, 'utf-8'));

let articles = [];
try {
  articles = JSON.parse(readFileSync(articlesPath, 'utf-8'));
} catch {
  articles = [];
}

// ----- XML パーサー -----
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['item', 'entry', 'link'].includes(name),
});

function toArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function stripHtml(html) {
  return String(html ?? '').replace(/<[^>]*>/g, '').trim();
}

function str(val) {
  if (val == null) return '';
  if (typeof val === 'object' && '#text' in val) return String(val['#text']);
  return String(val);
}

function parseFeed(xml) {
  const parsed = parser.parse(xml);

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

  if (parsed?.feed) {
    const feed = parsed.feed;
    const feedLinks = toArray(feed.link);
    return {
      title: stripHtml(str(feed.title)),
      siteUrl: feedLinks.find((l) => l['@_rel'] !== 'self')?.['@_href'] ?? '',
      items: toArray(feed.entry).map((entry) => {
        const entryLinks = toArray(entry.link);
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

// ----- フェッチ -----
async function fetchXml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'RSS-Reader/1.0 (github-actions)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') ?? '';
    const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
    const charset = charsetMatch?.[1] ?? 'utf-8';
    if (charset.toLowerCase() === 'utf-8') return res.text();
    return new TextDecoder(charset).decode(await res.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

function hashId(feedId, guid) {
  return createHash('sha256').update(`${feedId}:${guid}`).digest('hex').slice(0, 32);
}

// ----- メイン処理 -----
const existingIds = new Set(articles.map((a) => a.id));
let newCount = 0;

for (const feed of feeds) {
  console.log(`Fetching: ${feed.url}`);
  try {
    const xml = await fetchXml(feed.url);
    const parsed = parseFeed(xml);

    feed.title = parsed.title || feed.title || feed.url;
    feed.siteUrl = parsed.siteUrl || feed.siteUrl || '';
    feed.lastFetchedAt = new Date().toISOString();

    for (const item of parsed.items.slice(0, 100)) {
      const guid = item.guid || item.link;
      const id = hashId(feed.id, guid);
      if (!existingIds.has(id)) {
        articles.push({
          id,
          feedId: feed.id,
          guid,
          title: item.title,
          link: item.link,
          summary: item.summary,
          publishedAt: item.publishedAt,
          createdAt: new Date().toISOString(),
        });
        existingIds.add(id);
        newCount++;
      }
    }
  } catch (err) {
    console.error(`  Error: ${err.message}`);
  }
}

// 日付順ソート・件数上限
articles.sort((a, b) => {
  if (!a.publishedAt) return 1;
  if (!b.publishedAt) return -1;
  return new Date(b.publishedAt) - new Date(a.publishedAt);
});
if (articles.length > 2000) {
  articles = articles.slice(0, 2000);
}

// 保存
writeFileSync(feedsPath, JSON.stringify(feeds, null, 2) + '\n');
writeFileSync(articlesPath, JSON.stringify(articles, null, 2) + '\n');
console.log(`Done. ${newCount} new articles. Total: ${articles.length}`);
