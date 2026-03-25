import { NextRequest, NextResponse } from 'next/server';
import { withSession } from '@/lib/server-auth';
import { getUserLatestArticles, readArticlePage, readUserSubscriptions } from '@/lib/shared-feed';

export async function GET(request: NextRequest) {
  return withSession(async ({ session, env }) => {
    const { searchParams } = new URL(request.url);
    const feedHash = searchParams.get('feed');
    const page = parseInt(searchParams.get('page') ?? '1', 10);

    // フィード指定 + ページ指定: 特定フィードの特定ページを返す
    if (feedHash && page >= 2) {
      // 購読チェック: そのユーザーが該当フィードを購読していない場合は 404
      const subs = await readUserSubscriptions(env.RSS_DATA, session.userId);
      if (!subs.some((s) => s.feedHash === feedHash)) {
        return NextResponse.json({ error: 'Feed not found' }, { status: 404 });
      }
      const articles = await readArticlePage(env.RSS_DATA, feedHash, page);
      return NextResponse.json(articles);
    }

    // デフォルト: 全購読フィードの latest.json をマージして返す
    const articles = await getUserLatestArticles(env.RSS_DATA, session.userId);
    return NextResponse.json(articles);
  });
}
