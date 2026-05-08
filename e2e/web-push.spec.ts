import { test, expect } from "@playwright/test";
import { sendPush, sendPushToAll, type PushPayload } from "../src/lib/web-push";
import type { PushSubscriptionRecord } from "../src/types";

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

/**
 * テスト用の P-256 鍵ペアを生成し、base64url エンコードされた公開鍵・秘密鍵を返す。
 * VAPID の公開鍵は 65 バイト uncompressed 形式 (SPKI の末尾 65 バイト)。
 */
async function generateTestVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  // ECDSA P-256 鍵ペアで生成（VAPID は ECDSA で署名）
  const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  // 公開鍵: SPKI エクスポートの末尾 65 バイトが uncompressed P-256 点
  const spki = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const pubRaw = new Uint8Array(spki).slice(-65);
  // 秘密鍵: JWK の d フィールドが raw スカラー (base64url)
  const privJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  function base64urlEncode(buf: Uint8Array): string {
    let binary = "";
    for (const byte of buf) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  return {
    publicKey: base64urlEncode(pubRaw),
    // d は既に base64url エンコード済み (JWK フィールド)
    privateKey: privJwk.d!,
  };
}

/**
 * テスト用の PushSubscriptionRecord を生成する。
 * keys.p256dh / keys.auth は実際の暗号処理に使えるランダムな有効値。
 */
