/**
 * R2 から JSON データを読み込む。キーが存在しない場合またはエラー時は fallback を返す。
 * エラーはログに出力するが呼び出し元には伝搬しない（r2Put とは異なる）。
 */
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

/**
 * R2 に JSON データを書き込む。Content-Type は application/json で固定。
 * エラー時は再スローする（r2Get と異なりエラーを握り潰さない）。
 */
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

/** AI エンドポイントのクールダウン管理キーを返す */
export function aiCooldownKey(userId: string): string {
  return `users/${userId}/ai-cooldown.json`;
}

/** 単体フィードリフレッシュのクールダウン管理キーを返す */
export function singleFeedRefreshCooldownKey(userId: string, feedHash: string): string {
  return `users/${userId}/feed-refresh-${feedHash}.json`;
}

/** LLM CSS セレクタ再推論のクールダウン管理キーを返す */
export function reinferCooldownKey(userId: string, feedHash: string): string {
  return `users/${userId}/feed-reinfer-${feedHash}.json`;
}

/** 推薦リフレッシュのクールダウン管理キーを返す */
export function recommendationsCooldownKey(userId: string): string {
  return `users/${userId}/recommendations-refresh.json`;
}

/** 推薦生成（GET）のクールダウン管理キーを返す。並行リクエストによる多重生成を防ぐ。 */
export function recommendationsGenCooldownKey(userId: string): string {
  return `users/${userId}/recommendations-gen.json`;
}
