import { normalizeUrlForCache } from "@/lib/url";
import { sha256Hex } from "@/lib/r2";

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
 * Cloudflare Cache API からヒットを取得する。
 * HIT なら Response を、MISS なら null を返す（呼び出し側の条件分岐を簡素化）。
 */
export async function matchCfCache(cacheKey: Request): Promise<Response | null> {
  return (await caches.default.match(cacheKey)) ?? null;
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

/**
 * ユーザーのフィード一覧キャッシュを無効化する（フィード追加・削除・更新・インポート時に使用）。
 */
export async function purgeFeedsCache(
  origin: string,
  userId: string,
  ctx: ExecutionContext,
): Promise<void> {
  const cacheKey = await buildCacheKey(origin, "feeds", `user:${userId}`);
  ctx.waitUntil(caches.default.delete(cacheKey).catch(() => {}));
}

/**
 * JSON ペイロード用のキャッシュ保存 Response を構築する。
 * `Content-Type: application/json` と `Cache-Control: public, max-age={ttl}` を付与する。
 */
export function buildJsonCacheResponse(payload: unknown, ttlSec: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${ttlSec}`,
    },
  });
}
