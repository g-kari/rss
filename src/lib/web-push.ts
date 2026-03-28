/**
 * Web Push 通知送信ライブラリ (Cloudflare Workers 対応)
 *
 * Node.js の web-push パッケージは Workers で動作しないため、
 * crypto.subtle を使って VAPID 署名と RFC 8291 / aes128gcm 暗号化を実装する。
 *
 * 参照仕様:
 * - RFC 8030: Generic Event Delivery Using HTTP Push
 * - RFC 8292: Voluntary Application Server Identification (VAPID)
 * - RFC 8291: Message Encryption for Web Push
 * - RFC 8188: Encrypted Content-Encoding for HTTP
 */

import type { PushSubscriptionRecord } from "../types";
import { DEFAULT_FETCH_TIMEOUT_MS } from "./fetch";
import { base64urlToBytes } from "./auth";

// -------------------------------------------------------------------------
// ユーティリティ
// -------------------------------------------------------------------------

function base64urlEncode(buf: Uint8Array): string {
  let binary = "";
  for (const byte of buf) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function concatBytes(...arrays: Uint8Array<ArrayBufferLike>[]): Uint8Array<ArrayBuffer> {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

/** テキストを UTF-8 バイト列にエンコード */
const enc = new TextEncoder();

// -------------------------------------------------------------------------
// VAPID JWT 署名
// -------------------------------------------------------------------------

/**
 * VAPID JWT を生成して Authorization ヘッダー文字列を返す。
 *
 * @param audience   push エンドポイントの origin (e.g. "https://fcm.googleapis.com")
 * @param subject    mailto: または https: URI (管理者連絡先)
 * @param publicKeyB64url  65 バイト非圧縮 P-256 点の base64url
 * @param privateKeyB64url 32 バイト P-256 スカラーの base64url
 */
async function createVapidAuthHeader(
  audience: string,
  subject: string,
  publicKeyB64url: string,
  privateKeyB64url: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 12 * 60 * 60; // 12 時間

  const header = base64urlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = base64urlEncode(enc.encode(JSON.stringify({ aud: audience, exp, sub: subject })));
  const signingInput = `${header}.${payload}`;

  // P-256 秘密鍵をインポート（raw 32 バイト → JWK 経由）
  const privRaw = base64urlToBytes(privateKeyB64url);
  const pubRaw = base64urlToBytes(publicKeyB64url);
  // JWK からインポート: x/y は公開鍵 (bytes 1-32, 33-64)、d は秘密鍵
  const x = base64urlEncode(pubRaw.slice(1, 33));
  const y = base64urlEncode(pubRaw.slice(33, 65));
  const d = base64urlEncode(privRaw);

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x, y, d, key_ops: ["sign"] },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    enc.encode(signingInput),
  );

  const jwt = `${signingInput}.${base64urlEncode(new Uint8Array(sig))}`;
  return `vapid t=${jwt}, k=${publicKeyB64url}`;
}

// -------------------------------------------------------------------------
// RFC 8291 ペイロード暗号化 (aes128gcm content-encoding)
// -------------------------------------------------------------------------

/** HKDF-SHA256 で指定長のキーマテリアルを導出する */
async function hkdfSha256(
  ikm: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  length: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const baseKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    baseKey,
    length * 8,
  );
  return new Uint8Array(bits);
}

/**
 * RFC 8291 準拠の aes128gcm 暗号化を実行する。
 * 返値は aes128gcm エンコードされた完全なボディ（ヘッダー付き）。
 */
