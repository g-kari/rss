import { NextRequest, NextResponse } from "next/server";
import { withSession, parseJsonBody } from "@/lib/server-auth";
import {
  readUserSubscriptions,
  writeUserSubscriptions,
  readFeedMeta,
  assembleClientFeed,
} from "@/lib/shared-feed";
import { parseKeywordFilter } from "@/lib/keyword-filter";
import { stripControlChars, isValidIso8601 } from "@/lib/validation";

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
    const parsed = await parseJsonBody<{
      title?: unknown;
      filter?: unknown;
      nsfw?: unknown;
      priority?: unknown;
      category?: unknown;
      mutedUntil?: unknown;
    }>(request);
    if (!parsed.ok) return parsed.error;
    const body = parsed.data;

    const subs = await readUserSubscriptions(env.RSS_DATA, session.userId);
    const sub = subs.find((s) => s.feedHash === feedHash);
    if (!sub) return NextResponse.json({ error: "Feed not found" }, { status: 404 });

    if ("title" in body) {
      const title = typeof body.title === "string" ? stripControlChars(body.title.trim()) : "";
      if (!title)
        return NextResponse.json({ error: "title must be a non-empty string" }, { status: 400 });
      if (title.length > 200)
        return NextResponse.json({ error: "title too long" }, { status: 400 });
      sub.customTitle = title;
    }

    if ("filter" in body) {
      if (body.filter === null) {
        delete sub.filter;
      } else {
        const filter = parseKeywordFilter(body.filter);
        if (!filter)
          return NextResponse.json(
            { error: "filter must have include and exclude arrays" },
            { status: 400 },
          );
        sub.filter = filter;
      }
    }

    if ("nsfw" in body) {
      if (typeof body.nsfw !== "boolean")
        return NextResponse.json({ error: "nsfw must be a boolean" }, { status: 400 });
      sub.nsfw = body.nsfw;
    }

    if ("priority" in body) {
      if (body.priority !== "high" && body.priority !== null)
        return NextResponse.json({ error: "priority must be 'high' or null" }, { status: 400 });
      if (body.priority === null) delete sub.priority;
      else sub.priority = "high";
    }

    if ("category" in body) {
      if (body.category === null) {
        delete sub.category;
      } else if (typeof body.category !== "string") {
        return NextResponse.json({ error: "category must be a string or null" }, { status: 400 });
      } else {
        // 制御文字を除去してからバリデーション
        const category = stripControlChars(body.category.trim());
        if (category.length > 50)
          return NextResponse.json({ error: "category too long" }, { status: 400 });
        if (category) sub.category = category;
        else delete sub.category;
      }
    }

    if ("mutedUntil" in body) {
      if (body.mutedUntil === null) {
        delete sub.mutedUntil;
      } else if (typeof body.mutedUntil !== "string") {
        return NextResponse.json(
          { error: "mutedUntil must be an ISO string or null" },
          { status: 400 },
        );
      } else if (!isValidIso8601(body.mutedUntil)) {
        return NextResponse.json(
          { error: "mutedUntil must be an ISO 8601 string or null" },
          { status: 400 },
        );
      } else {
        sub.mutedUntil = body.mutedUntil;
      }
    }

    // meta の存在確認を書き込み前に行う（書き込み後に404を返すと状態が乖離するため）
    const meta = await readFeedMeta(env.RSS_DATA, feedHash);
    if (!meta) return NextResponse.json({ error: "Feed not found" }, { status: 404 });

    await writeUserSubscriptions(env.RSS_DATA, session.userId, subs);

    return NextResponse.json(assembleClientFeed(meta, sub));
  });
}
