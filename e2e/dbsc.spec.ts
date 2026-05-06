import { test, expect } from "@playwright/test";
import {
  generateDbscChallenge,
  buildSecureSessionRegistrationHeader,
  verifyDbscResponse,
  importDbscPublicKey,
} from "../src/lib/dbsc";

test.describe("generateDbscChallenge", () => {
  test("UUID v4 形式の文字列を返す", () => {
    const challenge = generateDbscChallenge();
    expect(challenge).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  test("呼び出すたびに異なる値を返す", () => {
    const a = generateDbscChallenge();
    const b = generateDbscChallenge();
    expect(a).not.toBe(b);
  });
});

test.describe("buildSecureSessionRegistrationHeader", () => {
  test("デフォルトパスで正しい RFC 8941 形式を返す", () => {
    const header = buildSecureSessionRegistrationHeader("test-challenge");
    expect(header).toBe('(ES256);path="/api/auth/dbsc/register";challenge="test-challenge"');
  });

  test("カスタムパスを使用できる", () => {
    const header = buildSecureSessionRegistrationHeader("my-challenge", "/custom/path");
    expect(header).toBe('(ES256);path="/custom/path";challenge="my-challenge"');
  });

  test("チャレンジ内のダブルクォートをエスケープする", () => {
    const header = buildSecureSessionRegistrationHeader('chal"lenge');
    expect(header).toContain('challenge="chal\\"lenge"');
  });

  test("パス内のバックスラッシュをエスケープする", () => {
    const header = buildSecureSessionRegistrationHeader("challenge", "/path\\with\\slashes");
    expect(header).toContain('path="/path\\\\with\\\\slashes"');
  });

  test("チャレンジ内のバックスラッシュをエスケープする", () => {
    const header = buildSecureSessionRegistrationHeader("chal\\lenge");
    expect(header).toContain('challenge="chal\\\\lenge"');
  });

  test("出力は (ES256) で始まる", () => {
    const header = buildSecureSessionRegistrationHeader("any");
    expect(header).toMatch(/^\(ES256\)/);
  });
});

test.describe("importDbscPublicKey", () => {
  test("JWK 形式の P-256 公開鍵をインポートできる", async () => {
    const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ]);
    const jwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const importedKey = await importDbscPublicKey(JSON.stringify(jwk));
    expect(importedKey).toBeTruthy();
  });

  test("不正な形式は例外を投げる", async () => {
    await expect(importDbscPublicKey("not-a-valid-key")).rejects.toThrow();
  });
});

test.describe("verifyDbscResponse", () => {
  async function makeSignedJws(challenge: string, privateKey: CryptoKey): Promise<string> {
    const header = btoa(JSON.stringify({ alg: "ES256", typ: "JWT" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
    const payload = btoa(JSON.stringify({ challenge }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
    const signingInput = `${header}.${payload}`;
    const sigBytes = await crypto.subtle.sign(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      privateKey,
      new TextEncoder().encode(signingInput),
    );
    const sig = btoa(String.fromCharCode(...new Uint8Array(sigBytes)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
    return `${header}.${payload}.${sig}`;
  }

  test("正しい署名は true を返す", async () => {
    const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ]);
    const challenge = generateDbscChallenge();
    const jws = await makeSignedJws(challenge, keyPair.privateKey);
    const jwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const result = await verifyDbscResponse(challenge, jws, JSON.stringify(jwk));
    expect(result).toBe(true);
  });

  test("チャレンジ不一致は false を返す", async () => {
    const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ]);
    const jws = await makeSignedJws("correct-challenge", keyPair.privateKey);
    const jwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const result = await verifyDbscResponse("wrong-challenge", jws, JSON.stringify(jwk));
    expect(result).toBe(false);
  });

  test("不正な署名は false を返す", async () => {
    const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ]);
    const otherKeyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const challenge = generateDbscChallenge();
    const jws = await makeSignedJws(challenge, otherKeyPair.privateKey);
    const jwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const result = await verifyDbscResponse(challenge, jws, JSON.stringify(jwk));
    expect(result).toBe(false);
  });

  test("不正な JWS 形式（ドット区切りでない）は false を返す", async () => {
    const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ]);
    const jwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const result = await verifyDbscResponse(
      "challenge",
      "not.a.valid.jws.format",
      JSON.stringify(jwk),
    );
    expect(result).toBe(false);
  });
});
