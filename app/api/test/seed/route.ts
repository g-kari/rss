/**
 * e2e テスト用 R2 シードエンドポイント。
 *
 * **本番環境では動作しない**。`getDevBypassUserId()` が null を返す場合は 404。
 * NODE_ENV=production ビルドでは Next.js inline により dead code 化される。
 *
 * - POST: フィード / 購読 / 読み取り状態を R2 に投入
 * - DELETE: テストユーザーの全データをクリア
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { r2Put, readStateKey } from "@/lib/r2";
import { apiError } from "@/lib/api-error";
import { getDevBypassUserId } from "@/lib/dev-auth-bypass";
import { validateSeedRequest, type SeedFeedInput } from "@/lib/test-seed";
import type { UserSubscription } from "@/types";

function notFound() {
  return apiError("Not Found", 404);
}

async function deleteByPrefix(bucket: R2Bucket, prefix: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const list = await bucket.list({ prefix, cursor, limit: 1000 });
    cursor = list.truncated ? list.cursor : undefined;
    if (list.objects.length === 0) break;
    await Promise.all(list.objects.map((obj) => bucket.delete(obj.key)));
  } while (cursor);
}

async function writeFeed(bucket: R2Bucket, feed: SeedFeedInput): Promise<void> {
  await r2Put(bucket, `feeds/${feed.feedHash}/meta.json`, feed.meta);
  await r2Put(bucket, `feeds/${feed.feedHash}/articles/latest.json`, feed.articles);
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return notFound();
  const userId = getDevBypassUserId();
  if (!userId) return notFound();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("INVALID_JSON", 400);
  }

  const validation = validateSeedRequest(body);
  if (!validation.ok) {
    return apiError(validation.error, 400);
  }

  const { env } = await getCloudflareContext({ async: true });
  const bucket = env.RSS_DATA;

  if (validation.data.feeds) {
    await Promise.all(validation.data.feeds.map((f) => writeFeed(bucket, f)));
  }

  if (validation.data.subscriptions) {
    const subs: UserSubscription[] = validation.data.subscriptions.map((s) => ({
      feedHash: s.feedHash,
      url: s.url,
      customTitle: s.customTitle,
      subscribedAt: new Date().toISOString(),
    }));
    await r2Put(bucket, `users/${userId}/subscriptions.json`, subs);
  }

  if (validation.data.readState) {
    const merged = {
      readIds: validation.data.readState.readIds ?? [],
      bookmarkIds: validation.data.readState.bookmarkIds ?? [],
      readingListIds: validation.data.readState.readingListIds ?? [],
      likeIds: validation.data.readState.likeIds ?? [],
    };
    await r2Put(bucket, readStateKey(userId), merged);
  }

  return NextResponse.json({ ok: true, userId });
}

export async function DELETE() {
  if (process.env.NODE_ENV === "production") return notFound();
  const userId = getDevBypassUserId();
  if (!userId) return notFound();

  const { env } = await getCloudflareContext({ async: true });
  const bucket = env.RSS_DATA;

  await deleteByPrefix(bucket, `users/${userId}/`);
  // フィードデータは他テストで再利用される可能性があるため、テスト側で
  // 必要に応じて feeds/{hash}/ プレフィックス削除を別呼び出しすること。

  return NextResponse.json({ ok: true, userId });
}
