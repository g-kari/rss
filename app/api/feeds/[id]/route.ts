import { NextRequest, NextResponse } from "next/server";
import { withSession, parseJsonBody } from "@/lib/server-auth";
import {
  readUserSubscriptions,
  writeUserSubscriptions,
  readFeedMeta,
  assembleClientFeed,
} from "@/lib/shared-feed";

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
    const parsed = await parseJsonBody<{ title?: unknown }>(request);
    if (!parsed.ok) return parsed.error;
    const body = parsed.data;
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
    if (title.length > 200) return NextResponse.json({ error: "title too long" }, { status: 400 });

    const subs = await readUserSubscriptions(env.RSS_DATA, session.userId);
    const sub = subs.find((s) => s.feedHash === feedHash);
    if (!sub) return NextResponse.json({ error: "Feed not found" }, { status: 404 });

    sub.customTitle = title;
    await writeUserSubscriptions(env.RSS_DATA, session.userId, subs);

    const meta = await readFeedMeta(env.RSS_DATA, feedHash);
    if (!meta) return NextResponse.json({ error: "Feed not found" }, { status: 404 });

    return NextResponse.json(assembleClientFeed(meta, sub));
  });
}
