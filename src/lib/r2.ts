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
