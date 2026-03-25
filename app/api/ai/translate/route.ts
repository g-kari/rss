import { NextResponse } from 'next/server';
import { withSession, parseJsonBody } from '@/lib/server-auth';
import { getAiCacheById, setAiCacheById } from '@/lib/ai-cache';
import { toPlainText } from '@/lib/html';
import { fetchArticleContent } from '@/lib/fetch-article-content';
import { isValidFeedUrl } from '@/lib/url';

// @cf/meta/llama-3.1-8b-instruct は workers-types 未掲載のため、同じ
// BaseAiTextGeneration 構造を持つ既知モデル型に合わせてキャストする
const MODEL = '@cf/meta/llama-3.1-8b-instruct' as '@cf/meta/llama-3.1-8b-instruct-fp8';

export async function POST(request: Request) {
  return withSession(async ({ env, ctx }) => {
    const body = await parseJsonBody<{ url?: unknown; articleId?: unknown }>(request);
    if (body instanceof NextResponse) return body;
    if (typeof body?.url !== 'string' || !isValidFeedUrl(body.url)) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    const url = body.url;
    const articleId = typeof body.articleId === 'string' ? body.articleId : null;

    // キャッシュヒット（articleId ベース）
    if (articleId) {
      const cached = await getAiCacheById(env.RSS_DATA, 'translation', articleId);
      if (cached) return NextResponse.json({ result: cached });
    }

    // サーバー側でコンテンツを取得（/api/content と同じキャッシュを共有）
    const reqUrl = new URL(request.url);
    const content = await fetchArticleContent(url, reqUrl.origin, ctx);
    if (!content) return NextResponse.json({ error: 'コンテンツを取得できませんでした' }, { status: 502 });

    const plain = toPlainText(content).slice(0, 6000);

    // AI 実行
    const response = (await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: 'あなたは優秀な翻訳者です。自然な日本語に翻訳してください。' },
        { role: 'user', content: `次のテキストを自然な日本語に翻訳してください。翻訳のみを返してください。\n\n${plain}` },
      ],
    })) as { response?: string };
    const translation = response.response ?? '';

    if (translation && articleId) await setAiCacheById(env.RSS_DATA, 'translation', articleId, translation);

    return NextResponse.json({ result: translation });
  });
}
