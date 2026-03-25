import { NextResponse } from 'next/server';
import { parseJsonBody } from '@/lib/server-auth';
import { getAiCacheById, setAiCacheById } from '@/lib/ai-cache';
import { toPlainText } from '@/lib/html';
import { fetchArticleContent } from '@/lib/fetch-article-content';
import { isValidFeedUrl } from '@/lib/url';

// @cf/meta/llama-3.1-8b-instruct は workers-types 未掲載のため、同じ
// BaseAiTextGeneration 構造を持つ既知モデル型に合わせてキャストする
const MODEL = '@cf/meta/llama-3.1-8b-instruct' as '@cf/meta/llama-3.1-8b-instruct-fp8';

type AiMessage = { role: 'system' | 'user'; content: string };

/**
 * AI ルートハンドラの共通ロジック。
 * URL 検証・コンテンツ取得・キャッシュ確認・AI 実行・キャッシュ保存を担う。
 *
 * @param request - リクエストオブジェクト
 * @param env - Cloudflare バインディング (RSS_DATA, AI)
 * @param ctx - ExecutionContext (waitUntil 用)
 * @param cacheType - R2 キャッシュのキー種別 ('summary' | 'translation')
 * @param buildMessages - テキストから AI メッセージ配列を構築する関数
 */
export async function runAiJob(
  request: Request,
  env: { RSS_DATA: R2Bucket; AI: Ai },
  ctx: ExecutionContext,
  cacheType: 'summary' | 'translation',
  buildMessages: (plain: string) => AiMessage[],
): Promise<NextResponse> {
  const parsed = await parseJsonBody<{ url?: unknown; articleId?: unknown }>(request);
  if (!parsed.ok) return parsed.error;
  const body = parsed.data;
  if (typeof body?.url !== 'string' || !isValidFeedUrl(body.url)) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  const url = body.url;
  const articleId = typeof body.articleId === 'string' ? body.articleId : null;

  // キャッシュヒット（articleId ベース）
  if (articleId) {
    const cached = await getAiCacheById(env.RSS_DATA, cacheType, articleId);
    if (cached) return NextResponse.json({ result: cached });
  }

  // サーバー側でコンテンツを取得（/api/content と同じキャッシュを共有）
  const reqUrl = new URL(request.url);
  const content = await fetchArticleContent(url, reqUrl.origin, ctx);
  if (!content) return NextResponse.json({ error: 'コンテンツを取得できませんでした' }, { status: 502 });

  const plain = toPlainText(content).slice(0, 6000);

  // AI 実行
  const response = (await env.AI.run(MODEL, {
    messages: buildMessages(plain),
  })) as { response?: string };
  const result = response.response ?? '';

  if (result && articleId) await setAiCacheById(env.RSS_DATA, cacheType, articleId, result);

  return NextResponse.json({ result });
}
