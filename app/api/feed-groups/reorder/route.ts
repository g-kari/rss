import { NextRequest, NextResponse } from "next/server";
import { withJsonBody, applyCooldown } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import { readFeedGroups, writeFeedGroups } from "@/lib/feed-groups";
import { feedGroupsWriteCooldownKey } from "@/lib/r2";
import { sortByOrder } from "@/lib/sort-utils";

const FEED_GROUPS_WRITE_COOLDOWN_MS = 2_000;

export async function POST(request: NextRequest) {
  return withJsonBody<{ orderedIds?: unknown }>(request, async ({ body, session, env }) => {
    const limited = await applyCooldown(
      env.RATE_LIMIT,
      feedGroupsWriteCooldownKey(session.userId),
      FEED_GROUPS_WRITE_COOLDOWN_MS,
    );
    if (limited) return limited;

    const { orderedIds } = body;
    if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== "string")) {
      return apiError("orderedIds must be a string array", 400, { code: "INVALID_ORDERED_IDS" });
    }

    const groups = await readFeedGroups(env.RSS_DATA, session.userId);

    // orderedIds と既存グループの ID 集合が完全一致するか検証
    const existingIds = new Set<string>();
    for (const group of groups) existingIds.add(group.id);
    const providedIds = new Set(orderedIds as string[]);

    if (existingIds.size !== providedIds.size) {
      return apiError("orderedIds must contain exactly all group IDs", 400, {
        code: "INVALID_ORDERED_IDS",
      });
    }
    for (const id of orderedIds as string[]) {
      if (!existingIds.has(id)) {
        return apiError(`unknown group ID: ${id}`, 400, { code: "INVALID_ORDERED_IDS" });
      }
    }

    // orderedIds の順番に合わせて order を振り直す
    const orderMap = new Map<string, number>();
    (orderedIds as string[]).forEach((id, idx) => orderMap.set(id, idx));

    for (const group of groups) {
      group.order = orderMap.get(group.id)!;
    }

    await writeFeedGroups(env.RSS_DATA, session.userId, groups);
    return NextResponse.json(sortByOrder(groups));
  });
}
