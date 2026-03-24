import type { Feed, Article } from '../types';

import { parseFeed, type ParsedItem } from '../lib/xml-parser';
import { isValidFeedUrl } from '../lib/url';

type FetchEnv = Pick<CloudflareEnv, 'RSS_DATA' | 'FINDME_RSS'>;
import { r2Get, r2Put } from '../lib/r2';

const MAX_ARTICLES = 2000;

/**
 * 連続エラー回数がこの閾値以上のフィードはクロン実行時にスキップする。
 * 手動リフレッシュ (forceRetry=true) は常に再試行する。
 */
const CONSECUTIVE_ERROR_SKIP_THRESHOLD = 5;

/**
 * ホスト名 → サービスバインディングキーのマッピング。
 * 同一アカウントの Worker は HTTP を経由しないため Bot 検出を回避できる。
 */
const SERVICE_BINDING_HOSTS: Partial<Record<string, keyof FetchEnv>> = {
  'findme-rss.0g0.xyz': 'FINDME_RSS',
};

/** サービスバインディングまたはグローバル fetch でリクエストを送る */
function fetchViaBinding(env: FetchEnv, url: string, init?: RequestInit): Promise<Response> {
  const hostname = new URL(url).hostname;
  const bindingKey = SERVICE_BINDING_HOSTS[hostname];
  if (bindingKey) {
    const binding = env[bindingKey] as Fetcher | undefined;
    if (binding) return binding.fetch(url, init);
  }
  return fetch(url, init);
}

/** パース済みアイテムを Article に変換する */
function buildArticle(item: ParsedItem, feedId: string, existingByGuid: Map<string, Article>): Article {
  return {
    id: existingByGuid.get(item.guid)?.id ?? crypto.randomUUID(),
    feedId,
    guid: item.guid,
    title: item.title,
    link: item.link,
    summary: item.summary,
    content: item.content,
    ogImage: item.ogImage || existingByGuid.get(item.guid)?.ogImage,
    author: item.author || existingByGuid.get(item.guid)?.author,
    publishedAt: item.publishedAt,
    createdAt: existingByGuid.get(item.guid)?.createdAt ?? new Date().toISOString(),
  };
}

/** フィード取得成功時のメタデータを更新する */
function applyFeedSuccess(feed: Feed, parsed: ReturnType<typeof parseFeed>): void {
  feed.title = parsed.title || feed.title;
  feed.siteUrl = parsed.siteUrl || feed.siteUrl;
  feed.lastFetchedAt = new Date().toISOString();
  feed.fetchError = null;
  feed.consecutiveErrors = 0;
}

/** publishedAt 降順ソート + 最大件数でスライス */
function sortAndSlice(articles: Iterable<Article>): Article[] {
  return [...articles]
    .sort((a, b) => {
      const at = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const bt = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return bt - at;
    })
    .slice(0, MAX_ARTICLES);
}

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
      const res = await fetchViaBinding(env, feed.url, { headers: { 'User-Agent': 'rss-reader/1.0' } });
      if (!res.ok) throw new Error(`${res.status} ${feed.url}`);
      const xml = await res.text();
      const parsed = parseFeed(xml);

      applyFeedSuccess(feed, parsed);
      return parsed.items.map((item) => buildArticle(item, feed.id, existingByGuid));
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

  await r2Put(env.RSS_DATA, `users/${userId}/articles.json`, sortAndSlice(merged.values()));
}

// フィード追加・手動リフレッシュ時の即時フェッチ（エラー状態に関わらず強制再試行）
export async function fetchArticles(env: FetchEnv, userId: string): Promise<void> {
  await fetchUserArticles(env, userId, true);
}

/**
 * 単一フィードを強制再取得してアーティクルをマージする。
 * エラー状態（consecutiveErrors / fetchError）もリセットを試みる。
 * フィードが見つからない場合は null を返す。
 */
export async function fetchSingleFeed(env: FetchEnv, userId: string, feedId: string): Promise<Feed | null> {
  const feeds = await r2Get<Feed[]>(env.RSS_DATA, `users/${userId}/feeds.json`, []);
  const feedIndex = feeds.findIndex((f) => f.id === feedId);
  if (feedIndex < 0) return null;
  const feed = feeds[feedIndex];

  if (!isValidFeedUrl(feed.url)) throw new Error(`Invalid feed URL: ${feed.url}`);

  const existing = await r2Get<Article[]>(env.RSS_DATA, `users/${userId}/articles.json`, []);
  const existingByGuid = new Map(existing.map((a) => [a.guid, a]));

  try {
    const res = await fetchViaBinding(env, feed.url, { headers: { 'User-Agent': 'rss-reader/1.0' } });
    if (!res.ok) throw new Error(`${res.status} ${feed.url}`);
    const xml = await res.text();
    const parsed = parseFeed(xml);

    applyFeedSuccess(feed, parsed);
    for (const item of parsed.items) {
      const article = buildArticle(item, feed.id, existingByGuid);
      existingByGuid.set(article.guid, article);
    }
  } catch (e) {
    feed.consecutiveErrors = (feed.consecutiveErrors ?? 0) + 1;
    feed.fetchError = e instanceof Error ? e.message : String(e);
    console.error('Single feed fetch failed:', e);
  }

  await r2Put(env.RSS_DATA, `users/${userId}/feeds.json`, feeds);
  await r2Put(env.RSS_DATA, `users/${userId}/articles.json`, sortAndSlice(existingByGuid.values()));

  return feed;
}

// Cron: 全ユーザーをフェッチ
export async function fetchAllUsers(env: FetchEnv): Promise<void> {
  const listed = await env.RSS_DATA.list({ prefix: 'users/', delimiter: '/' });
  const userIds = listed.delimitedPrefixes.map((p: string) => p.slice('users/'.length, -1));
  await Promise.allSettled(userIds.map((id: string) => fetchUserArticles(env, id)));
}
