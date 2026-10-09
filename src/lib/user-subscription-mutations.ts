import type { UserSubscription } from "../types";
import { isValidUserId } from "./validation";
import { userKey } from "./r2";

const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;
const MAX_SUBSCRIPTIONS = 1000;
export class UserSubscriptionMutationError extends Error {
  constructor(
    readonly code:
      | "SUBSCRIPTION_CONFLICT"
      | "SUBSCRIPTION_STORAGE_INVALID"
      | "SUBSCRIPTION_STORAGE_UNAVAILABLE"
      | "SUBSCRIPTION_ARGUMENT_INVALID",
  ) {
    super(code);
    this.name = "UserSubscriptionMutationError";
  }
}

function validSubscriptions(value: unknown): value is UserSubscription[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_SUBSCRIPTIONS &&
    new Set(value.map((entry: UserSubscription) => entry?.feedHash)).size === value.length &&
    value.every(
      (entry: unknown) =>
        typeof entry === "object" &&
        entry !== null &&
        !Array.isArray(entry) &&
        "feedHash" in entry &&
        typeof entry.feedHash === "string" &&
        /^[0-9a-f]{16}$/.test(entry.feedHash) &&
        "url" in entry &&
        typeof entry.url === "string" &&
        entry.url.length > 0 &&
        entry.url.length <= 2048 &&
        "subscribedAt" in entry &&
        typeof entry.subscribedAt === "string" &&
        entry.subscribedAt.length <= 40 &&
        Number.isFinite(Date.parse(entry.subscribedAt)),
    )
  );
}

/** Every production subscription writer must transform a fresh snapshot, never replace a stale one. */
export async function mutateUserSubscriptions<T>(
  bucket: R2Bucket,
  userId: string,
  mutate: (current: UserSubscription[]) => {
    subscriptions: UserSubscription[];
    result: T;
    changed?: boolean;
  },
  options: { beforeCommit?: () => Promise<void>; maxAttempts?: number } = {},
): Promise<T> {
  if (!isValidUserId(userId) || userId === "." || userId === "..")
    throw new UserSubscriptionMutationError("SUBSCRIPTION_ARGUMENT_INVALID");
  const maxAttempts = options.maxAttempts ?? 4;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 8)
    throw new UserSubscriptionMutationError("SUBSCRIPTION_ARGUMENT_INVALID");
  const key = userKey(userId, "subscriptions.json");
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let object: R2ObjectBody | null;
    try {
      object = await bucket.get(key);
    } catch {
      throw new UserSubscriptionMutationError("SUBSCRIPTION_STORAGE_UNAVAILABLE");
    }
    let current: unknown = [];
    if (object) {
      if (!object.etag || object.size > MAX_SNAPSHOT_BYTES)
        throw new UserSubscriptionMutationError("SUBSCRIPTION_STORAGE_INVALID");
      try {
        current = await object.json();
      } catch {
        throw new UserSubscriptionMutationError("SUBSCRIPTION_STORAGE_INVALID");
      }
    }
    if (!validSubscriptions(current))
      throw new UserSubscriptionMutationError("SUBSCRIPTION_STORAGE_INVALID");
    // Callback failures retain their safe domain meaning; storage failures are separately classified.
    const update = mutate(current);
    if (update.changed === false) return update.result;
    if (!validSubscriptions(update.subscriptions))
      throw new UserSubscriptionMutationError("SUBSCRIPTION_ARGUMENT_INVALID");
    const body = JSON.stringify(update.subscriptions);
    if (new TextEncoder().encode(body).byteLength > MAX_SNAPSHOT_BYTES)
      throw new UserSubscriptionMutationError("SUBSCRIPTION_ARGUMENT_INVALID");
    await options.beforeCommit?.();
    let committed: R2Object | null;
    try {
      committed = await bucket.put(key, body, {
        onlyIf: object ? { etagMatches: object.etag } : { etagDoesNotMatch: "*" },
        httpMetadata: { contentType: "application/json" },
      });
    } catch {
      throw new UserSubscriptionMutationError("SUBSCRIPTION_STORAGE_UNAVAILABLE");
    }
    if (committed) return update.result;
  }
  throw new UserSubscriptionMutationError("SUBSCRIPTION_CONFLICT");
}
