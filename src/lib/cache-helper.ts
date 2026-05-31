import { normalizeUrlForCache } from "@/lib/url";
import { sha256Hex } from "@/lib/r2";

/**
 * Cloudflare Cache API 用のキャッシュキーを生成する。
 * `/__cache/{type}/{key}` 形式の合成 URL を Request としてラップする。
 * `url` が `http://` / `https://` で始まる外部 URL の場合は sha256Hex(normalizeUrlForCache(url)) をキーとし、
 * それ以外の内部合成キー（`user:${userId}:...` 等）はハッシュをスキップしてそのまま使用する。
 *
 * @param origin - リクエスト元のオリジン（例: "https://rss.0g0.xyz"）
 * @param type   - キャッシュ名前空間（例: "content" / "image" / "ogp" / "articles" / "feeds"）
 * @param url    - 外部 URL（正規化→ハッシュ化）または内部合成キー（そのまま使用）
 */
export async function buildCacheKey(origin: string, type: string, url: string): Promise<Request> {
  const key =
    url.startsWith("http://") || url.startsWith("https://")
      ? await sha256Hex(normalizeUrlForCache(url))
      : url; // 内部合成キー（user:... 等）はハッシュ不要
  return new Request(`${origin}/__cache/${type}/${key}`);
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
 * ユーザーの全フィード記事一覧キャッシュ (`/api/articles` の since/feed 無し経路) を
 * 無効化する。フィードリフレッシュ後に呼んで、cache HIT による stale 表示を防ぐ。
 *
 * articles route の cache key と完全一致させること
 * (app/api/articles/route.ts: `user:${userId}:feed:all:page:1`)。
 */
export async function purgeArticlesCache(
  origin: string,
  userId: string,
  ctx: ExecutionContext,
): Promise<void> {
  const cacheKey = await buildCacheKey(origin, "articles", `user:${userId}:feed:all:page:1`);
  ctx.waitUntil(caches.default.delete(cacheKey).catch(() => {}));
}

/**
 * Cloudflare Cache API のエントリを同期的に削除する。
 * 削除に成功した場合は true、対象キーが無かった場合や削除失敗は false。
 */
export async function deleteCfCache(cacheKey: Request): Promise<boolean> {
  try {
    return await caches.default.delete(cacheKey);
  } catch {
    return false;
  }
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
