import { NextRequest, NextResponse } from "next/server";
import { withSession, withJsonBody } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import {
  readCollections,
  writeCollections,
  COLLECTION_NAME_MAX_LENGTH,
  MAX_ARTICLES_PER_COLLECTION,
  MAX_COLLECTIONS_PER_USER,
} from "@/lib/collections";
import { isValidSessionId, parseName, extractIds } from "@/lib/validation";

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
      // defense-in-depth: 整数だけでなく非負 + MAX_COLLECTIONS_PER_USER 以下に制限。
      // Number.MIN_SAFE_INTEGER / Number.MAX_SAFE_INTEGER 等を送ると sort 順序が破壊される。
      if (
        typeof body.order !== "number" ||
        !Number.isInteger(body.order) ||
        body.order < 0 ||
        body.order > MAX_COLLECTIONS_PER_USER
      ) {
        return apiError(
          `order must be a non-negative integer within ${MAX_COLLECTIONS_PER_USER}`,
          400,
          { code: "INVALID_ORDER" },
        );
      }
      collection.order = body.order;
    }

    if ("addArticleIds" in body) {
      // defense-in-depth: extractIds で MAX_ID_LENGTH (128) を per-element 強制し、
      // 巨大 ID 文字列 (1 件 500B 等) で R2 オブジェクトを膨張させる自己 DoS を防止。
      // read-state route の canonical pattern と整合。
      const addIds = extractIds(body.addArticleIds, MAX_ARTICLES_PER_COLLECTION);
      if (addIds === null) {
        return apiError("addArticleIds must be a valid string array", 400, {
          code: "INVALID_ARTICLE_IDS",
        });
      }
      const existing = new Set(collection.articleIds);
      for (const aid of addIds) {
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
      const removeIds = extractIds(body.removeArticleIds, MAX_ARTICLES_PER_COLLECTION);
      if (removeIds === null) {
        return apiError("removeArticleIds must be a valid string array", 400, {
          code: "INVALID_ARTICLE_IDS",
        });
      }
      const toRemove = new Set(removeIds);
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
