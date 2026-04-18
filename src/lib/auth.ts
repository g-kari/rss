/**
 * 0g0 ID (OAuth2 + ES256 JWT) による認証ライブラリ。
 *
 * ## フロー概要
 * 1. `GET /api/auth/login` → ブラウザを 0g0 の認可エンドポイントにリダイレクト
 * 2. `GET /api/auth/callback?code=...` → `exchangeCode()` で認可コードをトークンに交換
 * 3. access_token (15分) / refresh_token (30日) を HttpOnly cookie にセット
 * 4. 各 Route Handler では `verifyJwt()` で access_token を検証
 * 5. access_token 期限切れ時は `refreshTokens()` で自動更新
 * 6. `POST /api/auth/logout` → `revokeToken()` で refresh_token を失効
 *
 * ## JWKS キャッシュ戦略
 * - JWKS は 15 分間メモリキャッシュ（`jwksCache`）
 * - パース済み CryptoKey も `keyCache` にキャッシュ（JWKS 更新時にクリア）
 * - Workers はリクエスト間でモジュールスコープを共有するため有効
 */

export interface JWTPayload {
  sub: string;
  exp: number;
  iat: number;
  [key: string]: unknown;
}

interface JwkWithKid extends JsonWebKey {
  kid?: string;
}

const keyCache = new Map<string, CryptoKey>();
let jwksCache: JwkWithKid[] | null = null;
let jwksCacheExpiry = 0;
const JWKS_CACHE_TTL_MS = 15 * 60 * 1000; // 15分

/**
 * Base64URL 文字列を `Uint8Array` に変換する。
 * JWT の署名検証時に header/payload/signature を `crypto.subtle` に渡す際に使用。
 */
export function base64urlToBytes(str: string): Uint8Array<ArrayBuffer> {
  const padded = str
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(str.length + ((4 - (str.length % 4)) % 4), "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/**
 * 0g0 auth server の `/.well-known/jwks.json` から公開鍵セットを取得する。
 * 取得結果は `JWKS_CACHE_TTL_MS`（15分）メモリキャッシュされる。
 * キャッシュ期限切れ時は `keyCache` も同時にクリアし、鍵ローテーションに対応する。
 */
async function getJwks(authBaseUrl: string): Promise<JwkWithKid[]> {
  const now = Date.now();
  if (jwksCache && now < jwksCacheExpiry) return jwksCache;

  // キャッシュ期限切れ時はキーキャッシュも破棄（ローテーション対応）
  keyCache.clear();

  const res = await fetch(`${authBaseUrl}/.well-known/jwks.json`);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const { keys } = (await res.json()) as { keys: JwkWithKid[] };
  jwksCache = keys;
  jwksCacheExpiry = now + JWKS_CACHE_TTL_MS;
  return keys;
}

/**
 * JWK オブジェクトを Web Crypto API の `CryptoKey` に変換する。
 * 変換済みのキーは `keyCache` にキャッシュされ、同じ `kid` の再インポートを避ける。
 */
async function getSigningKey(jwk: JwkWithKid): Promise<CryptoKey> {
  const kid = jwk.kid ?? "default";
  if (keyCache.has(kid)) return keyCache.get(kid)!;
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  keyCache.set(kid, key);
  return key;
}

/**
 * ES256 JWT を検証し、ペイロードを返す。失敗時は `null` を返す。
 *
 * 検証ステップ:
 * 1. ヘッダーの `alg` が `"ES256"` であることを確認
 * 2. `exp` クレームが現在時刻より未来であることを確認
 * 3. JWKS から `kid` に一致する公開鍵を取得し、署名を `crypto.subtle.verify` で検証
 */
export async function verifyJwt(token: string, authBaseUrl: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;

    const header = JSON.parse(new TextDecoder().decode(base64urlToBytes(headerB64))) as {
      alg: string;
      kid?: string;
    };
    if (header.alg !== "ES256") return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64urlToBytes(payloadB64)),
    ) as JWTPayload;

    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;

    const jwks = await getJwks(authBaseUrl);
    const jwk = header.kid ? jwks.find((k) => k.kid === header.kid) : jwks[0];
    if (!jwk) return null;

    const cryptoKey = await getSigningKey(jwk);
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const sig = base64urlToBytes(sigB64).buffer as ArrayBuffer;

    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      cryptoKey,
      sig,
      data,
    );

    return valid ? payload : null;
  } catch {
    return null;
  }
}

