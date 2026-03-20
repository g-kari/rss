import { Hono } from 'hono';
import type { Env, Feed } from '../types';

const app = new Hono<{ Bindings: Env }>();

const FEEDS_PATH = 'public/data/feeds.json';

// GitHub Contents API: ファイル取得
async function ghGet(env: Env, path: string): Promise<{ data: unknown; sha: string }> {
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'rss-reader-worker',
      },
    }
  );
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  const file = await res.json<{ content: string; sha: string }>();
  const decoded = new TextDecoder().decode(
    Uint8Array.from(atob(file.content.replace(/\s/g, '')), (c) => c.charCodeAt(0))
  );
  return { data: JSON.parse(decoded), sha: file.sha };
}

// GitHub Contents API: ファイル更新
async function ghPut(
  env: Env,
  path: string,
  data: unknown,
  sha: string,
  message: string
): Promise<void> {
  const json = JSON.stringify(data, null, 2) + '\n';
  const bytes = new TextEncoder().encode(json);
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  const content = btoa(binary);
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'rss-reader-worker',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, content, sha }),
    }
  );
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
}

// fetch ワークフローをトリガー
async function triggerFetch(env: Env): Promise<void> {
  await fetch(
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/fetch.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'rss-reader-worker',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: env.GITHUB_BRANCH ?? 'master' }),
    }
  );
}

// POST /api/feeds — フィード追加
app.post('/', async (c) => {
  const body = await c.req.json<{ url?: string }>();
  const url = body?.url?.trim();
  if (!url) return c.json({ error: 'url is required' }, 400);

  const { data, sha } = await ghGet(c.env, FEEDS_PATH);
  const list = data as Feed[];

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

  await ghPut(c.env, FEEDS_PATH, list, sha, `add feed: ${url}`);

  // フェッチワークフローをトリガー（失敗してもエラーにしない）
  triggerFetch(c.env).catch((err) => console.error('trigger failed:', err));

  return c.json(newFeed, 201);
});

// DELETE /api/feeds/:id — フィード削除
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const { data, sha } = await ghGet(c.env, FEEDS_PATH);
  const list = (data as Feed[]).filter((f) => f.id !== id);
  await ghPut(c.env, FEEDS_PATH, list, sha, `remove feed: ${id}`);
  return c.json({ ok: true });
});

export default app;
