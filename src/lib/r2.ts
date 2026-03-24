export async function r2Get<T>(bucket: R2Bucket, key: string, fallback: T): Promise<T> {
  const obj = await bucket.get(key);
  if (!obj) return fallback;
  return obj.json<T>();
}

export async function r2Put(bucket: R2Bucket, key: string, data: unknown): Promise<void> {
  await bucket.put(key, JSON.stringify(data), {
    httpMetadata: { contentType: 'application/json' },
  });
}

/** 文字列の SHA-256 ハッシュ（16進）を返す。キャッシュキー生成などに使用 */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
