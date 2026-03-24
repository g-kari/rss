import { NextResponse } from 'next/server';
import { requireSession, applyRefreshedTokens } from '@/lib/server-auth';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getAiCache, setAiCache } from '@/lib/ai-cache';
import { toPlainText } from '@/lib/html';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MODEL = '@cf/meta/llama-3.1-8b-instruct' as any;

export async function POST(request: Request) {
  const result = await requireSession();
  if ('error' in result) return result.error;
  const { session } = result;

  const { text } = await request.json() as { text?: string };
  if (!text?.trim()) return applyRefreshedTokens(NextResponse.json({ error: 'text is required' }, { status: 400 }), session);

  const { env } = await getCloudflareContext({ async: true });
  const plain = toPlainText(text).slice(0, 6000);

  // キャッシュヒット
  const cached = await getAiCache(env.RSS_DATA, 'translation', plain);
  if (cached) return applyRefreshedTokens(NextResponse.json({ result: cached }), session);

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

  return applyRefreshedTokens(NextResponse.json({ result: translation }), session);
}
