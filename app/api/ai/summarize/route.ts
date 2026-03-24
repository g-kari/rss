import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server-auth';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getAiCache, setAiCache } from '@/lib/ai-cache';
import { toPlainText } from '@/lib/html';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MODEL = '@cf/meta/llama-3.1-8b-instruct' as any;

export async function POST(request: Request) {
  const result = await requireSession();
  if ('error' in result) return result.error;

  const { text } = await request.json() as { text?: string };
  if (!text?.trim()) return NextResponse.json({ error: 'text is required' }, { status: 400 });

  const { env } = await getCloudflareContext({ async: true });
  const plain = toPlainText(text).slice(0, 6000);

  // キャッシュヒット
  const cached = await getAiCache(env.RSS_DATA, 'summary', plain);
  if (cached) return NextResponse.json({ result: cached });

  // AI 実行
  const response = await env.AI.run(MODEL, {
    messages: [
      { role: 'system', content: 'あなたは優秀なニュース編集者です。記事を簡潔に要約してください。' },
      { role: 'user', content: `次の記事を日本語で3〜5文に要約してください。要約のみを返してください。\n\n${plain}` },
    ],
  });
  const res = response as { response?: string };
  const summary = res.response ?? '';

  if (summary) await setAiCache(env.RSS_DATA, 'summary', plain, summary);

  return NextResponse.json({ result: summary });
}
