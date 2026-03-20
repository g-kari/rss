import { Hono } from 'hono';
import type { Env } from '../types';
import { listArticles, markRead, markUnread } from '../db/articles';

const articles = new Hono<{ Bindings: Env }>();

articles.get('/', async (c) => {
  const feedId = c.req.query('feedId') || undefined;
  const page = Math.max(1, Number(c.req.query('page') ?? '1'));
  const limit = Math.min(Math.max(1, Number(c.req.query('limit') ?? '30')), 100);
  const unreadOnly = c.req.query('unreadOnly') === 'true';

  const list = await listArticles(c.env.DB, { feedId, page, limit, unreadOnly });
  return c.json(list);
});

articles.patch('/:id/read', async (c) => {
  await markRead(c.env.DB, c.req.param('id'));
  return c.json({ ok: true });
});

articles.patch('/:id/unread', async (c) => {
  await markUnread(c.env.DB, c.req.param('id'));
  return c.json({ ok: true });
});

export default articles;
