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

/** R2 からテキストを読み込む。存在しない場合は null を返す */
export async function r2GetText(bucket: R2Bucket, key: string): Promise<{ text: string; metadata: Record<string, string> } | null> {
  const obj = await bucket.get(key);
  if (!obj) return null;
  return { text: await obj.text(), metadata: (obj.customMetadata ?? {}) as Record<string, string> };
}

/** R2 にテキストを書き込む（customMetadata でキャッシュ管理情報を持たせる） */
export async function r2PutText(bucket: R2Bucket, key: string, text: string, metadata?: Record<string, string>): Promise<void> {
  await bucket.put(key, text, {
    httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    customMetadata: metadata,
  });
}

/** URL の SHA-256 ハッシュ（16進）を返す */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
