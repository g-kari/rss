import { Hono } from 'hono';
import type { HonoEnv, Feed, Article } from '../types';
import { r2Get, r2Put } from '../lib/r2';
import { fetchArticles } from '../cron/fetch';

const app = new Hono<HonoEnv>();

/** HTML から RSS/Atom の URL を検出して返す。見つからなければ null */
async function discoverFeedUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'rss-reader/1.0' },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    // すでに RSS/Atom フィードなら URL そのままを返す
    if (ct.includes('xml') || ct.includes('rss') || ct.includes('atom')) return url;
    const html = await res.text();
    // <link rel="alternate" type="application/rss+xml" href="..." />
    const m = html.match(
      /<link[^>]+rel=["']alternate["'][^>]+type=["']application\/(rss|atom)\+xml["'][^>]+href=["']([^"']+)["']/i,
    ) ?? html.match(
      /<link[^>]+type=["']application\/(rss|atom)\+xml["'][^>]+href=["']([^"']+)["']/i,
    );
    if (!m) return null;
    const href = m[2];
    // 相対パスなら絶対パスに変換
    return href.startsWith('http') ? href : new URL(href, url).toString();
  } catch {
    return null;
  }
}

app.get('/', async (c) => {
  const userId = c.get('userId');
  const feeds = await r2Get<Feed[]>(c.env.RSS_DATA, `users/${userId}/feeds.json`, []);
  return c.json(feeds);
});

app.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ url?: string }>();
  let url = body?.url?.trim();
  if (!url) return c.json({ error: 'url is required' }, 400);

  // サイト URL が入力された場合は RSS URL を自動検出
  const discovered = await discoverFeedUrl(url);
  if (discovered && discovered !== url) url = discovered;

  const list = await r2Get<Feed[]>(c.env.RSS_DATA, `users/${userId}/feeds.json`, []);
  if (list.some((f) => f.url === url)) {
    return c.json({ error: 'Feed already exists' }, 409);
  }

  const newFeed: Feed = {
    id: crypto.randomUUID(),
    url,
    title: url,
    siteUrl: '',
    lastFetchedAt: null,
  };
  list.push(newFeed);
  await r2Put(c.env.RSS_DATA, `users/${userId}/feeds.json`, list);

  c.executionCtx.waitUntil(fetchArticles(c.env, userId));

  return c.json(newFeed, 201);
});

app.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const list = await r2Get<Feed[]>(c.env.RSS_DATA, `users/${userId}/feeds.json`, []);
  await r2Put(c.env.RSS_DATA, `users/${userId}/feeds.json`, list.filter((f) => f.id !== id));

  // 削除されたフィードの記事も一緒に削除
  const articles = await r2Get<Article[]>(c.env.RSS_DATA, `users/${userId}/articles.json`, []);
  await r2Put(
    c.env.RSS_DATA,
    `users/${userId}/articles.json`,
    articles.filter((a) => a.feedId !== id),
  );

  return c.json({ ok: true });
});

export default app;
