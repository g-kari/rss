import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  withSession,
  parseJsonBody,
  bindDbscToServerSession,
  SESSION_COOKIE,
} from "@/lib/server-auth";
import { r2Put } from "@/lib/r2";
import { importDbscPublicKey, type DbscSession } from "@/lib/dbsc";

/**
 * POST /api/auth/dbsc/register
 *
 * DBSC（Device Bound Session Credentials）の公開鍵登録エンドポイント。
 *
 * ブラウザが `Secure-Session-Registration` ヘッダーを受け取ると、TPM で P-256 鍵ペアを生成し、
 * このエンドポイントに公開鍵を POST して登録を完了する。
 *
 * リクエストボディ:
 * - `publicKey`   {string}  P-256 ECDSA 公開鍵（PEM または JWK JSON 文字列）
 * - `sessionId`   {string}  ブラウザが管理する DBSC セッション識別子
 * - `attestation` {string?} TPM アテステーション（対応デバイスのみ）
 *
 * @see https://wicg.github.io/dbsc/
 */
export async function POST(req: NextRequest) {
  return withSession(req, async ({ session, env }) => {
    const parsed = await parseJsonBody<{
      publicKey?: unknown;
      sessionId?: unknown;
      attestation?: unknown;
    }>(req);
    if (!parsed.ok) return parsed.error;

    const { publicKey, sessionId, attestation } = parsed.data;

    if (typeof publicKey !== "string" || publicKey.length === 0) {
      return NextResponse.json({ error: "publicKey is required" }, { status: 400 });
    }
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }
    if (attestation !== undefined && typeof attestation !== "string") {
      return NextResponse.json({ error: "attestation must be a string" }, { status: 400 });
    }

    // P-256 ECDSA 公開鍵フォーマット検証
    try {
      await importDbscPublicKey(publicKey);
    } catch {
      return NextResponse.json({ error: "Invalid P-256 public key" }, { status: 400 });
    }

    // DbscSession を R2 に保存
    const dbscSession: DbscSession = {
      publicKey,
      registeredAt: Date.now(),
    };
    await r2Put(env.RSS_DATA, `users/${session.userId}/dbsc-session.json`, dbscSession);

    // サーバーセッションに DBSC バインディングを記録
    const cookieStore = await cookies();
    const serverSessionId = cookieStore.get(SESSION_COOKIE)?.value;
    if (serverSessionId) {
      await bindDbscToServerSession(env.RSS_DATA, serverSessionId, sessionId);
    }

    return NextResponse.json({ ok: true });
  });
}
