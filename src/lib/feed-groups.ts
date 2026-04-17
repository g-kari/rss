import { r2Get, r2Put } from "@/lib/r2";
import type { FeedGroup } from "@/types";

export const MAX_FEED_GROUPS_PER_USER = 100;
export const FEED_GROUP_NAME_MAX_LENGTH = 50;

export function feedGroupsKey(userId: string): string {
  return `users/${userId}/feed-groups.json`;
}

export async function readFeedGroups(bucket: R2Bucket, userId: string): Promise<FeedGroup[]> {
  return r2Get<FeedGroup[]>(bucket, feedGroupsKey(userId), []);
}

export async function writeFeedGroups(
  bucket: R2Bucket,
  userId: string,
  groups: FeedGroup[],
): Promise<void> {
  await r2Put(bucket, feedGroupsKey(userId), groups);
}
