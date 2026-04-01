import { NextRequest, NextResponse } from "next/server";
import { withSession, parseJsonBody } from "@/lib/server-auth";
import {
  readUserSubscriptions,
  writeUserSubscriptions,
  readFeedMeta,
  assembleClientFeed,
} from "@/lib/shared-feed";
import { parseKeywordFilter } from "@/lib/keyword-filter";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: feedHash } = await params;
  return withSession(async ({ session, env }) => {
    const subs = await readUserSubscriptions(env.RSS_DATA, session.userId);
    if (!subs.some((s) => s.feedHash === feedHash)) {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }
    // 購読から削除するだけ（共有フィードデータは残す）
    await writeUserSubscriptions(
      env.RSS_DATA,
      session.userId,
      subs.filter((s) => s.feedHash !== feedHash),
    );
    return NextResponse.json({ ok: true });
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: feedHash } = await params;
  return withSession(async ({ session, env }) => {
    const parsed = await parseJsonBody<{ title?: unknown; filter?: unknown; nsfw?: unknown }>(
      request,
    );
    if (!parsed.ok) return parsed.error;
    const body = parsed.data;

    const subs = await readUserSubscriptions(env.RSS_DATA, session.userId);
    const sub = subs.find((s) => s.feedHash === feedHash);
    if (!sub) return NextResponse.json({ error: "Feed not found" }, { status: 404 });

    // title の更新（存在する場合のみ）
    if ("title" in body) {
      if (typeof body?.title !== "string")
        return NextResponse.json({ error: "title must be a string" }, { status: 400 });
      const title = body.title.trim();
      if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
      if (title.length > 200)
        return NextResponse.json({ error: "title too long" }, { status: 400 });
      sub.customTitle = title;
    }

    // filter の更新（存在する場合のみ）
    if ("filter" in body) {
      if (body.filter === null) {
        delete sub.filter;
      } else {
        const filter = parseKeywordFilter(body.filter);
        if (!filter) {
          return NextResponse.json(
            { error: "filter must have include and exclude arrays" },
            { status: 400 },
          );
        }
        sub.filter = filter;
      }
    }

    // nsfw の更新（存在する場合のみ）
    if ("nsfw" in body) {
      if (typeof body.nsfw !== "boolean")
        return NextResponse.json({ error: "nsfw must be a boolean" }, { status: 400 });
      sub.nsfw = body.nsfw;
    }

    await writeUserSubscriptions(env.RSS_DATA, session.userId, subs);

    const meta = await readFeedMeta(env.RSS_DATA, feedHash);
    if (!meta) return NextResponse.json({ error: "Feed not found" }, { status: 404 });

    return NextResponse.json(assembleClientFeed(meta, sub));
  });
}
