import { Hono } from 'hono';
import type { Env, Feed } from '../types';
import { r2Get, r2Put } from '../lib/r2';
import { fetchArticles } from '../cron/fetch';

const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
  const feeds = await r2Get<Feed[]>(c.env.RSS_DATA, 'feeds.json', []);
  return c.json(feeds);
});

app.post('/', async (c) => {
  const body = await c.req.json<{ url?: string }>();
  const url = body?.url?.trim();
  if (!url) return c.json({ error: 'url is required' }, 400);

  const list = await r2Get<Feed[]>(c.env.RSS_DATA, 'feeds.json', []);
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
  await r2Put(c.env.RSS_DATA, 'feeds.json', list);

  c.executionCtx.waitUntil(fetchArticles(c.env));

  return c.json(newFeed, 201);
});

app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const list = await r2Get<Feed[]>(c.env.RSS_DATA, 'feeds.json', []);
  await r2Put(c.env.RSS_DATA, 'feeds.json', list.filter((f) => f.id !== id));
  return c.json({ ok: true });
});

export default app;
