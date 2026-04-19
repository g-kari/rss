import { NextRequest, NextResponse } from "next/server";
import { withSession, parseJsonBody } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import {
  readFeedGroups,
  writeFeedGroups,
  MAX_FEED_GROUPS_PER_USER,
  FEED_GROUP_NAME_MAX_LENGTH,
} from "@/lib/feed-groups";
import { stripControlChars } from "@/lib/validation";
import type { FeedGroup } from "@/types";

export async function GET(request: NextRequest) {
  return withSession(request, async ({ session, env }) => {
    const groups = await readFeedGroups(env.RSS_DATA, session.userId);
    groups.sort((a, b) => a.order - b.order);
    return NextResponse.json(groups);
  });
}

export async function POST(request: NextRequest) {
  return withSession(request, async ({ session, env }) => {
    const parsed = await parseJsonBody<{ name?: unknown }>(request);
    if (!parsed.ok) return parsed.error;

    const rawName = parsed.data.name;
    if (typeof rawName !== "string") {
      return apiError("name must be a string", 400, { code: "INVALID_NAME" });
    }
    const name = stripControlChars(rawName.trim());
    if (!name) return apiError("name must be a non-empty string", 400, { code: "INVALID_NAME" });
    if (name.length > FEED_GROUP_NAME_MAX_LENGTH) {
      return apiError("name too long", 400, { code: "INVALID_NAME" });
    }

    const groups = await readFeedGroups(env.RSS_DATA, session.userId);
    if (groups.length >= MAX_FEED_GROUPS_PER_USER) {
      return apiError("feed group limit exceeded", 409, {
        code: "FEED_GROUP_LIMIT_EXCEEDED",
      });
    }
    if (groups.some((g) => g.name === name)) {
      return apiError("name already exists", 409, { code: "DUPLICATE_NAME" });
    }

    const nextOrder = groups.reduce((max, g) => Math.max(max, g.order), -1) + 1;
    const group: FeedGroup = {
      id: crypto.randomUUID(),
      name,
      order: nextOrder,
      createdAt: new Date().toISOString(),
    };

    groups.push(group);
    await writeFeedGroups(env.RSS_DATA, session.userId, groups);

    return NextResponse.json(group, { status: 201 });
  });
}
