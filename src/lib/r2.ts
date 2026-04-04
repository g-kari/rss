import { normalizeUrlForCache } from "@/lib/url";

export async function r2Get<T>(bucket: R2Bucket, key: string, fallback: T): Promise<T> {
  try {
    const obj = await bucket.get(key);
    if (!obj) return fallback;
    return await obj.json<T>();
  } catch (e) {
    console.error(`[r2Get] Failed to read ${key}:`, e);
    return fallback;
  }
}

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

/** ユーザーの Push 設定の R2 キーを返す */
export function userPushKey(userId: string): string {
  return `users/${userId}/push.json`;
}

/** ユーザーの手動保存記事の R2 キーを返す */
export function savedArticlesKey(userId: string): string {
  return `users/${userId}/saved.json`;
}

/** ユーザーの既読・ブックマーク状態の R2 キーを返す */
export function readStateKey(userId: string): string {
  return `users/${userId}/read-state.json`;
}

/** ユーザーのエンゲージメントログの R2 キーを返す */
export function engagementKey(userId: string): string {
  return `users/${userId}/engagement.json`;
}

/** フィード全体リフレッシュのクールダウン管理キーを返す */
export function refreshCooldownKey(userId: string): string {
  return `users/${userId}/last-full-refresh.json`;
}

/**
 * Cloudflare Cache API 用のキャッシュキーを生成する。
 * `/__cache/{type}/{sha256(normalizedUrl)}` 形式の合成 URL を Request としてラップする。
 *
 * @param origin - リクエスト元のオリジン（例: "https://rss.0g0.xyz"）
 * @param type   - キャッシュ名前空間（例: "content" / "image" / "ogp"）
 * @param url    - キャッシュ対象の外部 URL（正規化してからハッシュ化される）
 */
export async function buildCacheKey(origin: string, type: string, url: string): Promise<Request> {
  return new Request(`${origin}/__cache/${type}/${await sha256Hex(normalizeUrlForCache(url))}`);
}

/**
 * Cloudflare Cache API に fire-and-forget でレスポンスを保存する。
 * エラーはログに出力するが呼び出し元には伝搬しない。
 *
 * @param cacheKey - buildCacheKey() で生成したキャッシュキー
 * @param response - 保存するレスポンス（Content-Type / Cache-Control ヘッダー付き）
 * @param ctx      - ExecutionContext（waitUntil に渡す）
 * @param label    - ログ出力用のラベル（例: "image-proxy"）
 */
export function cachePutAsync(
  cacheKey: Request,
  response: Response,
  ctx: ExecutionContext,
  label: string,
): void {
  ctx.waitUntil(
    caches.default
      .put(cacheKey, response)
      .catch((err) => console.error(`[${label}] cache put error:`, err)),
  );
}
