import { NextResponse } from "next/server";
import { r2Get, r2Put } from "@/lib/r2";

/**
 * R2 ベースのクールダウンを確認・更新する。
 * クールダウン中なら 429 NextResponse を返す。クールダウン外なら null を返し、タイムスタンプを更新する。
 *
 * NOTE: R2 は原子的な条件付き書き込みをサポートしないため、同一アイソレート内で
 * 複数リクエストが同時にクールダウンチェックを通過する TOCTOU 競合が発生しうる。
 * 手動更新のような低頻度かつ冪等な操作を前提として許容している既知の制限。
 */
export async function checkAndUpdateCooldown(
  bucket: R2Bucket,
  key: string,
  cooldownMs: number,
): Promise<NextResponse | null> {
  const { ts } = await r2Get<{ ts: number }>(bucket, key, { ts: 0 });
  const elapsed = Date.now() - ts;
  if (elapsed < cooldownMs) {
    const retryAfter = Math.ceil((cooldownMs - elapsed) / 1000);
    return NextResponse.json(
      { error: "Too many requests", retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }
  await r2Put(bucket, key, { ts: Date.now() });
  return null;
}
