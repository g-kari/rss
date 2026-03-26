/**
 * VAPID 鍵ペア生成スクリプト
 *
 * 使い方:
 *   node scripts/generate-vapid-keys.mjs
 *
 * 出力された鍵を Cloudflare シークレットに登録:
 *   npx wrangler secret put VAPID_PUBLIC_KEY
 *   npx wrangler secret put VAPID_PRIVATE_KEY
 *
 * 公開鍵フォーマット: 65 バイト非圧縮 P-256 点 (0x04 || x || y) の base64url
 * 秘密鍵フォーマット: 32 バイト P-256 スカラー の base64url
 */

import { webcrypto } from "node:crypto";

const { subtle } = webcrypto;

// VAPID 用の ECDH P-256 鍵ペアを生成（ECDSA P-256 と同じ曲線）
// ECDSA での署名に使うため、usage は ['sign'] + 'ECDSA' でも生成できるが
// ここでは JWK 経由で raw バイトを取得するため ECDH で生成する
const keyPair = await subtle.generateKey(
  { name: "ECDH", namedCurve: "P-256" },
  true, // エクスポート可能
  ["deriveBits"],
);

// JWK 形式でエクスポート（x, y, d が base64url で得られる）
const pubJwk = await subtle.exportKey("jwk", keyPair.publicKey);
const privJwk = await subtle.exportKey("jwk", keyPair.privateKey);

// 公開鍵: 65 バイト非圧縮点 (0x04 || x || y) を構築
const x = Buffer.from(pubJwk.x, "base64url");
const y = Buffer.from(pubJwk.y, "base64url");
const uncompressed = Buffer.concat([Buffer.from([0x04]), x, y]);
const pubBase64url = uncompressed.toString("base64url");

// 秘密鍵: JWK の d フィールド (32 バイトスカラー) をそのまま使う
const privBase64url = privJwk.d;

console.log("=== VAPID 鍵ペア ===");
console.log("");
console.log("VAPID_PUBLIC_KEY (65 bytes uncompressed P-256):");
console.log(pubBase64url);
console.log("");
console.log("VAPID_PRIVATE_KEY (32 bytes P-256 scalar):");
console.log(privBase64url);
console.log("");
console.log("=== Cloudflare シークレット登録 ===");
console.log("npx wrangler secret put VAPID_PUBLIC_KEY");
console.log("npx wrangler secret put VAPID_PRIVATE_KEY");
