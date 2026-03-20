import { Hono } from 'hono';
import type { Env, HonoEnv } from './types';
import feedsRoutes from './routes/feeds';
import articlesRoutes from './routes/articles';
import authRoutes from './routes/auth';
import contentRoute from './routes/content';
import aiRoute from './routes/ai';
import { requireAuth } from './middleware/auth';
import { fetchAllUsers } from './cron/fetch';

const app = new Hono<HonoEnv>();

// 認証不要
app.route('/api/auth', authRoutes);

// 認証必須
app.use('/api/feeds', requireAuth);
app.use('/api/feeds/*', requireAuth);
app.use('/api/articles', requireAuth);
app.use('/api/articles/*', requireAuth);
app.use('/api/content', requireAuth);
app.use('/api/ai/*', requireAuth);

app.route('/api/feeds', feedsRoutes);
app.route('/api/articles', articlesRoutes);
app.route('/api/content', contentRoute);
app.route('/api/ai', aiRoute);

app.get('/api/health', (c) => c.json({ ok: true, timestamp: new Date().toISOString() }));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(fetchAllUsers(env));
  },
};
