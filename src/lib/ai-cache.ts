/**
 * AI 結果の R2 キャッシュヘルパー
 *
 * キー: `ai-cache/{type}/model-url-{sha256([model, url])}`
 * model 省略の既存 caller だけ `ai-cache/{type}/url-{sha256(url)}` を使用する。
 * 旧キャッシュの生成モデルは不明のため、モデル指定時はフォールバックしない。
 *
 * #698 セキュリティ対応: 旧 `id-{articleId}` 形式は cross-user poisoning を
 * 招くため廃止。url から決定論的に sha256 ハッシュを取り、攻撃者が偽 url で
 * 別ユーザー記事の cache を上書きできないようにした。
 *
 * URL hash ベースなら攻撃者は自身の cache key しか書けない (攻撃者が制御する
 * url の hash で必ず分離される)。
 */
import { sha256Hex } from "./r2";

export type AiCacheType = "summary" | "translation";

async function buildKey(url: string, type: AiCacheType, model?: string): Promise<string> {
  if (model !== undefined) {
    const hash = await sha256Hex(JSON.stringify([model, url]));
    return `ai-cache/${type}/model-url-${hash}`;
  }
  const hash = await sha256Hex(url);
  return `ai-cache/${type}/url-${hash}`;
}

/** url + model ベースのキャッシュ取得（model 省略時は旧キー） */
export async function getAiCacheByUrl(
  bucket: R2Bucket,
  url: string,
  type: AiCacheType = "summary",
  model?: string,
): Promise<string | null> {
  const obj = await bucket.get(await buildKey(url, type, model));
  if (!obj) return null;
  return obj.text();
}

/** url + model ベースのキャッシュ保存（model 省略時は旧キー） */
export async function setAiCacheByUrl(
  bucket: R2Bucket,
  url: string,
  result: string,
  type: AiCacheType = "summary",
  model?: string,
): Promise<void> {
  await bucket.put(await buildKey(url, type, model), result, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
  });
}
