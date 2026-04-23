import { NextRequest, NextResponse } from "next/server";
import { withSession, parseJsonBody } from "@/lib/server-auth";
import { generateDbscChallenge, verifyDbscResponse } from "@/lib/dbsc";

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
  return withSession(req, async ({ session, env }) => {
    const parsed = await parseJsonBody<{
      sessionId?: unknown;
      response?: unknown;
      challenge?: unknown;
    }>(req);
    if (!parsed.ok) return parsed.error;

    const { sessionId, response, challenge } = parsed.data;

    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    // Step 2: response が存在する場合は署名検証フロー
    if (response !== undefined) {
      if (typeof response !== "string" || response.length === 0) {
        return NextResponse.json({ error: "response must be a non-empty string" }, { status: 400 });
      }
      if (typeof challenge !== "string" || challenge.length === 0) {
        return NextResponse.json(
          { error: "challenge is required when response is present" },
          { status: 400 },
        );
      }

      // TODO: R2 から登録済み公開鍵を取得する
      // 実装例:
      // import { r2Get } from "@/lib/r2";
      // import type { DbscSession } from "@/lib/dbsc";
      // const dbscSession = await r2Get<DbscSession | null>(
      //   env.RSS_DATA,
      //   `users/${session.userId}/dbsc-session.json`,
      //   null
      // );
      // if (!dbscSession) {
      //   return NextResponse.json({ error: 'DBSC session not found' }, { status: 404 });
      // }

      // TODO: チャレンジをサーバー側の一時ストレージ（R2 短期キー等）と照合して
      //       リプレイ攻撃を防ぐ。照合後は即座にチャレンジを削除する。

      // TODO: verifyDbscResponse() で実際の署名検証を行う（現在はスタブで false を返す）
      // const publicKey = dbscSession.publicKey;
      const publicKey = ""; // TODO: R2 から取得した公開鍵に差し替える
      const verified = await verifyDbscResponse(challenge, response, publicKey);

      if (verified) {
        // TODO: 検証成功時に R2 の DbscSession.lastVerifiedAt を更新する
        // await r2Put(env.RSS_DATA, `users/${session.userId}/dbsc-session.json`, {
        //   ...dbscSession,
        //   lastVerifiedAt: Date.now(),
        // });
      }

      // env と session は将来の実装で使用するため参照を保持（lint の未使用変数警告を抑制）
      void env;
      void session;

      // TODO: verified が true の場合は新しいアクセストークンを発行してレスポンスに含める
      // DBSC の目的はトークンリフレッシュをデバイス認証済みにすることなので、
      // 検証成功後に refresh フローを呼び出してアクセストークンを更新する。
      return NextResponse.json({ ok: true, verified: false });
    }

    // Step 1: チャレンジ発行フロー（response なし）
    const generatedChallenge = generateDbscChallenge();

    // TODO: 生成したチャレンジを R2 または短期 KV に保存してリプレイ攻撃を防ぐ
    // チャレンジの有効期限は短く設定すること（推奨: 5分）。
    // 保存先例: `users/{userId}/dbsc-challenge-{sessionId}.json`
    // 実装例:
    // await r2Put(env.RSS_DATA, `users/${session.userId}/dbsc-challenge-${sessionId}.json`, {
    //   challenge: generatedChallenge,
    //   expiresAt: Date.now() + 5 * 60 * 1000,
    // });

    // env と session は将来の実装で使用するため参照を保持（lint の未使用変数警告を抑制）
    void env;
    void session;

    return NextResponse.json({ challenge: generatedChallenge });
  });
}
