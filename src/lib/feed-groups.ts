import { r2Get, r2Put, userKey } from "@/lib/r2";
import type { FeedGroup } from "@/types";

export const MAX_FEED_GROUPS_PER_USER = 100;
export const FEED_GROUP_NAME_MAX_LENGTH = 50;

/**
@internal production caller 0。同 file の `readFeedGroups` / `writeFeedGroups` が internal caller。
 * `e2e/feed-groups-api.spec.ts` が直接 import して単体検証しているため export は維持する
 * (dead export ではない)。cross-file の production caller が増えない限り、
 * 監査 sweep で dead export として再検出しないこと。
 */
export function feedGroupsKey(userId: string): string {
  return userKey(userId, "feed-groups.json");
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
