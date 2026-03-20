import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server-auth';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getAiCache, setAiCache } from '@/lib/ai-cache';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MODEL = '@cf/meta/llama-3.1-8b-instruct' as any;

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

export async function POST(request: Request) {
  const result = await requireSession();
  if ('error' in result) return result.error;

  const { text } = await request.json() as { text?: string };
  if (!text?.trim()) return NextResponse.json({ error: 'text is required' }, { status: 400 });

  const { env } = await getCloudflareContext({ async: true });
  const plain = toPlainText(text);

  // キャッシュヒット
  const cached = await getAiCache(env.RSS_DATA, 'translation', plain);
  if (cached) return NextResponse.json({ result: cached });

  // AI 実行
  const response = await env.AI.run(MODEL, {
    messages: [
      { role: 'system', content: 'あなたは優秀な翻訳者です。自然な日本語に翻訳してください。' },
      { role: 'user', content: `次のテキストを自然な日本語に翻訳してください。翻訳のみを返してください。\n\n${plain}` },
    ],
  });
  const res = response as { response?: string };
  const translation = res.response ?? '';

  if (translation) await setAiCache(env.RSS_DATA, 'translation', plain, translation);

  return NextResponse.json({ result: translation });
}
