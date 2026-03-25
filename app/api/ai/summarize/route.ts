import { NextResponse } from 'next/server';
import { withSession } from '@/lib/server-auth';
import { getAiCache, setAiCache } from '@/lib/ai-cache';
import { toPlainText } from '@/lib/html';

// @cf/meta/llama-3.1-8b-instruct は workers-types 未掲載のため、同じ
// BaseAiTextGeneration 構造を持つ既知モデル型に合わせてキャストする
const MODEL = '@cf/meta/llama-3.1-8b-instruct' as '@cf/meta/llama-3.1-8b-instruct-fp8';

export async function POST(request: Request) {
  return withSession(async ({ env }) => {
    const body = await request.json() as { text?: unknown };
    if (typeof body?.text !== 'string' || !body.text.trim()) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    const plain = toPlainText(body.text).slice(0, 6000);

    // キャッシュヒット
    const cached = await getAiCache(env.RSS_DATA, 'summary', plain);
    if (cached) return NextResponse.json({ result: cached });

    // AI 実行
    const response = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: 'あなたは優秀なニュース編集者です。記事を簡潔に要約してください。' },
        { role: 'user', content: `次の記事を日本語で3〜5文に要約してください。要約のみを返してください。\n\n${plain}` },
      ],
    }) as { response?: string };
    const summary = response.response ?? '';

    if (summary) await setAiCache(env.RSS_DATA, 'summary', plain, summary);

    return NextResponse.json({ result: summary });
  });
}