/** HTTP Basic 認証ヘッダー文字列を生成する（0g0 API への認証に使用）。 */
function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

export interface TokenData {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    name: string;
    picture: string | null;
    role: string;
  };
}

/**
 * OAuth2 認可コードをアクセストークン・リフレッシュトークンに交換する。
 * `/api/auth/callback` Route Handler から呼び出される。
 * 失敗時（非 2xx レスポンス）は `null` を返し、診断情報を console.error に出力する。
 *
 * ## よくある失敗原因
 * - `CLIENT_ID` / `CLIENT_SECRET` の Workers secret が未設定 or 不一致
 * - `APP_BASE_URL/api/auth/callback` が id.0g0.xyz 側の登録 redirect_uri と不一致
 * - 認可コードの期限切れ or 再利用（ブラウザバック等）
 * - id.0g0.xyz の一時的な 5xx / ネットワーク障害
 */
export async function exchangeCode(code: string, redirectTo: string): Promise<TokenData | null> {
  const authBaseUrl = process.env.AUTH_BASE_URL!;
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("[auth/exchange] CLIENT_ID / CLIENT_SECRET が未設定です");
    return null;
  }
  try {
    const res = await fetch(`${authBaseUrl}/auth/exchange`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: basicAuthHeader(clientId, clientSecret),
      },
      body: JSON.stringify({ code, redirect_to: redirectTo }),
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "<read error>");
      console.error("[auth/exchange] non-2xx response", {
        status: res.status,
        redirectTo,
        body: bodyText.slice(0, 500),
      });
      return null;
    }
    const { data } = (await res.json()) as { data: TokenData };
    return data;
  } catch (err) {
    console.error("[auth/exchange] fetch threw", { redirectTo, err: String(err) });
    return null;
  }
}

/**
 * リフレッシュトークンを使って新しいアクセストークンとリフレッシュトークンを取得する。
 * access_token (15分) 期限切れ時に `requireSession()` から自動的に呼び出される。
 *
 * 戻り値は判別可能 union:
 *  - `ok`: 新しいトークン取得成功
 *  - `invalid`: refresh_token が失効・無効（4xx）— 恒久的失敗でログアウト扱い
 *  - `transient`: 上流認可サーバーの 5xx / ネットワークエラー / タイムアウト — 一時的失敗で Cookie は保持
 *
 * 以前は失敗を一律 `null` で返していたため、一時的な上流障害でもユーザーが
 * 強制ログアウトされてしまう不具合があった。
 */
export type RefreshResult =
  | { kind: "ok"; tokens: { access_token: string; refresh_token: string } }
  | { kind: "invalid" }
  | { kind: "transient" };

export async function refreshTokens(refreshToken: string): Promise<RefreshResult> {
  const authBaseUrl = process.env.AUTH_BASE_URL!;
  let res: Response;
  try {
    res = await fetch(`${authBaseUrl}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: basicAuthHeader(process.env.CLIENT_ID!, process.env.CLIENT_SECRET!),
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    // ネットワークエラー・DNS・タイムアウト → 一時的失敗
    return { kind: "transient" };
  }
  if (res.ok) {
    try {
      const { data } = (await res.json()) as {
        data: { access_token: string; refresh_token: string };
      };
      return { kind: "ok", tokens: data };
    } catch {
      // レスポンスボディのパース失敗は上流バグ → 一時的失敗として扱う
      return { kind: "transient" };
    }
  }
  // 4xx: refresh_token 失効・無効 (invalid_grant, 401 Unauthorized など) → 恒久的失敗
  if (res.status >= 400 && res.status < 500) return { kind: "invalid" };
  // 5xx: 上流障害 → 一時的失敗
  return { kind: "transient" };
}

/**
 * リフレッシュトークンを 0g0 auth server で失効させる。
 * `/api/auth/logout` Route Handler から呼び出される。
 * エラー時は例外を投げず、サイレントに失敗する（cookie クリアを優先するため）。
 */
export async function revokeToken(refreshToken: string): Promise<void> {
  const authBaseUrl = process.env.AUTH_BASE_URL!;
  await fetch(`${authBaseUrl}/auth/logout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuthHeader(process.env.CLIENT_ID!, process.env.CLIENT_SECRET!),
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}
