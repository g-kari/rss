import { NextRequest, NextResponse } from "next/server";
import { withSession, withJsonBody } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import { purgeFeedsCache } from "@/lib/cache-helper";
import {
  readUserSubscriptions,
  writeUserSubscriptions,
  readFeedMeta,
  assembleClientFeed,
  FEED_USER_MAP_CACHE_KEY,
} from "@/lib/shared-feed";
import { parseKeywordFilter } from "@/lib/keyword-filter";
import { readFeedGroups } from "@/lib/feed-groups";
import { stripControlChars, isValidIso8601, isValidFeedHash } from "@/lib/validation";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: feedHash } = await params;
  if (!isValidFeedHash(feedHash)) {
    return apiError("Invalid feed", 400, { code: "INVALID_FEED" });
  }
  return withSession(request, async ({ session, env, ctx }) => {
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
    // フィード削除時に feedUserMap KV キャッシュを無効化
    await env.RATE_LIMIT.delete(FEED_USER_MAP_CACHE_KEY);
    const origin = new URL(request.url).origin;
    await purgeFeedsCache(origin, session.userId, ctx);
    return NextResponse.json({ ok: true });
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: feedHash } = await params;
  if (!isValidFeedHash(feedHash)) {
    return apiError("Invalid feed", 400, { code: "INVALID_FEED" });
  }
  return withJsonBody<{
    title?: unknown;
    filter?: unknown;
    nsfw?: unknown;
    priority?: unknown;
    category?: unknown;
    groupId?: unknown;
    mutedUntil?: unknown;
    view?: unknown;
    digestLimit?: unknown;
  }>(request, async ({ body, session, env, ctx }) => {
    // subscriptions と meta を並列で読み込む（独立しているため）
    // groupId が含まれる場合は feed-groups も同時に取得する
    const hasGroupId = "groupId" in body && body.groupId !== null;
    const [subs, meta, groups] = await Promise.all([
      readUserSubscriptions(env.RSS_DATA, session.userId),
      readFeedMeta(env.RSS_DATA, feedHash),
      hasGroupId ? readFeedGroups(env.RSS_DATA, session.userId) : Promise.resolve(null),
    ]);

    const sub = subs.find((s) => s.feedHash === feedHash);
    if (!sub) return apiError("Feed not found", 404, { code: "FEED_NOT_FOUND" });
    if (!meta) return apiError("Feed not found", 404, { code: "FEED_NOT_FOUND" });

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
        // groups は上の Promise.all で取得済み（hasGroupId=true のため null にはならない）
        if (!groups || !groups.some((g) => g.id === body.groupId)) {
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

    if ("digestLimit" in body) {
      if (body.digestLimit === null) {
        delete sub.digestLimit;
      } else if (
        typeof body.digestLimit !== "number" ||
        !Number.isInteger(body.digestLimit) ||
        body.digestLimit < 0 ||
        body.digestLimit > 100
      ) {
        return apiError("digestLimit must be an integer between 0 and 100, or null", 400, {
          code: "INVALID_DIGEST_LIMIT",
        });
      } else {
        sub.digestLimit = body.digestLimit;
      }
    }

    await writeUserSubscriptions(env.RSS_DATA, session.userId, subs);

    const origin = new URL(request.url).origin;
    await purgeFeedsCache(origin, session.userId, ctx);

    return NextResponse.json(assembleClientFeed(meta, sub));
  });
}
