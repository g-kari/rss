import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/server-auth';
import { r2Get } from '@/lib/r2';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Feed } from '@/types';


function buildOpml(feeds: Feed[]): string {
  const outlines = feeds
    .map((f) => {
      const title = f.title.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const xmlUrl = f.url.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      const htmlUrl = f.siteUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      return `    <outline text="${title}" title="${title}" type="rss" xmlUrl="${xmlUrl}" htmlUrl="${htmlUrl}"/>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>RSS Reader Feeds</title>\n  </head>\n  <body>\n${outlines}\n  </body>\n</opml>`;
}

export async function GET() {
  const result = await requireSession();
  if ('error' in result) return result.error;
  const { session } = result;
  const { env } = await getCloudflareContext({ async: true });

  const feeds = await r2Get<Feed[]>(env.RSS_DATA, `users/${session.userId}/feeds.json`, []);
  const opml = buildOpml(feeds);

  return new NextResponse(opml, {
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'Content-Disposition': 'attachment; filename="feeds.opml"',
    },
  });
}
