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

import { fetchWithTimeout } from "@/lib/fetch";

export interface JWTPayload {
  sub: string;
  exp: number;
  iat: number;
  iss?: string;
  aud?: string | string[];
  [key: string]: unknown;
}

interface JwkWithKid extends JsonWebKey {
  kid?: string;
}

const keyCache = new Map<string, CryptoKey>();
let jwksCache: JwkWithKid[] | null = null;
let jwksCacheExpiry = 0;
// 15 分間キャッシュ。Workers はリクエスト間でモジュールスコープを共有するため有効。
// ただしアイソレートが複数起動している場合は各インスタンスが独立したキャッシュを持つため、
// 鍵ローテーション時に古いキャッシュを持つインスタンスが最大 15 分間存在し得る（LOW リスク）。
// 0g0 ID の運用では頻繁な鍵ローテーションは想定しないため現状のままとする。
const JWKS_CACHE_TTL_MS = 15 * 60 * 1000;

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

  const userAgent =
    process.env.INTERNAL_SERVICE_USER_AGENT || "rss-reader/1.0 (+https://rss.0g0.xyz)";
  const res = await fetchWithTimeout(
    `${authBaseUrl}/.well-known/jwks.json`,
    { headers: { "User-Agent": userAgent } },
    10_000,
  );
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
 * 3. `iss` クレームが `authBaseUrl` と一致することを確認（クロスイシュアー再利用防止）
 * 4. `aud` クレームが `CLIENT_ID` を含むことを確認（クロスオーディエンス再利用防止）
 * 5. JWKS から `kid` に一致する公開鍵を取得し、署名を `crypto.subtle.verify` で検証
 */
export async function verifyJwt(token: string, authBaseUrl: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      console.error("[auth/verify] invalid JWT shape", { parts: parts.length });
      return null;
    }
    const [headerB64, payloadB64, sigB64] = parts;

    const header = JSON.parse(new TextDecoder().decode(base64urlToBytes(headerB64))) as {
      alg: string;
      kid?: string;
    };
    if (header.alg !== "ES256") {
      console.error("[auth/verify] unsupported alg", { alg: header.alg });
      return null;
    }

    const payload = JSON.parse(
      new TextDecoder().decode(base64urlToBytes(payloadB64)),
    ) as JWTPayload;

    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      console.error("[auth/verify] token expired or no exp", {
        exp: payload.exp,
        now: Math.floor(Date.now() / 1000),
      });
      return null;
    }

    // iss (issuer) クレーム検証 — authBaseUrl と厳密一致
    if (payload.iss !== authBaseUrl) {
      console.error("[auth/verify] iss claim mismatch", {
        expected: authBaseUrl,
        actual: payload.iss,
      });
      return null;
    }

    // aud (audience) 検証 — CLIENT_ID を優先。id.0g0.xyz が aud=authBaseUrl を
    // 発行する暫定実装に追従するため AUTH_BASE_URL もフォールバックで許容する。
    // TODO(#379): 上流で aud=CLIENT_ID に修正され次第、acceptedAuds から authBaseUrl を削除。
    // 削除時は acceptedAuds を [expectedAud] のみにして fallback warn ブロックも除去すること。
    const expectedAud = process.env.CLIENT_ID;
    if (!expectedAud) {
      console.error("[auth/verify] CLIENT_ID 未設定のため aud を検証できません");
      return null;
    }
    const acceptedAuds = [expectedAud, authBaseUrl];
    const audClaim = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    const matched = audClaim.find((a) => typeof a === "string" && acceptedAuds.includes(a));
    if (!matched) {
      console.error("[auth/verify] aud claim mismatch", {
        accepted: acceptedAuds,
        actual: payload.aud,
      });
      return null;
    }
    if (matched !== expectedAud) {
      console.warn("[auth/verify] aud fallback to authBaseUrl — id.0g0.xyz 側の修正待ち", {
        matched,
        expectedAud,
      });
    }

    const jwks = await getJwks(authBaseUrl);
    const jwk = header.kid ? jwks.find((k) => k.kid === header.kid) : jwks[0];
    if (!jwk) {
      console.error("[auth/verify] matching JWK not found", {
        kid: header.kid,
        jwksKids: jwks.map((k) => k.kid),
      });
      return null;
    }

    const cryptoKey = await getSigningKey(jwk);
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const sig = base64urlToBytes(sigB64).buffer as ArrayBuffer;

    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      cryptoKey,
      sig,
      data,
    );

    if (!valid) {
      console.error("[auth/verify] signature invalid", { kid: header.kid });
    }
    return valid ? payload : null;
  } catch (err) {
    console.error("[auth/verify] threw", { err: String(err) });
    return null;
  }
}

/** HTTP Basic 認証ヘッダー文字列を生成する（0g0 API への認証に使用）。 */
function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

/**
 * 0g0 auth server への共通ヘッダーを生成する。
 *
 * 認証方式: `Authorization: Basic <client_id:client_secret>` のみ。
 * 0g0-id の services テーブルに CLIENT_ID が登録されている必要がある。
 *
 * User-Agent を付けないと id.0g0.xyz の Cloudflare WAF / Bot Fight Mode が
 * Worker-to-Worker fetch を bot 扱いして 403 (Attention Required) を返すことがある。
 */
