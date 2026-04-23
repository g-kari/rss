/**
 * Device Bound Session Credentials (DBSC) サポートライブラリ
 *
 * DBSC はブラウザセッションをデバイスの TPM（Trusted Platform Module）に紐付ける
 * Chrome のセキュリティ機能。ログイン時にブラウザが TPM 内で鍵ペアを生成し、
 * セッション更新時には秘密鍵の所持を証明する必要がある。
 *
 * 主なHTTPヘッダー:
 * - `Sec-Session-Registration`: サーバー → ブラウザ。新しい鍵ペアの登録を指示
 * - `Sec-Session-Challenge`:    サーバー → ブラウザ。鍵所持証明用チャレンジ
 * - `Sec-Session-Id`:           ブラウザ → サーバー。セッション識別子
 * - `Sec-Session-Response`:     ブラウザ → サーバー。チャレンジへの署名済みレスポンス
 *
 * @see https://wicg.github.io/dbsc/
 */

/**
 * DBSC 鍵登録情報（ブラウザからのリクエストボディ）
 */
export interface DbscRegistration {
  /** ブラウザが TPM で生成した P-256 ECDSA 公開鍵（PEM または JWK JSON 文字列） */
  publicKey: string;
  /** TPM アテステーション（オプション。対応デバイスのみ提供される） */
  attestation?: string;
  /** ブラウザが管理する DBSC セッション識別子 */
  sessionId: string;
}

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
 * ブラウザが DBSC をサポートしているかをクライアントサイドで判定する。
 *
 * `navigator.deviceBoundSession` が存在するかで判断する（Chrome 128+ で実装予定）。
 * サーバーサイドコード（Route Handler）では呼ばないこと。
 *
 * @returns DBSC 対応ブラウザなら true
 */
export function isDbscSupported(): boolean {
  // TODO: ブラウザの実装状況に応じてフラグ名が変わる可能性がある。
  // 現時点では Chrome の origin trial で 'deviceBoundSession' が使われているが、
  // 仕様確定後に正式な API 名に更新すること。
  // @see https://chromestatus.com/feature/5173968765018112
  return typeof navigator !== "undefined" && "deviceBoundSession" in navigator;
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
  // TODO: 本実装では生成したチャレンジを R2 または KV に短期間（例: 5分）保存し、
  // verifyDbscResponse での検証後に削除してリプレイ攻撃を防ぐこと。
  return crypto.randomUUID();
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
  _challenge: string,
  _response: string,
  _publicKey: string,
): Promise<boolean> {
  // TODO: Web Crypto API を使って P-256 ECDSA 署名を検証する実装が必要。
  //
  // 実装手順:
  // 1. publicKey を JWK または PEM から SubtleCrypto.importKey() でインポートする
  //    const key = await crypto.subtle.importKey(
  //      'jwk', // または 'spki' (PEM の場合は base64 デコードが必要)
  //      parsedPublicKey,
  //      { name: 'ECDSA', namedCurve: 'P-256' },
  //      false,
  //      ['verify']
  //    );
  //
  // 2. challenge を TextEncoder でバイト列に変換する
  //    const data = new TextEncoder().encode(challenge);
  //
  // 3. response（Sec-Session-Response）を署名バイト列にデコードする
  //    DBSC 仕様では JWS Compact Serialization 形式が想定されている
  //    const sigBytes = base64urlDecode(response.split('.')[2]);
  //
  // 4. SubtleCrypto.verify() で検証する
  //    const isValid = await crypto.subtle.verify(
  //      { name: 'ECDSA', hash: 'SHA-256' },
  //      key,
  //      sigBytes,
  //      data
  //    );
  //    return isValid;
  //
  // 参考: https://wicg.github.io/dbsc/#the-sec-session-response-header
  // 参考: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/verify
  return false;
}

/**
 * `Sec-Session-Registration` ヘッダーの値を構築する。
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
 * const headerValue = buildSecSessionRegistrationHeader(
 *   generateDbscChallenge(),
 *   process.env.APP_BASE_URL!
 * );
 * response.headers.set('Sec-Session-Registration', headerValue);
 */
export function buildSecSessionRegistrationHeader(
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
