import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import feedsRoutes from './routes/feeds';

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', cors());

app.route('/api/feeds', feedsRoutes);

app.get('/api/health', (c) => c.json({ ok: true, timestamp: new Date().toISOString() }));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

export default { fetch: app.fetch };
