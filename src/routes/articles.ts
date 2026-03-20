import { Hono } from 'hono';
import type { Env, Article } from '../types';
import { r2Get } from '../lib/r2';

const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
  const articles = await r2Get<Article[]>(c.env.RSS_DATA, 'articles.json', []);
  return c.json(articles);
});

export default app;
