/**
 * Device Bound Session Credentials (DBSC) サポートライブラリ
 *
 * DBSC はブラウザセッションをデバイスの TPM（Trusted Platform Module）に紐付ける
 * Chrome のセキュリティ機能。ログイン時にブラウザが TPM 内で鍵ペアを生成し、
 * セッション更新時には秘密鍵の所持を証明する必要がある。
 *
 * 主なHTTPヘッダー:
 * - `Secure-Session-Registration`: サーバー → ブラウザ。新しい鍵ペアの登録を指示
 * - `Sec-Session-Challenge`:    サーバー → ブラウザ。鍵所持証明用チャレンジ
 * - `Sec-Session-Id`:           ブラウザ → サーバー。セッション識別子
 * - `Sec-Session-Response`:     ブラウザ → サーバー。チャレンジへの署名済みレスポンス
 *
 * @see https://wicg.github.io/dbsc/
 */

import { base64urlToBytes } from "./auth";
import { devError } from "./dev-log";

/**
 * サーバーサイドに保存する DBSC セッション情報（R2 保存用）
 */
export interface DbscSession {
  /** 登録済みの P-256 ECDSA 公開鍵（PEM または JWK JSON 文字列） */
  publicKey: string;
  /** 鍵登録日時（Unix ミリ秒） */
  registeredAt: number;
  /** 最後にチャレンジ検証を通過した日時（Unix ミリ秒）。未検証の場合は undefined */
  lastVerifiedAt?: number;
}

/**
 * DBSC チャレンジを生成する。
 *
 * チャレンジはリプレイ攻撃を防ぐために一回限り使用する乱数。
 * 生成後はサーバーサイドで保持しておき、`verifyDbscResponse` で照合する。
 *
 * @returns UUID v4 形式のチャレンジ文字列
 */
export function generateDbscChallenge(): string {
  return crypto.randomUUID();
}

export async function importDbscPublicKey(publicKey: string): Promise<CryptoKey> {
  const trimmed = publicKey.trim();
  if (trimmed.startsWith("{")) {
    // JWK 形式。
    // attacker は register endpoint で任意 HTTP body を送れるため、`{` 開始でも
    // `"null"` / `"[]"` / `"\"str\""` 等の non-object JSON を送られる経路がある。
    // crypto.subtle.importKey("jwk", null, ...) は TypeError で reject されるが、
    // 呼出元 verifyDbscResponse の try/catch で「JWK 形式不正」と区別できないため、
    // 事前に 3 軸 narrowing で non-object を明示拒否する (react-component-split.md §
    // 派生サブケース「security path の JSON.parse 結果は unknown 受け + 3 軸 narrowing」)。
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("JWK must be a JSON object");
    }
    return crypto.subtle.importKey(
      "jwk",
      parsed as JsonWebKey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
  }
  if (trimmed.includes("-----BEGIN PUBLIC KEY-----")) {
    // PEM/SPKI 形式
    const b64 = trimmed
      .replace(/-----BEGIN PUBLIC KEY-----/, "")
      .replace(/-----END PUBLIC KEY-----/, "")
      .replace(/\s+/g, "");
    const der = base64urlToBytes(b64.replace(/\+/g, "-").replace(/\//g, "_"));
    return crypto.subtle.importKey("spki", der, { name: "ECDSA", namedCurve: "P-256" }, false, [
      "verify",
    ]);
  }
  throw new Error("Unsupported public key format");
}

/**
 * ブラウザからの DBSC チャレンジレスポンス（署名）を検証する。
 *
 * @param challenge - サーバーが発行したチャレンジ文字列
 * @param response  - ブラウザが秘密鍵で署名した Sec-Session-Response ヘッダー値
 * @param publicKey - R2 に保存済みの登録公開鍵（PEM または JWK JSON 文字列）
 * @returns 署名が有効なら true、無効なら false
 */
export async function verifyDbscResponse(
  challenge: string,
  response: string,
  publicKey: string,
): Promise<boolean> {
  try {
    // JWS compact: header.payload.signature
    const parts = response.split(".");
    if (parts.length !== 3) return false;
    const [headerB64, payloadB64, sigB64] = parts;

    // payload に challenge が含まれていることを確認。
    // attacker は任意 HTTP body を送れるため、base64url("null") / base64url("[]") 等の
    // non-object JSON を送られる経路あり。3 軸 narrowing で non-object を明示拒否する
    // (react-component-split.md § 派生サブケース「security path の JSON.parse 結果は
    // unknown 受け + 3 軸 narrowing」、canonical: 同 file importDbscPublicKey)。
    const payloadBytes = base64urlToBytes(payloadB64);
    const payloadRaw: unknown = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (typeof payloadRaw !== "object" || payloadRaw === null || Array.isArray(payloadRaw)) {
      return false;
    }
    const payload = payloadRaw as Record<string, unknown>;
    if (payload["challenge"] !== challenge) return false;

    // 公開鍵をインポート
    const cryptoKey = await importDbscPublicKey(publicKey);

    // JWS の署名対象は ASCII(`header.payload`)
    const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

    // 署名を検証
    const sigBytes = base64urlToBytes(sigB64);
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      cryptoKey,
      sigBytes,
      signedData,
    );
  } catch (err) {
    devError("[dbsc] verifyDbscResponse threw — JWK import または署名 API エラー", err);
    return false;
  }
}

/**
 * `Secure-Session-Registration` ヘッダーの値を RFC 8941 Structured Field Values 形式で構築する。
 *
 * このヘッダーをログインレスポンスに付与すると、対応ブラウザが TPM で鍵ペアを生成し、
 * `path` エンドポイントに公開鍵を POST して登録を完了する。
 *
 * 出力形式: `(ES256);path="...";challenge="..."`
 * @see https://www.w3.org/TR/dbsc/#the-secure-session-registration-header
 */
export function buildSecureSessionRegistrationHeader(
  challenge: string,
  path = "/api/auth/dbsc/register",
): string {
  const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `(ES256);path="${esc(path)}";challenge="${esc(challenge)}"`;
}
