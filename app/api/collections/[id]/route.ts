import { NextRequest, NextResponse } from "next/server";
import { withSession, withJsonBody } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import {
  readCollections,
  writeCollections,
  COLLECTION_NAME_MAX_LENGTH,
  MAX_ARTICLES_PER_COLLECTION,
} from "@/lib/collections";
import { isValidSessionId, parseName } from "@/lib/validation";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidSessionId(id)) {
    return apiError("Invalid collection id", 400, { code: "INVALID_ID" });
  }
  return withJsonBody<{
    name?: unknown;
    order?: unknown;
    addArticleIds?: unknown;
    removeArticleIds?: unknown;
  }>(request, async ({ body, session, env }) => {
    const collections = await readCollections(env.RSS_DATA, session.userId);
    const collection = collections.find((c) => c.id === id);
    if (!collection) return apiError("Collection not found", 404, { code: "COLLECTION_NOT_FOUND" });

    if ("name" in body) {
      const nameResult = parseName(body.name, COLLECTION_NAME_MAX_LENGTH);
      if (!nameResult.ok)
        return apiError(nameResult.message, nameResult.status, { code: nameResult.code });
      const { name } = nameResult;
      if (collections.some((c) => c.id !== id && c.name === name)) {
        return apiError("name already exists", 409, { code: "DUPLICATE_NAME" });
      }
      collection.name = name;
    }

    if ("order" in body) {
      if (typeof body.order !== "number" || !Number.isInteger(body.order)) {
        return apiError("order must be an integer", 400, { code: "INVALID_ORDER" });
      }
      collection.order = body.order;
    }

    if ("addArticleIds" in body) {
      if (
        !Array.isArray(body.addArticleIds) ||
        !body.addArticleIds.every((v) => typeof v === "string")
      ) {
        return apiError("addArticleIds must be a string array", 400, {
          code: "INVALID_ARTICLE_IDS",
        });
      }
      const existing = new Set(collection.articleIds);
      for (const aid of body.addArticleIds as string[]) {
        if (!existing.has(aid)) {
          collection.articleIds.push(aid);
          existing.add(aid);
        }
      }
      // security 監査 45th cycle (#1, confidence 87%): 認証ユーザーが
      // 連続 PATCH で R2 オブジェクトを無制限に膨張させる自己 DoS を防止。
      if (collection.articleIds.length > MAX_ARTICLES_PER_COLLECTION) {
        return apiError(
          `コレクション記事の上限（${MAX_ARTICLES_PER_COLLECTION}件）に達しました`,
          422,
          { code: "COLLECTION_ARTICLE_LIMIT_REACHED" },
        );
      }
    }

    if ("removeArticleIds" in body) {
      if (
        !Array.isArray(body.removeArticleIds) ||
        !body.removeArticleIds.every((v) => typeof v === "string")
      ) {
        return apiError("removeArticleIds must be a string array", 400, {
          code: "INVALID_ARTICLE_IDS",
        });
      }
      const toRemove = new Set(body.removeArticleIds as string[]);
      collection.articleIds = collection.articleIds.filter((aid) => !toRemove.has(aid));
    }

    await writeCollections(env.RSS_DATA, session.userId, collections);
    return NextResponse.json(collection);
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidSessionId(id)) {
    return apiError("Invalid collection id", 400, { code: "INVALID_ID" });
  }
  return withSession(request, async ({ session, env }) => {
    const collections = await readCollections(env.RSS_DATA, session.userId);
    if (!collections.some((c) => c.id === id)) {
      return apiError("Collection not found", 404, { code: "COLLECTION_NOT_FOUND" });
    }

    await writeCollections(
      env.RSS_DATA,
      session.userId,
      collections.filter((c) => c.id !== id),
    );
    return NextResponse.json({ ok: true });
  });
}
