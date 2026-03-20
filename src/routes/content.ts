import { Hono } from 'hono';
import type { HonoEnv } from '../types';

const app = new Hono<HonoEnv>();

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, '')
    .trim();
}

/** HTML から本文ブロックを抽出 */
function extractMainContent(html: string): string {
  // 不要セクションを除去
  const cleaned = html
    .replace(/<head\b[\s\S]*?<\/head>/gi, '')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, '')
    .replace(/<header\b[\s\S]*?<\/header>/gi, '')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, '')
    .replace(/<form\b[\s\S]*?<\/form>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // <article> を優先
  const article = cleaned.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (article?.[1]) return sanitizeHtml(article[1]);

  // <main>
  const main = cleaned.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (main?.[1]) return sanitizeHtml(main[1]);

  // role="main"
  const roleMain = cleaned.match(/<(\w+)[^>]+role=["']main["'][^>]*>([\s\S]*?)<\/\1>/i);
  if (roleMain?.[2]) return sanitizeHtml(roleMain[2]);

  // よくある本文 class: content, post, entry, article-body
  const classContent = cleaned.match(
    /<(\w+)[^>]+class=["'][^"']*(?:post|entry|article)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i,
  );
  if (classContent?.[2]) return sanitizeHtml(classContent[2]);

  // フォールバック: body
  const body = cleaned.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return sanitizeHtml(body?.[1] ?? cleaned);
}

/** GET /api/content?url=... — 認証済みユーザー向けフルテキスト取得 */
app.get('/', async (c) => {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'url is required' }, 400);

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return c.json({ error: 'Invalid URL' }, 400);
  } catch {
    return c.json({ error: 'Invalid URL' }, 400);
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; rss-reader/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (!res.ok) return c.json({ error: `${res.status} ${res.statusText}` }, 502);

    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('html')) return c.json({ error: 'Not an HTML page' }, 415);

    const html = await res.text();
    const content = extractMainContent(html);
    return c.json({ content });
  } catch (err) {
    return c.json({ error: String(err) }, 502);
  }
});

export default app;
