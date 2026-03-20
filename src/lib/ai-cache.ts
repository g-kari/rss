/**
 * AI 結果の R2 キャッシュヘルパー
 * キー: ai-cache/{mode}/{SHA-256(plainText)}
 */

type AiMode = 'summary' | 'translation';

async function hashText(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function getAiCache(
  bucket: R2Bucket,
  mode: AiMode,
  plain: string,
): Promise<string | null> {
  const hash = await hashText(plain);
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
  const hash = await hashText(plain);
  await bucket.put(`ai-cache/${mode}/${hash}`, result, {
    httpMetadata: { contentType: 'text/plain; charset=utf-8' },
  });
}