async function makeSubscription(
  overrides: Partial<PushSubscriptionRecord> = {},
): Promise<PushSubscriptionRecord> {
  // p256dh: 65 バイト uncompressed P-256 公開鍵
  const clientKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const spki = await crypto.subtle.exportKey("spki", clientKeyPair.publicKey);
  const p256dhBytes = new Uint8Array(spki).slice(-65);

  // auth: 16 バイトランダム
  const authBytes = crypto.getRandomValues(new Uint8Array(16));

  function base64urlEncode(buf: Uint8Array): string {
    let binary = "";
    for (const byte of buf) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  return {
    endpoint: "https://fcm.googleapis.com/fcm/send/test-token",
    expirationTime: null,
    keys: {
      p256dh: base64urlEncode(p256dhBytes),
      auth: base64urlEncode(authBytes),
    },
    ...overrides,
  };
}

const TEST_PAYLOAD: PushPayload = {
  title: "テスト通知",
  body: "テスト本文",
  url: "/",
};

// ---------------------------------------------------------------------------
// VAPID 環境変数未設定時のフォールバック
// ---------------------------------------------------------------------------

test.describe("sendPush — VAPID 未設定", () => {
  test("VAPID_PUBLIC_KEY が未設定の場合は { ok: false, gone: false } を返す", async () => {
    const sub = await makeSubscription();
    const originalPublic = process.env.VAPID_PUBLIC_KEY;
    const originalPrivate = process.env.VAPID_PRIVATE_KEY;
    try {
      delete process.env.VAPID_PUBLIC_KEY;
      delete process.env.VAPID_PRIVATE_KEY;
      const result = await sendPush(sub, TEST_PAYLOAD);
      expect(result).toEqual({ ok: false, gone: false });
    } finally {
      if (originalPublic !== undefined) process.env.VAPID_PUBLIC_KEY = originalPublic;
      if (originalPrivate !== undefined) process.env.VAPID_PRIVATE_KEY = originalPrivate;
    }
  });

  test("VAPID_PRIVATE_KEY のみ未設定の場合は { ok: false, gone: false } を返す", async () => {
    const sub = await makeSubscription();
    const originalPublic = process.env.VAPID_PUBLIC_KEY;
    const originalPrivate = process.env.VAPID_PRIVATE_KEY;
    try {
      process.env.VAPID_PUBLIC_KEY = "dummy-pub";
      delete process.env.VAPID_PRIVATE_KEY;
      const result = await sendPush(sub, TEST_PAYLOAD);
      expect(result).toEqual({ ok: false, gone: false });
    } finally {
      if (originalPublic !== undefined) process.env.VAPID_PUBLIC_KEY = originalPublic;
      else delete process.env.VAPID_PUBLIC_KEY;
      if (originalPrivate !== undefined) process.env.VAPID_PRIVATE_KEY = originalPrivate;
    }
  });
});

// ---------------------------------------------------------------------------
// 無効な endpoint URL（SSRF 多層防御）
// ---------------------------------------------------------------------------

test.describe("sendPush — 無効な endpoint", () => {
  test("endpoint がプライベート IP の場合は { ok: false, gone: false } を返す", async () => {
    const keys = await generateTestVapidKeys();
    const originalPublic = process.env.VAPID_PUBLIC_KEY;
    const originalPrivate = process.env.VAPID_PRIVATE_KEY;
    try {
      process.env.VAPID_PUBLIC_KEY = keys.publicKey;
      process.env.VAPID_PRIVATE_KEY = keys.privateKey;
      const sub = await makeSubscription({
        endpoint: "https://192.168.1.1/push",
      });
      const result = await sendPush(sub, TEST_PAYLOAD);
      expect(result).toEqual({ ok: false, gone: false });
    } finally {
      if (originalPublic !== undefined) process.env.VAPID_PUBLIC_KEY = originalPublic;
      else delete process.env.VAPID_PUBLIC_KEY;
      if (originalPrivate !== undefined) process.env.VAPID_PRIVATE_KEY = originalPrivate;
      else delete process.env.VAPID_PRIVATE_KEY;
    }
  });

  test("endpoint が http:// の場合は { ok: false, gone: false } を返す", async () => {
    const keys = await generateTestVapidKeys();
    const originalPublic = process.env.VAPID_PUBLIC_KEY;
    const originalPrivate = process.env.VAPID_PRIVATE_KEY;
    try {
      process.env.VAPID_PUBLIC_KEY = keys.publicKey;
      process.env.VAPID_PRIVATE_KEY = keys.privateKey;
      const sub = await makeSubscription({
        endpoint: "http://fcm.googleapis.com/push",
      });
      const result = await sendPush(sub, TEST_PAYLOAD);
      expect(result).toEqual({ ok: false, gone: false });
    } finally {
      if (originalPublic !== undefined) process.env.VAPID_PUBLIC_KEY = originalPublic;
      else delete process.env.VAPID_PUBLIC_KEY;
      if (originalPrivate !== undefined) process.env.VAPID_PRIVATE_KEY = originalPrivate;
      else delete process.env.VAPID_PRIVATE_KEY;
    }
  });
});

// ---------------------------------------------------------------------------
// fetch モックによる送信結果テスト
// ---------------------------------------------------------------------------

test.describe("sendPush — fetch レスポンス別の戻り値", () => {
  let vapidKeys: { publicKey: string; privateKey: string };
  let sub: PushSubscriptionRecord;
  const originalFetch = global.fetch;
  const originalPublic = process.env.VAPID_PUBLIC_KEY;
  const originalPrivate = process.env.VAPID_PRIVATE_KEY;

  test.beforeAll(async () => {
    vapidKeys = await generateTestVapidKeys();
    sub = await makeSubscription();
  });

  test.beforeEach(() => {
    process.env.VAPID_PUBLIC_KEY = vapidKeys.publicKey;
    process.env.VAPID_PRIVATE_KEY = vapidKeys.privateKey;
  });

  test.afterEach(() => {
    global.fetch = originalFetch;
    if (originalPublic !== undefined) process.env.VAPID_PUBLIC_KEY = originalPublic;
    else delete process.env.VAPID_PUBLIC_KEY;
    if (originalPrivate !== undefined) process.env.VAPID_PRIVATE_KEY = originalPrivate;
    else delete process.env.VAPID_PRIVATE_KEY;
  });

  test("201 Created → { ok: true, gone: false }", async () => {
    global.fetch = async () => new Response(null, { status: 201 }) as Response;
    const result = await sendPush(sub, TEST_PAYLOAD);
    expect(result).toEqual({ ok: true, gone: false });
  });

  test("200 OK → { ok: true, gone: false }", async () => {
    global.fetch = async () => new Response(null, { status: 200 }) as Response;
    const result = await sendPush(sub, TEST_PAYLOAD);
    expect(result).toEqual({ ok: true, gone: false });
  });

  test("410 Gone → { ok: false, gone: true }", async () => {
    global.fetch = async () => new Response(null, { status: 410 }) as Response;
    const result = await sendPush(sub, TEST_PAYLOAD);
    expect(result).toEqual({ ok: false, gone: true });
  });

  test("404 Not Found → { ok: false, gone: true }", async () => {
    global.fetch = async () => new Response(null, { status: 404 }) as Response;
    const result = await sendPush(sub, TEST_PAYLOAD);
    expect(result).toEqual({ ok: false, gone: true });
  });

  test("500 Server Error → { ok: false, gone: false }", async () => {
    global.fetch = async () => new Response(null, { status: 500 }) as Response;
    const result = await sendPush(sub, TEST_PAYLOAD);
    expect(result).toEqual({ ok: false, gone: false });
  });

  test("fetch が例外を throw → { ok: false, gone: false }", async () => {
    global.fetch = async () => {
      throw new Error("Network error");
    };
    const result = await sendPush(sub, TEST_PAYLOAD);
    expect(result).toEqual({ ok: false, gone: false });
  });

  test("fetch が AbortError を throw → { ok: false, gone: false }", async () => {
    global.fetch = async () => {
      const err = new DOMException("aborted", "AbortError");
      throw err;
    };
    const result = await sendPush(sub, TEST_PAYLOAD);
    expect(result).toEqual({ ok: false, gone: false });
  });

  test("送信時に Authorization: vapid ヘッダーが付与される", async () => {
    let capturedHeaders: Headers | null = null;
    global.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers as HeadersInit);
      return new Response(null, { status: 201 });
    };
    await sendPush(sub, TEST_PAYLOAD);
    expect(capturedHeaders).not.toBeNull();
    const auth = capturedHeaders!.get("Authorization") ?? "";
    expect(auth).toMatch(/^vapid t=eyJ/);
    expect(auth).toContain(", k=");
  });

  test("送信時に Content-Encoding: aes128gcm ヘッダーが付与される", async () => {
    let capturedHeaders: Headers | null = null;
    global.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers as HeadersInit);
      return new Response(null, { status: 201 });
    };
    await sendPush(sub, TEST_PAYLOAD);
    expect(capturedHeaders!.get("Content-Encoding")).toBe("aes128gcm");
    expect(capturedHeaders!.get("Content-Type")).toBe("application/octet-stream");
  });
});

