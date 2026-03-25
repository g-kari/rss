import { NextRequest, NextResponse } from 'next/server';
import { withSession } from '@/lib/server-auth';
import { getUserLatestArticles, readArticlePage } from '@/lib/shared-feed';

export async function GET(request: NextRequest) {
  return withSession(async ({ session, env }) => {
    const { searchParams } = new URL(request.url);
    const feedHash = searchParams.get('feed');
    const page = parseInt(searchParams.get('page') ?? '1', 10);

    // フィード指定 + ページ指定: 特定フィードの特定ページを返す
    if (feedHash && page >= 2) {
      const articles = await readArticlePage(env.RSS_DATA, feedHash, page);
      return NextResponse.json(articles);
    }

    // デフォルト: 全購読フィードの latest.json をマージして返す
    const articles = await getUserLatestArticles(env.RSS_DATA, session.userId);
    return NextResponse.json(articles);
  });
}
