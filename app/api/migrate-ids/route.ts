/**
 * クライアント側の localStorage ID 移行用エンドポイント。
 * 旧 UUID 形式の記事 ID → 新 sha256 形式 ID のマッピングを返す。
 *
 * 旧 ID: crypto.randomUUID() で生成された 36 文字 UUID
 * 新 ID: sha256Hex(feedUrl + "|" + guid).slice(0,16) の 16 文字 hex
 *
 * users/{userId}/id-migration.json にキャッシュされたマッピングを返す。
 * このファイルはマイグレーションスクリプトが生成する。
 * ファイルが存在しない場合は空オブジェクトを返す（移行完了後は不要）。
 */
import { NextResponse } from 'next/server';
import { withSession } from '@/lib/server-auth';
import { r2Get } from '@/lib/r2';

export async function GET() {
  return withSession(async ({ session, env }) => {
    const mapping = await r2Get<Record<string, string>>(
      env.RSS_DATA,
      `users/${session.userId}/id-migration.json`,
      {},
    );
    return NextResponse.json(mapping);
  });
}
