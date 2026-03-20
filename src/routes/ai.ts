import { Hono } from 'hono';
import type { HonoEnv } from '../types';

const app = new Hono<HonoEnv>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MODEL = '@cf/meta/llama-3.1-8b-instruct' as any;

/** HTML タグを除去して平文に変換（AI 入力用）*/
function toPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000);
}

/** POST /api/ai/summarize — 記事を日本語で要約 */
app.post('/summarize', async (c) => {
  const { text } = await c.req.json<{ text?: string }>();
  if (!text?.trim()) return c.json({ error: 'text is required' }, 400);

  const plain = toPlainText(text);
  const response = await c.env.AI.run(MODEL, {
    messages: [
      {
        role: 'system',
        content: 'あなたは優秀なニュース編集者です。記事を簡潔に要約してください。',
      },
      {
        role: 'user',
        content: `次の記事を日本語で3〜5文に要約してください。要約のみを返してください。\n\n${plain}`,
      },
    ],
  });
  const result = response as { response?: string };
  return c.json({ result: result.response ?? '' });
});

/** POST /api/ai/translate — 記事を日本語に翻訳 */
app.post('/translate', async (c) => {
  const { text } = await c.req.json<{ text?: string }>();
  if (!text?.trim()) return c.json({ error: 'text is required' }, 400);

  const plain = toPlainText(text);
  const response = await c.env.AI.run(MODEL, {
    messages: [
      {
        role: 'system',
        content: 'あなたは優秀な翻訳者です。自然な日本語に翻訳してください。',
      },
      {
        role: 'user',
        content: `次のテキストを自然な日本語に翻訳してください。翻訳のみを返してください。\n\n${plain}`,
      },
    ],
  });
  const result = response as { response?: string };
  return c.json({ result: result.response ?? '' });
});

export default app;
