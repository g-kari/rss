import { r2Get, r2Put } from "@/lib/r2";
import type { Collection } from "@/types";

export const MAX_COLLECTIONS_PER_USER = 50;
export const COLLECTION_NAME_MAX_LENGTH = 50;

export function collectionsKey(userId: string): string {
  return `users/${userId}/collections.json`;
}

export async function readCollections(bucket: R2Bucket, userId: string): Promise<Collection[]> {
  return r2Get<Collection[]>(bucket, collectionsKey(userId), []);
}

export async function writeCollections(
  bucket: R2Bucket,
  userId: string,
  collections: Collection[],
): Promise<void> {
  await r2Put(bucket, collectionsKey(userId), collections);
}
