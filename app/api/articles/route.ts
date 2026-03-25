import { NextRequest, NextResponse } from 'next/server';
import { withSession } from '@/lib/server-auth';
import { getUserLatestArticles, readArticlePage, readLatestArticles, readUserSubscriptions } from '@/lib/shared-feed';

export async function GET(request: NextRequest) {
  return withSession(async ({ session, env }) => {
    const { searchParams } = new URL(request.url);
    const feedHash = searchParams.get('feed');
    const page = parseInt(searchParams.get('page') ?? '1', 10);

    // フィード指定: 購読チェックと記事取得を並列実行
    if (feedHash) {
      const fetchArticles = page >= 2
        ? readArticlePage(env.RSS_DATA, feedHash, page)
        : readLatestArticles(env.RSS_DATA, feedHash);
      const [subs, articles] = await Promise.all([
        readUserSubscriptions(env.RSS_DATA, session.userId),
        fetchArticles,
      ]);
      if (!subs.some((s) => s.feedHash === feedHash)) {
        return NextResponse.json({ error: 'Feed not found' }, { status: 404 });
      }
      return NextResponse.json(articles);
    }

    // デフォルト: 全購読フィードの latest.json をマージして返す
    const articles = await getUserLatestArticles(env.RSS_DATA, session.userId);
    return NextResponse.json(articles);
  });
}
