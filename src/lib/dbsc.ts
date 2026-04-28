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

function base64urlToBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const base64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return view;
}

export async function importDbscPublicKey(publicKey: string): Promise<CryptoKey> {
  const trimmed = publicKey.trim();
  if (trimmed.startsWith("{")) {
    // JWK 形式
    return crypto.subtle.importKey(
      "jwk",
      JSON.parse(trimmed) as JsonWebKey,
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

    // payload に challenge が含まれていることを確認
    const payloadBytes = base64urlToBytes(payloadB64);
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as Record<string, unknown>;
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
  } catch {
    return false;
  }
}

/**
 * `Secure-Session-Registration` ヘッダーの値を構築する。
 *
 * このヘッダーをログインレスポンスに付与すると、対応ブラウザが TPM で鍵ペアを生成し、
 * `authorizationEndpoint` に公開鍵を POST して登録を完了する。
 *
 * @param challenge            - 登録リクエストを認証するためのチャレンジ（generateDbscChallenge() で生成）
 * @param appBaseUrl           - アプリのベース URL（例: "https://rss.0g0.xyz"）
 * @param authorizationPath    - 登録エンドポイントのパス（デフォルト: "/api/auth/dbsc/register"）
 * @returns JSON 文字列形式のヘッダー値
 *
 * @example
 * const headerValue = buildSecureSessionRegistrationHeader(
 *   generateDbscChallenge(),
 *   process.env.APP_BASE_URL!
 * );
 * response.headers.set('Secure-Session-Registration', headerValue);
 */
export function buildSecureSessionRegistrationHeader(
  challenge: string,
  appBaseUrl: string,
  authorizationPath = "/api/auth/dbsc/register",
): string {
  // TODO: DBSC 仕様では Structured Field Values (RFC 8941) 形式が要求される可能性がある。
  // 現時点では JSON 形式のスケルトンとして実装。仕様確定後にフォーマットを調整すること。
  // @see https://wicg.github.io/dbsc/#the-sec-session-registration-response-header
  const authorizationEndpoint = `${appBaseUrl}${authorizationPath}`;
  return JSON.stringify({
    challenge,
    authorization: authorizationEndpoint,
  });
}
