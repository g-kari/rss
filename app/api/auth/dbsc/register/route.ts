import { NextRequest, NextResponse } from "next/server";
import { withSession, parseJsonBody } from "@/lib/server-auth";

/**
 * POST /api/auth/dbsc/register
 *
 * DBSC（Device Bound Session Credentials）の公開鍵登録エンドポイント。
 *
 * ブラウザが `Sec-Session-Registration` ヘッダーを受け取ると、TPM で P-256 鍵ペアを生成し、
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

    // publicKey の基本バリデーション
    if (typeof publicKey !== "string" || publicKey.length === 0) {
      return NextResponse.json({ error: "publicKey is required" }, { status: 400 });
    }
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }
    if (attestation !== undefined && typeof attestation !== "string") {
      return NextResponse.json({ error: "attestation must be a string" }, { status: 400 });
    }

    // TODO: publicKey フォーマット検証（P-256 ECDSA）
    // 実装内容:
    // 1. PEM 形式（"-----BEGIN PUBLIC KEY-----"）または JWK JSON 形式かを判別する
    // 2. SubtleCrypto.importKey() でインポートを試みて、失敗した場合は 400 を返す
    //    try {
    //      const key = await crypto.subtle.importKey(
    //        'spki',
    //        pemToDer(publicKey),
    //        { name: 'ECDSA', namedCurve: 'P-256' },
    //        true,
    //        ['verify']
    //      );
    //    } catch {
    //      return NextResponse.json({ error: 'Invalid P-256 public key' }, { status: 400 });
    //    }
    // 3. attestation が存在する場合は TPM アテステーションチェーンを検証する
    //    （FIDO2/WebAuthn のアテステーション検証に近い処理）

    // TODO: DbscSession を R2 に保存する
    // 保存先: `users/{userId}/dbsc-session.json`
    // ユーザーごとに 1 セッションのみ保持する（上書き更新）。
    // 複数デバイス対応が必要になった場合は `users/{userId}/dbsc-sessions.json` に
    // sessionId をキーとするマップ形式で拡張すること。
    //
    // 実装例:
    // import { r2Put } from "@/lib/r2";
    // import type { DbscSession } from "@/lib/dbsc";
    // const dbscSession: DbscSession = {
    //   publicKey,
    //   registeredAt: Date.now(),
    // };
    // await r2Put(env.RSS_DATA, `users/${session.userId}/dbsc-session.json`, dbscSession);

    // env と session は将来の実装で使用するため参照を保持（lint の未使用変数警告を抑制）
    void env;
    void session;
    void attestation;

    // TODO: 登録成功後、サーバーサイドセッション（sessions/{sessionId}.json）の
    // `dbscSessionId` フィールドを更新して DBSC バインディングを記録する。
    // これにより、次回のトークンリフレッシュ時に DBSC チャレンジを要求できる。

    return NextResponse.json({ ok: true });
  });
}
