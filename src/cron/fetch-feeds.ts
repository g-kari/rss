import type { Env } from '../types';
import { listFeeds, updateFeedMeta, incrementFeedError } from '../db/feeds';
import { insertArticles } from '../db/articles';
import { parseFeed } from '../lib/xml-parser';

async function fetchXml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'RSS-Reader/1.0' },
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

async function hashId(feedId: string, guid: string): Promise<string> {
  const data = new TextEncoder().encode(`${feedId}:${guid}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

export async function refreshFeed(
  db: D1Database,
  feedId: string,
  feedUrl: string
): Promise<void> {
  const xml = await fetchXml(feedUrl);
  const parsed = parseFeed(xml);

  await updateFeedMeta(db, feedId, { title: parsed.title || feedUrl, siteUrl: parsed.siteUrl });

  const articles = await Promise.all(
    parsed.items.slice(0, 100).map(async (item) => {
      const guid = item.guid || item.link;
      return {
        id: await hashId(feedId, guid),
        feed_id: feedId,
        guid,
        title: item.title,
        link: item.link,
        summary: item.summary,
        published_at: item.publishedAt,
      };
    })
  );

  await insertArticles(db, articles);
}

export async function runFeedFetch(env: Env): Promise<void> {
  const feeds = await listFeeds(env.DB);
  // バッチ処理でCPU制限を回避
  for (let i = 0; i < feeds.length; i += 5) {
    const batch = feeds.slice(i, i + 5);
    await Promise.allSettled(
      batch.map(async (feed) => {
        try {
          await refreshFeed(env.DB, feed.id, feed.url);
        } catch (err) {
          console.error(`フィード取得エラー ${feed.url}:`, err);
          await incrementFeedError(env.DB, feed.id);
        }
      })
    );
  }
}
