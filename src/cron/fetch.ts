import type { Feed, Article } from '../types';

import { parseFeed } from '../lib/xml-parser';
import { isValidFeedUrl } from '../lib/url';

type FetchEnv = Pick<CloudflareEnv, 'RSS_DATA'>;
import { r2Get, r2Put } from '../lib/r2';

const MAX_ARTICLES = 2000;

/**
 * 連続エラー回数がこの閾値以上のフィードはクロン実行時にスキップする。
 * 手動リフレッシュ (forceRetry=true) は常に再試行する。
 */
const CONSECUTIVE_ERROR_SKIP_THRESHOLD = 5;

async function fetchUserArticles(env: FetchEnv, userId: string, forceRetry = false): Promise<void> {
  const feeds = await r2Get<Feed[]>(env.RSS_DATA, `users/${userId}/feeds.json`, []);
  if (feeds.length === 0) return;

  const existing = await r2Get<Article[]>(env.RSS_DATA, `users/${userId}/articles.json`, []);
  const existingByGuid = new Map(existing.map((a) => [a.guid, a]));

  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      // クロン実行時: 連続エラーが閾値以上のフィードはスキップ（4xx 等の永続的エラーを無限リトライしない）
      if (!forceRetry && (feed.consecutiveErrors ?? 0) >= CONSECUTIVE_ERROR_SKIP_THRESHOLD) {
        return [];
      }
      if (!isValidFeedUrl(feed.url)) throw new Error(`Invalid feed URL: ${feed.url}`); // SSRF 対策
      const res = await fetch(feed.url, { headers: { 'User-Agent': 'rss-reader/1.0' } });
      if (!res.ok) throw new Error(`${res.status} ${feed.url}`);
      const xml = await res.text();
      const parsed = parseFeed(xml);

      feed.title = parsed.title || feed.title;
      feed.siteUrl = parsed.siteUrl || feed.siteUrl;
      feed.lastFetchedAt = new Date().toISOString();
      feed.fetchError = null;
      feed.consecutiveErrors = 0;

      return parsed.items.map(
        (item): Article => ({
          id: existingByGuid.get(item.guid)?.id ?? crypto.randomUUID(),
          feedId: feed.id,
          guid: item.guid,
          title: item.title,
          link: item.link,
          summary: item.summary,
          content: item.content,
          ogImage: item.ogImage || existingByGuid.get(item.guid)?.ogImage,
          author: item.author || existingByGuid.get(item.guid)?.author,
          publishedAt: item.publishedAt,
          createdAt: existingByGuid.get(item.guid)?.createdAt ?? new Date().toISOString(),
        })
      );
    })
  );

  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      feeds[i].consecutiveErrors = (feeds[i].consecutiveErrors ?? 0) + 1;
      feeds[i].fetchError = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.error('Feed fetch failed:', result.reason);
    }
  });

  await r2Put(env.RSS_DATA, `users/${userId}/feeds.json`, feeds);

  const fresh: Article[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') fresh.push(...r.value);
    else void 0; // already logged above
  }

  const merged = new Map<string, Article>(existingByGuid);
  for (const a of fresh) merged.set(a.guid, a);

  const sorted = [...merged.values()]
    .sort((a, b) => {
      const at = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const bt = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return bt - at;
    })
    .slice(0, MAX_ARTICLES);

  await r2Put(env.RSS_DATA, `users/${userId}/articles.json`, sorted);
}

// フィード追加・手動リフレッシュ時の即時フェッチ（エラー状態に関わらず強制再試行）
export async function fetchArticles(env: FetchEnv, userId: string): Promise<void> {
  await fetchUserArticles(env, userId, true);
}

// Cron: 全ユーザーをフェッチ
export async function fetchAllUsers(env: FetchEnv): Promise<void> {
  const listed = await env.RSS_DATA.list({ prefix: 'users/', delimiter: '/' });
  const userIds = listed.delimitedPrefixes.map((p: string) => p.slice('users/'.length, -1));
  await Promise.allSettled(userIds.map((id: string) => fetchUserArticles(env, id)));
}
