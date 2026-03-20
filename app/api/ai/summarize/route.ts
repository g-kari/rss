import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server-auth';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const runtime = 'edge';

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

  const { env } = getCloudflareContext();
  const plain = toPlainText(text);
  const response = await env.AI.run(MODEL, {
    messages: [
      { role: 'system', content: 'あなたは優秀なニュース編集者です。記事を簡潔に要約してください。' },
      { role: 'user', content: `次の記事を日本語で3〜5文に要約してください。要約のみを返してください。\n\n${plain}` },
    ],
  });
  const res = response as { response?: string };
  return NextResponse.json({ result: res.response ?? '' });
}
