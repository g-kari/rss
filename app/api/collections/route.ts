import { NextRequest, NextResponse } from "next/server";
import { withSession, withJsonBody, applyCooldown } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import {
  readCollections,
  writeCollections,
  MAX_COLLECTIONS_PER_USER,
  COLLECTION_NAME_MAX_LENGTH,
} from "@/lib/collections";
import { parseName } from "@/lib/validation";
import { computeNextOrder, sortByOrder } from "@/lib/sort-utils";
import { collectionsWriteCooldownKey } from "@/lib/r2";
import type { Collection } from "@/types";

const COLLECTIONS_WRITE_COOLDOWN_MS = 2_000;

export async function GET(request: NextRequest) {
  return withSession(request, async ({ session, env }) => {
    const collections = await readCollections(env.RSS_DATA, session.userId);
    return NextResponse.json(sortByOrder(collections));
  });
}

export async function POST(request: NextRequest) {
  return withJsonBody<{ name?: unknown }>(request, async ({ body, session, env }) => {
    const limited = await applyCooldown(
      env.RATE_LIMIT,
      collectionsWriteCooldownKey(session.userId),
      COLLECTIONS_WRITE_COOLDOWN_MS,
    );
    if (limited) return limited;

    const nameResult = parseName(body.name, COLLECTION_NAME_MAX_LENGTH);
    if (!nameResult.ok)
      return apiError(nameResult.message, nameResult.status, { code: nameResult.code });
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

    const collection: Collection = {
      id: crypto.randomUUID(),
      name,
      articleIds: [],
      createdAt: new Date().toISOString(),
      order: computeNextOrder(collections),
    };

    collections.push(collection);
    await writeCollections(env.RSS_DATA, session.userId, collections);

    return NextResponse.json(collection, { status: 201 });
  });
}
