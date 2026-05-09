import type { NextResponse } from "next/server";
import type { UserSubscription } from "../types";
import { readUserSubscriptions } from "./shared-feed";
import { apiError } from "./api-error";

/**
 * リクエストユーザーが対象 feedHash を購読しているか確認する共通 guard。
 *
 * 4+ Route Handler (`feeds/[id]/{,refresh,reinfer,purge-content-cache}`,
 * `engagement` 等) で完全に同じ subscription guard を書いていた重複を解消。
 *
 * セキュリティ的に重要: shared resource (Cloudflare Cache / 共有 feed data) を
 * 操作する API では「認証 + 所有権チェック」の二段が必須。本 helper は所有権 (購読) チェック
 * を提供する (`coding-conventions.md` 参照)。
 *
 * 戻り値は **discriminated union**: `err` が null なら `sub` は確実に存在する。
 * 呼び出し側は `if (result.err) return result.err;` で TS narrowing を活かせる。
 *
 * @example
 * ```ts
 * const result = await assertFeedSubscribed(env.RSS_DATA, session.userId, feedHash);
 * if (result.err) return result.err;
 * const { subs, sub } = result; // sub: UserSubscription (narrowed)
 * ```
 */
export type FeedSubscribedResult =
  | { subs: UserSubscription[]; sub: UserSubscription; err: null }
  | { subs: UserSubscription[]; sub: undefined; err: NextResponse };

export async function assertFeedSubscribed(
  r2: R2Bucket,
  userId: string,
  feedHash: string,
): Promise<FeedSubscribedResult> {
  const subs = await readUserSubscriptions(r2, userId);
  const sub = subs.find((s) => s.feedHash === feedHash);
  if (!sub) {
    return {
      subs,
      sub: undefined,
      err: apiError("Feed not found", 404, { code: "FEED_NOT_FOUND" }),
    };
  }
  return { subs, sub, err: null };
}
