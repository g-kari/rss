import { Hono } from 'hono';
import type { HonoEnv, Feed } from '../types';
import { r2Get, r2Put } from '../lib/r2';
import { fetchArticles } from '../cron/fetch';

const app = new Hono<HonoEnv>();

app.get('/', async (c) => {
  const userId = c.get('userId');
  const feeds = await r2Get<Feed[]>(c.env.RSS_DATA, `users/${userId}/feeds.json`, []);
  return c.json(feeds);
});

app.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ url?: string }>();
  const url = body?.url?.trim();
  if (!url) return c.json({ error: 'url is required' }, 400);

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
  return c.json({ ok: true });
});

export default app;