// ---------------------------------------------------------------------------
// sendPushToAll — 複数サブスクリプションの一括送信
// ---------------------------------------------------------------------------

test.describe("sendPushToAll", () => {
  let vapidKeys: { publicKey: string; privateKey: string };
  let sub1: PushSubscriptionRecord;
  let sub2: PushSubscriptionRecord;
  let sub3: PushSubscriptionRecord;
  const originalFetch = global.fetch;
  const originalPublic = process.env.VAPID_PUBLIC_KEY;
  const originalPrivate = process.env.VAPID_PRIVATE_KEY;

  test.beforeAll(async () => {
    vapidKeys = await generateTestVapidKeys();
    sub1 = await makeSubscription({
      endpoint: "https://fcm.googleapis.com/fcm/send/sub1",
    });
    sub2 = await makeSubscription({
      endpoint: "https://fcm.googleapis.com/fcm/send/sub2",
    });
    sub3 = await makeSubscription({
      endpoint: "https://fcm.googleapis.com/fcm/send/sub3",
    });
  });

  test.beforeEach(() => {
    process.env.VAPID_PUBLIC_KEY = vapidKeys.publicKey;
    process.env.VAPID_PRIVATE_KEY = vapidKeys.privateKey;
  });

  test.afterEach(() => {
    global.fetch = originalFetch;
    if (originalPublic !== undefined) process.env.VAPID_PUBLIC_KEY = originalPublic;
    else delete process.env.VAPID_PUBLIC_KEY;
    if (originalPrivate !== undefined) process.env.VAPID_PRIVATE_KEY = originalPrivate;
    else delete process.env.VAPID_PRIVATE_KEY;
  });

  test("全員 201 → 全サブスクリプションが返る", async () => {
    global.fetch = async () => new Response(null, { status: 201 });
    const remaining = await sendPushToAll([sub1, sub2], TEST_PAYLOAD);
    expect(remaining).toHaveLength(2);
  });

  test("410 gone のサブスクリプションは除外される", async () => {
    // sub1 → 201（有効）、sub2 → 410（失効）
    global.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      return url.includes("sub1")
        ? new Response(null, { status: 201 })
        : new Response(null, { status: 410 });
    };
    const remaining = await sendPushToAll([sub1, sub2], TEST_PAYLOAD);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].endpoint).toBe(sub1.endpoint);
  });

  test("404 gone のサブスクリプションは除外される", async () => {
    // sub2 → 201、sub3 → 404（失効）
    global.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      return url.includes("sub3")
        ? new Response(null, { status: 404 })
        : new Response(null, { status: 201 });
    };
    const remaining = await sendPushToAll([sub2, sub3], TEST_PAYLOAD);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].endpoint).toBe(sub2.endpoint);
  });

  test("全員 410 → 空配列が返る", async () => {
    global.fetch = async () => new Response(null, { status: 410 });
    const remaining = await sendPushToAll([sub1, sub2, sub3], TEST_PAYLOAD);
    expect(remaining).toHaveLength(0);
  });

  test("fetch がエラーの場合は gone でないので除外されない", async () => {
    global.fetch = async () => {
      throw new Error("Network error");
    };
    const remaining = await sendPushToAll([sub1, sub2], TEST_PAYLOAD);
    // エラー時は gone=false → 除外されない（サブスクリプション自体は保持）
    expect(remaining).toHaveLength(2);
  });

  test("空配列を渡した場合は空配列が返る", async () => {
    const remaining = await sendPushToAll([], TEST_PAYLOAD);
    expect(remaining).toHaveLength(0);
  });

  test("VAPID 未設定の場合は gone でないため全サブスクリプションが保持される", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    const remaining = await sendPushToAll([sub1, sub2], TEST_PAYLOAD);
    // VAPID未設定 → ok=false, gone=false → 除外されない
    expect(remaining).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// PushPayload インターフェースの構造確認（型レベル）
// ---------------------------------------------------------------------------

test.describe("PushPayload 型", () => {
  test("title / body / url を持つオブジェクトが PushPayload として使えること", () => {
    const payload: PushPayload = { title: "タイトル", body: "本文", url: "/path" };
    expect(payload.title).toBe("タイトル");
    expect(payload.body).toBe("本文");
    expect(payload.url).toBe("/path");
  });
});
