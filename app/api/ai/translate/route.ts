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
    const cached = await getAiCache(env.RSS_DATA, 'translation', plain);
    if (cached) return NextResponse.json({ result: cached });

    // AI 実行
    const response = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: 'あなたは優秀な翻訳者です。自然な日本語に翻訳してください。' },
        { role: 'user', content: `次のテキストを自然な日本語に翻訳してください。翻訳のみを返してください。\n\n${plain}` },
      ],
    }) as { response?: string };
    const translation = response.response ?? '';

    if (translation) await setAiCache(env.RSS_DATA, 'translation', plain, translation);

    return NextResponse.json({ result: translation });
  });
}
