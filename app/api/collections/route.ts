import { NextRequest, NextResponse } from "next/server";
import { withSession, parseJsonBody } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import {
  readCollections,
  writeCollections,
  MAX_COLLECTIONS_PER_USER,
  COLLECTION_NAME_MAX_LENGTH,
} from "@/lib/collections";
import { stripControlChars } from "@/lib/validation";
import type { Collection } from "@/types";

export async function GET(request: NextRequest) {
  return withSession(request, async ({ session, env }) => {
    const collections = await readCollections(env.RSS_DATA, session.userId);
    collections.sort((a, b) => a.order - b.order);
    return NextResponse.json(collections);
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
    if (name.length > COLLECTION_NAME_MAX_LENGTH) {
      return apiError("name too long", 400, { code: "INVALID_NAME" });
    }

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
