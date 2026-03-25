import { NextResponse } from 'next/server';
import { withSession } from '@/lib/server-auth';
import { getUserFeeds } from '@/lib/shared-feed';
import type { Feed } from '@/types';

/** XML 属性値に使用できない文字をエスケープする */
function escapeXmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildOpml(feeds: Feed[]): string {
  const outlines = feeds
    .map((f) => {
      const title = escapeXmlAttr(f.title);
      const xmlUrl = escapeXmlAttr(f.url);
      const htmlUrl = escapeXmlAttr(f.siteUrl);
      return `    <outline text="${title}" title="${title}" type="rss" xmlUrl="${xmlUrl}" htmlUrl="${htmlUrl}"/>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>RSS Reader Feeds</title>\n  </head>\n  <body>\n${outlines}\n  </body>\n</opml>`;
}

export async function GET() {
  return withSession(async ({ session, env }) => {
    const feeds = await getUserFeeds(env.RSS_DATA, session.userId);
    const opml = buildOpml(feeds);

    return new NextResponse(opml, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Content-Disposition': 'attachment; filename="feeds.opml"',
      },
    });
  });
}
