import { NextRequest, NextResponse } from "next/server";
import { withSession, parseJsonBody } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import {
  readUserSubscriptions,
  writeUserSubscriptions,
  readFeedMeta,
  assembleClientFeed,
} from "@/lib/shared-feed";
import { parseKeywordFilter } from "@/lib/keyword-filter";
import { readFeedGroups } from "@/lib/feed-groups";
import { stripControlChars, isValidIso8601 } from "@/lib/validation";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: feedHash } = await params;
  return withSession(request, async ({ session, env }) => {
    const subs = await readUserSubscriptions(env.RSS_DATA, session.userId);
    if (!subs.some((s) => s.feedHash === feedHash)) {
      return apiError("Feed not found", 404, { code: "FEED_NOT_FOUND" });
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
  return withSession(request, async ({ session, env }) => {
    const parsed = await parseJsonBody<{
      title?: unknown;
      filter?: unknown;
      nsfw?: unknown;
      priority?: unknown;
      category?: unknown;
      groupId?: unknown;
      mutedUntil?: unknown;
      view?: unknown;
    }>(request);
    if (!parsed.ok) return parsed.error;
    const body = parsed.data;

    const subs = await readUserSubscriptions(env.RSS_DATA, session.userId);
    const sub = subs.find((s) => s.feedHash === feedHash);
    if (!sub) return apiError("Feed not found", 404, { code: "FEED_NOT_FOUND" });

    if ("title" in body) {
      const title = typeof body.title === "string" ? stripControlChars(body.title.trim()) : "";
      if (!title)
        return apiError("title must be a non-empty string", 400, { code: "INVALID_TITLE" });
      if (title.length > 200) return apiError("title too long", 400, { code: "INVALID_TITLE" });
      sub.customTitle = title;
    }

    if ("filter" in body) {
      if (body.filter === null) {
        delete sub.filter;
      } else {
        const filter = parseKeywordFilter(body.filter);
        if (!filter)
          return apiError("filter must have include and exclude arrays", 400, {
            code: "INVALID_FILTER",
          });
        sub.filter = filter;
      }
    }

    if ("nsfw" in body) {
      if (typeof body.nsfw !== "boolean")
        return apiError("nsfw must be a boolean", 400, { code: "INVALID_NSFW" });
      sub.nsfw = body.nsfw;
    }

    if ("priority" in body) {
      if (body.priority !== "high" && body.priority !== null)
        return apiError("priority must be 'high' or null", 400, { code: "INVALID_PRIORITY" });
      if (body.priority === null) delete sub.priority;
      else sub.priority = "high";
    }

    if ("category" in body) {
      if (body.category === null) {
        delete sub.category;
      } else if (typeof body.category !== "string") {
        return apiError("category must be a string or null", 400, { code: "INVALID_CATEGORY" });
      } else {
        // 制御文字を除去してからバリデーション
        const category = stripControlChars(body.category.trim());
        if (category.length > 50)
          return apiError("category too long", 400, { code: "INVALID_CATEGORY" });
        if (category) sub.category = category;
        else delete sub.category;
      }
    }

    if ("groupId" in body) {
      if (body.groupId === null) {
        delete sub.groupId;
      } else if (typeof body.groupId !== "string") {
        return apiError("groupId must be a string or null", 400, { code: "INVALID_GROUP_ID" });
      } else {
        const groups = await readFeedGroups(env.RSS_DATA, session.userId);
        if (!groups.some((g) => g.id === body.groupId)) {
          return apiError("Feed group not found", 404, { code: "FEED_GROUP_NOT_FOUND" });
        }
        sub.groupId = body.groupId;
      }
    }

    if ("mutedUntil" in body) {
      if (body.mutedUntil === null) {
        delete sub.mutedUntil;
      } else if (typeof body.mutedUntil !== "string") {
        return apiError("mutedUntil must be an ISO string or null", 400, {
          code: "INVALID_MUTED_UNTIL",
        });
      } else if (!isValidIso8601(body.mutedUntil)) {
        return apiError("mutedUntil must be an ISO 8601 string or null", 400, {
          code: "INVALID_MUTED_UNTIL",
        });
      } else {
        sub.mutedUntil = body.mutedUntil;
      }
    }

    if ("view" in body) {
      if (body.view === null) {
        delete sub.view;
      } else if (
        body.view !== "articles" &&
        body.view !== "pictures" &&
        body.view !== "videos" &&
        body.view !== "social"
      ) {
        return apiError("view must be 'articles' | 'pictures' | 'videos' | 'social' | null", 400, {
          code: "INVALID_VIEW",
        });
      } else {
        sub.view = body.view;
      }
    }

    // meta の存在確認を書き込み前に行う（書き込み後に404を返すと状態が乖離するため）
    const meta = await readFeedMeta(env.RSS_DATA, feedHash);
    if (!meta) return apiError("Feed not found", 404, { code: "FEED_NOT_FOUND" });

    await writeUserSubscriptions(env.RSS_DATA, session.userId, subs);

    return NextResponse.json(assembleClientFeed(meta, sub));
  });
}
