/**
 * AI 結果の R2 キャッシュヘルパー
 * キー: ai-cache/{type}/id-{articleId}
 */

export type AiCacheType = "summary" | "translation";

/** articleId をキーとしたキャッシュ取得 */
export async function getAiCacheById(
  bucket: R2Bucket,
  articleId: string,
  type: AiCacheType = "summary",
): Promise<string | null> {
  const obj = await bucket.get(`ai-cache/${type}/id-${articleId}`);
  if (!obj) return null;
  return obj.text();
}

/** articleId をキーとしたキャッシュ保存 */
export async function setAiCacheById(
  bucket: R2Bucket,
  articleId: string,
  result: string,
  type: AiCacheType = "summary",
): Promise<void> {
  await bucket.put(`ai-cache/${type}/id-${articleId}`, result, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
  });
}
