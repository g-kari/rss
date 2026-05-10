import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { withJsonBody, bindDbscToServerSession, SESSION_COOKIE } from "@/lib/server-auth";
import { r2Get, r2Put } from "@/lib/r2";
import { importDbscPublicKey, type DbscSession } from "@/lib/dbsc";
import { timingSafeEqual } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { isValidSessionId } from "@/lib/validation";

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
  return withJsonBody<{
    publicKey?: unknown;
    sessionId?: unknown;
    attestation?: unknown;
    challenge?: unknown;
  }>(req, async ({ body, session, env }) => {
    const { publicKey, sessionId, attestation, challenge } = body;

    const MAX_PUBLIC_KEY_LENGTH = 4096;
    const MAX_CHALLENGE_LENGTH = 256;
    const MAX_ATTESTATION_LENGTH = 65536;

    if (
      typeof publicKey !== "string" ||
      publicKey.length === 0 ||
      publicKey.length > MAX_PUBLIC_KEY_LENGTH
    ) {
      return apiError("publicKey is invalid", 400);
    }
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return apiError("sessionId is required", 400);
    }
    if (!isValidSessionId(sessionId)) {
      return apiError("invalid sessionId", 400);
    }
    if (
      attestation !== undefined &&
      (typeof attestation !== "string" || attestation.length > MAX_ATTESTATION_LENGTH)
    ) {
      return apiError("attestation must be a string", 400);
    }
    if (
      typeof challenge !== "string" ||
      challenge.length === 0 ||
      challenge.length > MAX_CHALLENGE_LENGTH
    ) {
      return apiError("challenge is invalid", 400);
    }

    // 登録フローで発行したチャレンジを R2 から取得して照合
    const pendingKey = `users/${session.userId}/dbsc-pending-challenge.json`;
    const pendingChallenge = await r2Get<{ challenge: string; expiresAt: number } | null>(
      env.RSS_DATA,
      pendingKey,
      null,
    );

    if (!pendingChallenge) {
      return apiError("Challenge not found or expired", 401);
    }
    if (pendingChallenge.expiresAt < Date.now()) {
      env.RSS_DATA.delete(pendingKey).catch(() => {});
      return apiError("Challenge expired", 401);
    }
    // チャレンジを削除（一回限り使用）— 照合前に削除してリプレイ攻撃を防ぐ
    await env.RSS_DATA.delete(pendingKey);

    if (!timingSafeEqual(pendingChallenge.challenge, challenge)) {
      return apiError("Challenge mismatch", 401);
    }

    // P-256 ECDSA 公開鍵フォーマット検証
    try {
      await importDbscPublicKey(publicKey);
    } catch {
      return apiError("Invalid P-256 public key", 400);
    }

    // 既存の DBSC バインドがある場合は上書きを拒否する（Issue #433: クロスデバイス上書き防止）
    // 再登録が必要な場合は DELETE /api/auth/dbsc/session で解除してから再登録すること
    const existingSession = await r2Get<DbscSession | null>(
      env.RSS_DATA,
      `users/${session.userId}/dbsc-session.json`,
      null,
    );
    if (existingSession) {
      return apiError("DBSC session already registered. Delete existing binding first.", 409);
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
