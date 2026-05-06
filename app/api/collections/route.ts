import { NextRequest, NextResponse } from "next/server";
import { withSession, withJsonBody } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import {
  readCollections,
  writeCollections,
  MAX_COLLECTIONS_PER_USER,
  COLLECTION_NAME_MAX_LENGTH,
} from "@/lib/collections";
import { parseName } from "@/lib/validation";
import type { Collection } from "@/types";

export async function GET(request: NextRequest) {
  return withSession(request, async ({ session, env }) => {
    const collections = await readCollections(env.RSS_DATA, session.userId);
    collections.sort((a, b) => a.order - b.order);
    return NextResponse.json(collections);
  });
}

export async function POST(request: NextRequest) {
  return withJsonBody<{ name?: unknown }>(request, async ({ body, session, env }) => {
    const nameResult = parseName(body.name, COLLECTION_NAME_MAX_LENGTH);
    if (!nameResult.ok) return nameResult.error;
    const { name } = nameResult;

    const collections = await readCollections(env.RSS_DATA, session.userId);
    if (collections.length >= MAX_COLLECTIONS_PER_USER) {
      return apiError("collection limit exceeded", 409, {
        code: "COLLECTION_LIMIT_EXCEEDED",
      });
    }
    if (collections.some((c) => c.name === name)) {
      return apiError("name already exists", 409, { code: "DUPLICATE_NAME" });
    }

    const nextOrder = collections.reduce((max, c) => Math.max(max, c.order), -1) + 1;
    const collection: Collection = {
      id: crypto.randomUUID(),
      name,
      articleIds: [],
      createdAt: new Date().toISOString(),
      order: nextOrder,
    };

    collections.push(collection);
    await writeCollections(env.RSS_DATA, session.userId, collections);

    return NextResponse.json(collection, { status: 201 });
  });
}
