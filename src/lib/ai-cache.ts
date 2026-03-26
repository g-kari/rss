/**
 * AI 結果の R2 キャッシュヘルパー
 * キー: ai-cache/{mode}/{SHA-256(plainText)}
 */

import type { AiMode } from "../types";
import { sha256Hex } from "./r2";

export async function getAiCache(
  bucket: R2Bucket,
  mode: AiMode,
  plain: string,
): Promise<string | null> {
  const hash = await sha256Hex(plain);
  const obj = await bucket.get(`ai-cache/${mode}/${hash}`);
  if (!obj) return null;
  return obj.text();
}

export async function setAiCache(
  bucket: R2Bucket,
  mode: AiMode,
  plain: string,
  result: string,
): Promise<void> {
  const hash = await sha256Hex(plain);
  await bucket.put(`ai-cache/${mode}/${hash}`, result, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
  });
}

/** articleId をキーとしたキャッシュ取得 */
export async function getAiCacheById(
  bucket: R2Bucket,
  mode: AiMode,
  articleId: string,
): Promise<string | null> {
  const obj = await bucket.get(`ai-cache/${mode}/id-${articleId}`);
  if (!obj) return null;
  return obj.text();
}

/** articleId をキーとしたキャッシュ保存 */
export async function setAiCacheById(
  bucket: R2Bucket,
  mode: AiMode,
  articleId: string,
  result: string,
): Promise<void> {
  await bucket.put(`ai-cache/${mode}/id-${articleId}`, result, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
  });
}
