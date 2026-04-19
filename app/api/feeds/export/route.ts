import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { getUserFeeds } from "@/lib/shared-feed";
import { escapeHtml } from "@/lib/html";
import type { Feed } from "@/types";

function buildOpml(feeds: Feed[]): string {
  const outlines = feeds
    .map((f) => {
      const title = escapeHtml(f.title);
      const xmlUrl = escapeHtml(f.url);
      const htmlUrl = escapeHtml(f.siteUrl);
      return `    <outline text="${title}" title="${title}" type="rss" xmlUrl="${xmlUrl}" htmlUrl="${htmlUrl}"/>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>RSS Reader Feeds</title>\n  </head>\n  <body>\n${outlines}\n  </body>\n</opml>`;
}

export async function GET(request: Request) {
  return withSession(request, async ({ session, env }) => {
    const feeds = await getUserFeeds(env.RSS_DATA, session.userId);
    const opml = buildOpml(feeds);

    return new NextResponse(opml, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "Content-Disposition": 'attachment; filename="feeds.opml"',
      },
    });
  });
}
