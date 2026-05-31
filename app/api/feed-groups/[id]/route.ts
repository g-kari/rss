import { NextRequest, NextResponse } from "next/server";
import { withSession, withJsonBody } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import {
  readFeedGroups,
  writeFeedGroups,
  FEED_GROUP_NAME_MAX_LENGTH,
  MAX_FEED_GROUPS_PER_USER,
} from "@/lib/feed-groups";
import { readUserSubscriptions, writeUserSubscriptions } from "@/lib/shared-feed";
import { parseName, isValidSessionId } from "@/lib/validation";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidSessionId(id)) return apiError("Invalid feed group id", 400, { code: "INVALID_ID" });
  return withJsonBody<{
    name?: unknown;
    order?: unknown;
    collapsed?: unknown;
    muted?: unknown;
  }>(request, async ({ body, session, env }) => {
    const groups = await readFeedGroups(env.RSS_DATA, session.userId);
    const group = groups.find((g) => g.id === id);
    if (!group) return apiError("Feed group not found", 404, { code: "FEED_GROUP_NOT_FOUND" });

    if ("name" in body) {
      const nameResult = parseName(body.name, FEED_GROUP_NAME_MAX_LENGTH);
      if (!nameResult.ok)
        return apiError(nameResult.message, nameResult.status, { code: nameResult.code });
      const { name } = nameResult;
      if (groups.some((g) => g.id !== id && g.name === name)) {
        return apiError("name already exists", 409, { code: "DUPLICATE_NAME" });
      }
      group.name = name;
    }

    if ("order" in body) {
      // defense-in-depth: 整数だけでなく非負 + MAX_FEED_GROUPS_PER_USER 以下に制限。
      // Number.MIN_SAFE_INTEGER / Number.MAX_SAFE_INTEGER 等を送ると sortByOrder 順序や
      // feeds/import の `++maxOrder` 初期化が破壊される。
      if (
        typeof body.order !== "number" ||
        !Number.isInteger(body.order) ||
        body.order < 0 ||
        body.order > MAX_FEED_GROUPS_PER_USER
      ) {
        return apiError(
          `order must be a non-negative integer within ${MAX_FEED_GROUPS_PER_USER}`,
          400,
          { code: "INVALID_ORDER" },
        );
      }
      group.order = body.order;
    }

    if ("collapsed" in body) {
      if (typeof body.collapsed !== "boolean") {
        return apiError("collapsed must be a boolean", 400, { code: "INVALID_COLLAPSED" });
      }
      group.collapsed = body.collapsed;
    }

    if ("muted" in body) {
      if (typeof body.muted !== "boolean") {
        return apiError("muted must be a boolean", 400, { code: "INVALID_MUTED" });
      }
      group.muted = body.muted;
    }

    await writeFeedGroups(env.RSS_DATA, session.userId, groups);
    return NextResponse.json(group);
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidSessionId(id)) return apiError("Invalid feed group id", 400, { code: "INVALID_ID" });
  return withSession(request, async ({ session, env }) => {
    const groups = await readFeedGroups(env.RSS_DATA, session.userId);
    if (!groups.some((g) => g.id === id)) {
      return apiError("Feed group not found", 404, { code: "FEED_GROUP_NOT_FOUND" });
    }

    // 1. 先にグループを削除（R2 にトランザクションがないため、途中失敗時の不整合方向を
    //    「グループは消えたが purchased.groupId が残る = orphan 参照」に寄せる。
    //    orphan 側はクライアントの groups 読み込みで無害に無視できる）
    await writeFeedGroups(
      env.RSS_DATA,
      session.userId,
      groups.filter((g) => g.id !== id),
    );

    // 2. 所属購読の groupId をクリア
    const subs = await readUserSubscriptions(env.RSS_DATA, session.userId);
    const affected = subs.filter((s) => s.groupId === id);
    if (affected.length > 0) {
      for (const sub of affected) delete sub.groupId;
      await writeUserSubscriptions(env.RSS_DATA, session.userId, subs);
    }
    return NextResponse.json({ ok: true });
  });
}