async function encryptPayload(
  subscription: PushSubscriptionRecord,
  plaintext: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  // 乱数 salt (16 bytes) とエフェメラル鍵ペアを生成
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );

  // サーバーエフェメラル公開鍵 (65 bytes uncompressed) — slice() で ArrayBuffer を確保
  const serverPubSpki = await crypto.subtle.exportKey("spki", serverKeyPair.publicKey);
  const serverPubRaw = new Uint8Array(serverPubSpki).slice(-65);

  // クライアント (受信者) の公開鍵をインポート
  const clientPubRaw = base64urlToBytes(subscription.keys.p256dh);
  const clientPubKey = await crypto.subtle.importKey(
    "raw",
    clientPubRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  // ECDH 共有秘密 (32 bytes)
  const ecdhBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientPubKey },
    serverKeyPair.privateKey,
    256,
  );
  const sharedSecret = new Uint8Array(ecdhBits);

  // auth シークレット (16 bytes)
  const authSecret = base64urlToBytes(subscription.keys.auth);

  // RFC 8291 Section 3.3: PRK の導出
  // PRK_key = HKDF(auth_secret, ecdh_secret, "WebPush: info\0" || dh_pub || as_pub, 32)
  const prk = await hkdfSha256(
    sharedSecret,
    authSecret,
    concatBytes(enc.encode("WebPush: info\0"), clientPubRaw, serverPubRaw),
    32,
  );

  // CEK (16 bytes) の導出
  const cek = await hkdfSha256(prk, salt, enc.encode("Content-Encoding: aes128gcm\0"), 16);

  // nonce (12 bytes) の導出
  const nonce = await hkdfSha256(prk, salt, enc.encode("Content-Encoding: nonce\0"), 12);

  // AES-128-GCM 暗号化 (padding delimiter 0x02 を末尾に追加)
  const paddedPlaintext = concatBytes(plaintext, new Uint8Array([0x02]));
  const cekKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    cekKey,
    paddedPlaintext,
  );

  // aes128gcm コンテンツエンコーディングヘッダーを構築
  // salt (16) + rs (4, big-endian) + idlen (1) + keyid (65)
  const rs = 4096; // レコードサイズ
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  const rsView = new DataView(header.buffer, 16, 4);
  rsView.setUint32(0, rs, false); // big-endian
  header[20] = 65; // idlen
  header.set(serverPubRaw, 21);

  return concatBytes(header, new Uint8Array(ciphertext));
}

// -------------------------------------------------------------------------
// 公開 API
// -------------------------------------------------------------------------

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

export interface PushResult {
  ok: boolean;
  /** true = 404/410 → サブスクリプションを削除すべき */
  gone: boolean;
}

/**
 * 1 件のサブスクリプションに Web Push 通知を送信する。
 *
 * VAPID 鍵は process.env.VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY から読む。
 * VAPID_SUBJECT は wrangler.toml の [vars] から読む (process.env.VAPID_SUBJECT)。
 */
export async function sendPush(
  subscription: PushSubscriptionRecord,
  payload: PushPayload,
): Promise<PushResult> {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";

  // VAPID 未設定時はスキップ（ローカル開発環境等）
  if (!publicKey || !privateKey) return { ok: false, gone: false };

  const audience = new URL(subscription.endpoint).origin;
  const authHeader = await createVapidAuthHeader(audience, subject, publicKey, privateKey);

  const body = encryptPayload(subscription, enc.encode(JSON.stringify(payload)));
  const encryptedBody = await body;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        TTL: "86400",
      },
      body: encryptedBody.buffer,
      signal: controller.signal,
    });
  } catch {
    return { ok: false, gone: false };
  } finally {
    clearTimeout(timeoutId);
  }

  // 404 / 410 = サブスクリプション失効
  if (res.status === 404 || res.status === 410) return { ok: false, gone: true };
  return { ok: res.ok, gone: false };
}

/**
 * ユーザーの全サブスクリプションに送信し、失効分を除外したリストを返す。
 */
export async function sendPushToAll(
  subscriptions: PushSubscriptionRecord[],
  payload: PushPayload,
): Promise<PushSubscriptionRecord[]> {
  const results = await Promise.allSettled(subscriptions.map((sub) => sendPush(sub, payload)));

  return subscriptions.filter((_, i) => {
    const r = results[i];
    return r.status === "rejected" || !r.value.gone;
  });
}
