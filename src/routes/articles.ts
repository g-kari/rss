import { Hono } from 'hono';
import type { HonoEnv, Article } from '../types';
import { r2Get } from '../lib/r2';

const app = new Hono<HonoEnv>();

app.get('/', async (c) => {
  const userId = c.get('userId');
  const articles = await r2Get<Article[]>(c.env.RSS_DATA, `users/${userId}/articles.json`, []);
  return c.json(articles);
});

export default app;
