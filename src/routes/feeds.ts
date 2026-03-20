import { Hono } from 'hono';
import type { Env } from '../types';
import { listFeeds, insertFeed, deleteFeed, getFeedById } from '../db/feeds';
import { refreshFeed } from '../cron/fetch-feeds';
import { getUnreadCount } from '../db/articles';

const feeds = new Hono<{ Bindings: Env }>();

feeds.get('/', async (c) => {
  const feedList = await listFeeds(c.env.DB);
  const withCounts = await Promise.all(
    feedList.map(async (f) => ({
      ...f,
      unread_count: await getUnreadCount(c.env.DB, f.id),
    }))
  );
  return c.json(withCounts);
});

feeds.post('/', async (c) => {
  const body = await c.req.json<{ url?: string }>();
  const url = body?.url?.trim();
  if (!url) return c.json({ error: 'url is required' }, 400);

  const id = crypto.randomUUID();
  try {
    await insertFeed(c.env.DB, { id, url, title: url, site_url: '' });
    await refreshFeed(c.env.DB, id, url);
    const feed = await getFeedById(c.env.DB, id);
    return c.json({ ...feed, unread_count: await getUnreadCount(c.env.DB, id) }, 201);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE')) return c.json({ error: 'Feed already exists' }, 409);
    throw err;
  }
});

feeds.delete('/:id', async (c) => {
  await deleteFeed(c.env.DB, c.req.param('id'));
  return c.json({ ok: true });
});

feeds.post('/:id/refresh', async (c) => {
  const feed = await getFeedById(c.env.DB, c.req.param('id'));
  if (!feed) return c.json({ error: 'Not found' }, 404);
  await refreshFeed(c.env.DB, feed.id, feed.url);
  return c.json({ ok: true });
});

export default feeds;
