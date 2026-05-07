import { NextRequest, NextResponse } from "next/server";
import { withJsonBody } from "@/lib/server-auth";
import { timingSafeEqual } from "@/lib/auth";
import { generateDbscChallenge, verifyDbscResponse, type DbscSession } from "@/lib/dbsc";
import { r2Get, r2Put } from "@/lib/r2";

/**
 * POST /api/auth/dbsc/challenge
 *
 * DBSC（Device Bound Session Credentials）のセッション更新エンドポイント。
 *
 * 2 段階のフローで動作する:
 *
 * **Step 1 — チャレンジ発行（response なし）**
 * - `sessionId` のみを送信する
 * - サーバーはランダムなチャレンジ文字列を生成して返す
 * - ブラウザはチャレンジを TPM の秘密鍵で署名する
 *
 * **Step 2 — 署名検証（response あり）**
 * - `sessionId`、`challenge`、`response`（署名）を送信する
 * - サーバーは R2 に保存された公開鍵で署名を検証する
 * - 検証成功後、セッションの有効性が確認されたことを記録する
 *
 * リクエストボディ:
 * - `sessionId`  {string}  ブラウザが管理する DBSC セッション識別子
 * - `response`   {string?} ブラウザが秘密鍵で署名した Sec-Session-Response 値
 * - `challenge`  {string?} Step 1 で発行されたチャレンジ（Step 2 時に必須）
 *
 * @see https://wicg.github.io/dbsc/
 */
export async function POST(req: NextRequest) {
  return withJsonBody<{
    sessionId?: unknown;
    response?: unknown;
    challenge?: unknown;
  }>(req, async ({ body, session, env }) => {
    const { sessionId, response, challenge } = body;

    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      return NextResponse.json({ error: "invalid sessionId" }, { status: 400 });
    }

    // Step 2: response が存在する場合は署名検証フロー
    if (response !== undefined) {
      if (typeof response !== "string" || response.length === 0 || response.length > 4096) {
        return NextResponse.json({ error: "response must be a non-empty string" }, { status: 400 });
      }
      if (typeof challenge !== "string" || challenge.length === 0 || challenge.length > 256) {
        return NextResponse.json(
          { error: "challenge is required when response is present" },
          { status: 400 },
        );
      }

      // R2 から保存済みチャレンジを取得して検証
      const challengeKey = `users/${session.userId}/dbsc-challenge-${sessionId}.json`;
      const storedChallenge = await r2Get<{ challenge: string; expiresAt: number } | null>(
        env.RSS_DATA,
        challengeKey,
        null,
      );

      if (!storedChallenge) {
        return NextResponse.json({ error: "Challenge not found or expired" }, { status: 401 });
      }

      // 期限切れチェック
      if (storedChallenge.expiresAt < Date.now()) {
        env.RSS_DATA.delete(challengeKey).catch(() => {});
        return NextResponse.json({ error: "Challenge expired" }, { status: 401 });
      }

      // リプレイ攻撃防止：チャレンジを即座に削除
      await env.RSS_DATA.delete(challengeKey);

      // チャレンジ値の照合
      if (!timingSafeEqual(storedChallenge.challenge, challenge)) {
        return NextResponse.json({ error: "Challenge mismatch" }, { status: 401 });
      }

      // R2 から登録済み公開鍵を取得
      const dbscSession = await r2Get<DbscSession | null>(
        env.RSS_DATA,
        `users/${session.userId}/dbsc-session.json`,
        null,
      );
      if (!dbscSession) {
        return NextResponse.json({ error: "DBSC session not found" }, { status: 404 });
      }

      // 署名検証
      const verified = await verifyDbscResponse(challenge, response, dbscSession.publicKey);
      if (!verified) {
        return NextResponse.json({ error: "Signature verification failed" }, { status: 401 });
      }

      // 検証成功: lastVerifiedAt を更新
      await r2Put(env.RSS_DATA, `users/${session.userId}/dbsc-session.json`, {
        ...dbscSession,
        lastVerifiedAt: Date.now(),
      });

      return NextResponse.json({ ok: true, verified: true });
    }

    // Step 1: チャレンジ発行フロー（response なし）
    const generatedChallenge = generateDbscChallenge();

    // 生成したチャレンジを R2 に保存（有効期限: 5分）
    await r2Put(env.RSS_DATA, `users/${session.userId}/dbsc-challenge-${sessionId}.json`, {
      challenge: generatedChallenge,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return NextResponse.json({ challenge: generatedChallenge });
  });
}