function authApiHeaders(): Record<string, string> {
  const clientId = process.env.CLIENT_ID!;
  const clientSecret = process.env.CLIENT_SECRET!;
  const userAgent =
    process.env.INTERNAL_SERVICE_USER_AGENT || "rss-reader/1.0 (+https://rss.0g0.xyz)";
  return {
    "Content-Type": "application/json",
    Authorization: basicAuthHeader(clientId, clientSecret),
    "User-Agent": userAgent,
  };
}

/**
 * 0g0-id からの応答が Cloudflare WAF / Bot Fight Mode の challenge ページかを判定する。
 *
 * WAF ブロック時は HTTP 403 で HTML ボディ（"Attention Required! | Cloudflare"）が
 * 返るため、以下を **AND** で検証して上流の正規エラーページ（footer に "Powered by Cloudflare"
 * を含むだけ等）を誤判定しないようにする:
 *
 * - Content-Type が `text/html`
 * - `cf-ray` ヘッダーが存在（Cloudflare エッジを必ず通過している証拠）
 * - 本文が WAF challenge 特有の強いシグナル（`attention required` か `/cdn-cgi/challenge`）を含む
 *
 * 検出時はログで運用者に通知し、本来の上流エラー（認可コード失効など）と区別できるようにする。
 */
export function isCloudflareBlock(
  contentType: string | null,
  body: string,
  cfRay: string | null,
): boolean {
  if (!cfRay) return false;
  const ct = (contentType || "").toLowerCase();
  if (!ct.includes("text/html")) return false;
  const head = body.slice(0, 2000).toLowerCase();
  return head.includes("attention required") || head.includes("/cdn-cgi/challenge");
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
  const endpoint = `${authBaseUrl}/auth/exchange`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: authApiHeaders(),
      body: JSON.stringify({ code, redirect_to: redirectTo }),
    });
    const contentType = res.headers.get("content-type");
    const cfRay = res.headers.get("cf-ray");
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "<read error>");
      if (isCloudflareBlock(contentType, bodyText, cfRay)) {
        console.error("[auth/exchange] Cloudflare WAF/Bot Fight にブロックされた", {
          status: res.status,
          redirectTo,
          cfRay,
          hint: "id.0g0.xyz の WAF 設定または CLIENT_ID/CLIENT_SECRET の登録を確認してください",
        });
      } else {
        console.error("[auth/exchange] non-2xx response", {
          status: res.status,
          redirectTo,
          cfRay,
          body: bodyText.slice(0, 500),
        });
      }
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
/**
 * 0g0-id の REST エラーレスポンス (`{ error: { code, message } }`) からコードを抽出する。
 * JSON パース失敗・想定外の構造は `null` を返す。レスポンスは clone して読むため呼び出し後も利用可能。
 */
async function readErrorCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.clone().json()) as { error?: { code?: unknown } };
    return typeof body?.error?.code === "string" ? body.error.code : null;
  } catch (err) {
    console.warn("[auth/readErrorCode] failed to parse error response:", err);
    return null;
  }
}

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
      headers: authApiHeaders(),
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch (err) {
    // ネットワークエラー・DNS・タイムアウト → 一時的失敗
    console.warn("[auth/refresh] network error:", err);
    return { kind: "transient" };
  }
  if (res.ok) {
    try {
      const { data } = (await res.json()) as {
        data: { access_token: string; refresh_token: string };
      };
      return { kind: "ok", tokens: data };
    } catch (err) {
      // レスポンスボディのパース失敗は上流バグ → 一時的失敗として扱う
      console.warn("[auth/refresh] response parse failed:", err);
      return { kind: "transient" };
    }
  }
  // Cloudflare WAF ブロック（403 HTML + cf-ray + challenge シグナル）は上流の refresh_token 失効ではなく
  // ネットワーク側の一時的な遮断なので、Cookie を失効させずに transient として扱う。
  // 判定は cf-ray 必須 + 強いシグナル(`attention required` / `/cdn-cgi/challenge`) の AND なので、
  // 上流の正規 403 Forbidden（JSON レスポンス・認可失敗）は従来どおり invalid として扱う。
  if (res.status === 403) {
    const cfRay = res.headers.get("cf-ray");
    const bodyText = await res
      .clone()
      .text()
      .catch(() => "");
    if (isCloudflareBlock(res.headers.get("content-type"), bodyText, cfRay)) {
      console.error("[auth/refresh] Cloudflare WAF/Bot Fight にブロックされた", {
        status: res.status,
        cfRay,
      });
      return { kind: "transient" };
    }
  }
  // issue #113: 0g0-id 側は並列リフレッシュ競合（30秒以内の rotation 済みトークン再提示）を
  // HTTP 401 + `{ error: { code: "TOKEN_ROTATED" } }` で返す。このとき新トークンは既に発行済みなので
  // Cookie を消すと正しいセッションまで無効化してしまう。`transient` にして次回リクエストに委ねる。
  if (res.status === 401) {
    const errorCode = await readErrorCode(res);
    if (errorCode === "TOKEN_ROTATED") {
      console.warn(
        "[auth/refresh] TOKEN_ROTATED (並列リフレッシュ競合) → transient で Cookie 保持",
      );
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
    headers: authApiHeaders(),
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

/** JWT ペイロードの exp クレームを base64 デコードで取得する（署名検証なし） */
export function getJwtExp(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64urlToBytes(parts[1]))) as {
      exp?: number;
    };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch (err) {
    console.warn("[auth/getJwtExp] failed to parse JWT:", err);
    return null;
  }
}
