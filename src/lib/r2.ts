/**
 * R2 から JSON データを読み込む。キーが存在しない場合（null）は fallback を返す。
 * R2 の実エラー（権限・ネットワーク障害等）は呼び出し元に伝搬する（握り潰さない）。
 * これにより read-state.json や subscriptions.json の R2 障害時に空データを返す代わりに
 * 呼び出し元のルートハンドラが 500 を返せるようになる。
 */
export async function r2Get<T>(bucket: R2Bucket, key: string, fallback: T): Promise<T> {
  // R2 の get() は「キーなし」なら null を返す。例外は実際のエラー（権限・ネットワーク等）。
  // キーなし → fallback を返す。実エラー → 呼び出し元に伝搬して 500 を返させる。
  const obj = await bucket.get(key);
  if (!obj) return fallback;
  return await obj.json<T>();
}

/**
 * R2 に JSON データを書き込む。Content-Type は application/json で固定。
 * エラー時は再スローする（r2Get と異なりエラーを握り潰さない）。
 */
export async function r2Put(bucket: R2Bucket, key: string, data: unknown): Promise<void> {
  try {
    await bucket.put(key, JSON.stringify(data), {
      httpMetadata: { contentType: "application/json" },
    });
  } catch (e) {
    console.error(`[r2Put] Failed to write ${key}:`, e);
    throw e;
  }
}

/** 文字列の SHA-256 ハッシュ（16進）を返す。キャッシュキー生成などに使用 */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** ユーザーデータの R2 キーを生成する汎用ヘルパー */
const userKey = (userId: string, name: string): string => `users/${userId}/${name}`;

export const userPushKey = (userId: string) => userKey(userId, "push.json");
export const savedArticlesKey = (userId: string) => userKey(userId, "saved.json");
export const readStateKey = (userId: string) => userKey(userId, "read-state.json");
export const engagementKey = (userId: string) => userKey(userId, "engagement.json");
export const refreshCooldownKey = (userId: string) => userKey(userId, "last-full-refresh.json");
export const aiRateLimitKey = (userId: string) => userKey(userId, "ai-cooldown.json");
export const singleFeedRefreshCooldownKey = (userId: string, feedHash: string) =>
  userKey(userId, `feed-refresh-${feedHash}.json`);
export const reinferCooldownKey = (userId: string, feedHash: string) =>
  userKey(userId, `feed-reinfer-${feedHash}.json`);
export const recommendationsCooldownKey = (userId: string) =>
  userKey(userId, "recommendations-refresh.json");
export const feedAddCooldownKey = (userId: string) => userKey(userId, "feed-add-cooldown.json");
export const contentFetchRateLimitKey = (userId: string) =>
  userKey(userId, "content-fetch-rate-limit.json");
export const imageProxyRateLimitKey = (userId: string) => `${userId}:image-proxy`;
export const clipCooldownKey = (userId: string) => userKey(userId, "clip-cooldown.json");
export const opmlImportCooldownKey = (userId: string) => userKey(userId, "opml-import.json");
export const pushSubscribeCooldownKey = (userId: string) => `${userId}:push-subscribe`;

export const ogpCooldownKey = (userId: string) => `${userId}:ogp-cooldown`;
export const engagementCooldownKey = (userId: string) => `${userId}:engagement-cooldown`;
export const feedLastFetchedKey = (userId: string) => userKey(userId, "feed-last-fetched.json");
export const saveArticleCooldownKey = (userId: string) => `${userId}:save-article-cooldown`;
