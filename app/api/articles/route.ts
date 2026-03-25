import { NextRequest, NextResponse } from 'next/server';
import { withSession } from '@/lib/server-auth';
import { getUserLatestArticles, readArticlePage, readLatestArticles, readUserSubscriptions } from '@/lib/shared-feed';

export async function GET(request: NextRequest) {
  return withSession(async ({ session, env }) => {
    const { searchParams } = new URL(request.url);
    const feedHash = searchParams.get('feed');
    const page = parseInt(searchParams.get('page') ?? '1', 10);

    // フィード指定: 購読チェックして特定フィードの記事を返す
    if (feedHash) {
      const subs = await readUserSubscriptions(env.RSS_DATA, session.userId);
      if (!subs.some((s) => s.feedHash === feedHash)) {
        return NextResponse.json({ error: 'Feed not found' }, { status: 404 });
      }
      if (page >= 2) {
        const articles = await readArticlePage(env.RSS_DATA, feedHash, page);
        return NextResponse.json(articles);
      }
      const articles = await readLatestArticles(env.RSS_DATA, feedHash);
      return NextResponse.json(articles);
    }

    // デフォルト: 全購読フィードの latest.json をマージして返す
    const articles = await getUserLatestArticles(env.RSS_DATA, session.userId);
    return NextResponse.json(articles);
  });
}
