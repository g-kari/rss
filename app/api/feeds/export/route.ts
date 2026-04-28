import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { getUserFeeds } from "@/lib/shared-feed";
import { readFeedGroups } from "@/lib/feed-groups";
import { buildOpml } from "@/lib/opml";

export async function GET(request: Request) {
  return withSession(request, async ({ session, env }) => {
    const [feeds, groups] = await Promise.all([
      getUserFeeds(env.RSS_DATA, session.userId),
      readFeedGroups(env.RSS_DATA, session.userId),
    ]);
    const opml = buildOpml(feeds, groups);

    return new NextResponse(opml, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "Content-Disposition": 'attachment; filename="feeds.opml"',
      },
    });
  });
}
