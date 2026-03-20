import type { Env } from '../types';

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
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1時間

function base64urlToBytes(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    str.length + (4 - (str.length % 4)) % 4,
    '='
  );
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function getJwks(authBaseUrl: string): Promise<JwkWithKid[]> {
  const now = Date.now();
  if (jwksCache && now < jwksCacheExpiry) return jwksCache;

  // キャッシュ期限切れ時はキーキャッシュも破棄（ローテーション対応）
  keyCache.clear();

  const res = await fetch(`${authBaseUrl}/.well-known/jwks.json`);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const { keys } = await res.json<{ keys: JwkWithKid[] }>();
  jwksCache = keys;
  jwksCacheExpiry = now + JWKS_CACHE_TTL_MS;
  return keys;
}

async function getSigningKey(jwk: JwkWithKid): Promise<CryptoKey> {
  const kid = jwk.kid ?? 'default';
  if (keyCache.has(kid)) return keyCache.get(kid)!;
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  );
  keyCache.set(kid, key);
  return key;
}

export async function verifyJwt(token: string, authBaseUrl: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;

    const header = JSON.parse(
      new TextDecoder().decode(base64urlToBytes(headerB64))
    ) as { alg: string; kid?: string };
    if (header.alg !== 'ES256') return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64urlToBytes(payloadB64))
    ) as JWTPayload;

    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    const jwks = await getJwks(authBaseUrl);
    const jwk = header.kid ? jwks.find((k) => k.kid === header.kid) : jwks[0];
    if (!jwk) return null;

    const cryptoKey = await getSigningKey(jwk);
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const sig = base64urlToBytes(sigB64).buffer as ArrayBuffer;

    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      cryptoKey,
      sig,
      data
    );

    return valid ? payload : null;
  } catch {
    return null;
  }
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  const creds = new TextEncoder().encode(`${clientId}:${clientSecret}`);
  const binary = Array.from(creds, (b) => String.fromCharCode(b)).join('');
  return `Basic ${btoa(binary)}`;
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

export async function exchangeCode(
  code: string,
  redirectTo: string,
  env: Env
): Promise<TokenData | null> {
  const res = await fetch(`${env.AUTH_BASE_URL}/auth/exchange`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: basicAuthHeader(env.CLIENT_ID, env.CLIENT_SECRET),
    },
    body: JSON.stringify({ code, redirect_to: redirectTo }),
  });
  if (!res.ok) return null;
  const { data } = await res.json<{ data: TokenData }>();
  return data;
}

export async function refreshTokens(
  refreshToken: string,
  env: Env
): Promise<{ access_token: string; refresh_token: string } | null> {
  const res = await fetch(`${env.AUTH_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: basicAuthHeader(env.CLIENT_ID, env.CLIENT_SECRET),
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) return null;
  const { data } = await res.json<{ data: { access_token: string; refresh_token: string } }>();
  return data;
}

export async function revokeToken(refreshToken: string, env: Env): Promise<void> {
  await fetch(`${env.AUTH_BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: basicAuthHeader(env.CLIENT_ID, env.CLIENT_SECRET),
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}
