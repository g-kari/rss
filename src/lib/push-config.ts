import type { PushConfig, UserProfile } from "../types";
import { r2Get, userKey, userPushKey } from "./r2";

/** Bind queued client work to the displayed account, including after auth recovery.
 * UserProfile.id is not necessarily the JWT sub used for the storage path.
 */
export async function matchesPushAccount(
  bucket: R2Bucket,
  userId: string,
  expectedId: string | null,
): Promise<boolean> {
  if (!expectedId || expectedId.length > 256) return false;
  const profile = await r2Get<UserProfile | null>(bucket, userKey(userId, "profile.json"), null);
  return expectedId === (profile?.id ?? userId);
}

/** ETag compare-and-swap: callbacks must be pure because contention can retry them. */
export async function updatePushConfig(
  bucket: R2Bucket,
  userId: string,
  change: (config: PushConfig) => PushConfig,
): Promise<PushConfig> {
  const key = userPushKey(userId);
  for (let attempt = 0; attempt < 5; attempt++) {
    const object = await bucket.get(key);
    const config = object ? await object.json<PushConfig>() : { subscriptions: [] };
    const next = change(config);
    const saved = await bucket.put(key, JSON.stringify(next), {
      onlyIf: object ? { etagMatches: object.etag } : { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/json" },
    });
    if (saved) return next;
  }
  throw new Error("Push configuration changed concurrently; retry the request");
}

/** Remove only the expired endpoints, preserving concurrent preferences/new subscriptions. */
export async function removeExpiredPushSubscriptions(
  bucket: R2Bucket,
  userId: string,
  endpoints: string[],
): Promise<void> {
  if (!endpoints.length) return;
  const gone = new Set(endpoints);
  await updatePushConfig(bucket, userId, (config) => ({
    ...config,
    subscriptions: config.subscriptions.filter((sub) => !gone.has(sub.endpoint)),
  }));
}
