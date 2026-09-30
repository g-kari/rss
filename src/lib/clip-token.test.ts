// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authenticateClipToken,
  ClipTokenConflictError,
  createClipToken,
  getClipToken,
  revokeClipToken,
} from "./clip-token";

const USER = "synthetic-user";
const POINTER = `users/${USER}/clip-token.json`;
const NOW = Date.parse("2026-09-30T12:00:00.000Z");

function fakeBucket() {
  const store = new Map<string, { body: string; etag: string }>();
  let sequence = 0;
  let beforePut: ((key: string) => Promise<void>) | undefined;
  const get = vi.fn(async (key: string) => {
    const value = store.get(key);
    return value
      ? {
          etag: value.etag,
          size: new TextEncoder().encode(value.body).length,
          json: async () => JSON.parse(value.body),
        }
      : null;
  });
  const put = vi.fn(async (key: string, body: string, options?: R2PutOptions) => {
    if (beforePut) {
      const hook = beforePut;
      beforePut = undefined;
      await hook(key);
    }
    const condition = options?.onlyIf;
    if (condition instanceof Headers) {
      if (condition.get("If-None-Match") === "*" && store.has(key)) return null;
    } else {
      if (condition?.etagMatches && store.get(key)?.etag !== condition.etagMatches) return null;
      if (condition?.etagDoesNotMatch === "*" && store.has(key)) return null;
    }
    const etag = String(++sequence);
    store.set(key, { body, etag });
    return { etag };
  });
  const remove = vi.fn(async (key: string) => {
    store.delete(key);
  });
  return {
    bucket: { get, put, delete: remove } as unknown as R2Bucket,
    get,
    put,
    remove,
    store,
    beforePut: (hook: (key: string) => Promise<void>) => {
      beforePut = hook;
    },
    rewrite: (key: string, value: unknown) => {
      store.set(key, { body: JSON.stringify(value), etag: String(++sequence) });
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("SingleFile scoped tokens", () => {
  it("issues an opaque 256-bit secret for exactly 30 days and stores only its hash", async () => {
    const mock = fakeBucket();
    const created = await createClipToken(mock.bucket, USER);
    expect(created.token).toMatch(/^clip_v1\.[0-9a-f]{32}\.[0-9a-f]{64}$/);
    expect(created.createdAt).toBe(new Date(NOW).toISOString());
    expect(Date.parse(created.expiresAt) - NOW).toBe(30 * 24 * 60 * 60 * 1000);
    const secret = created.token.split(".")[2];
    const saved = [...mock.store.values()].map((entry) => entry.body).join("\n");
    expect(saved).not.toContain(secret);
    expect(saved).not.toContain(created.token);
    expect(JSON.parse(mock.store.get(`clip-tokens/${created.id}.json`)!.body)).toMatchObject({
      id: created.id,
      userId: USER,
      scope: "clip:write",
      secretHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    mock.get.mockClear();
    expect(await authenticateClipToken(mock.bucket, `Bearer ${created.token}`)).toEqual({
      userId: USER,
    });
    expect(mock.get).toHaveBeenCalledTimes(2);
    expect(await getClipToken(mock.bucket, USER)).toEqual({
      id: created.id,
      createdAt: created.createdAt,
      expiresAt: created.expiresAt,
    });
  });

  it.each([
    null,
    "",
    "Basic test",
    "Bearer ../users/victim",
    `Bearer clip_v1.${"a".repeat(31)}.${"b".repeat(64)}`,
    `Bearer clip_v1.${"a".repeat(32)}.${"b".repeat(63)}`,
    `Bearer clip_v1.${"a".repeat(32)}.${"b".repeat(64)}, other`,
    `Bearer clip_v1.${"a".repeat(32)}.${"b".repeat(64)}\n`,
    `Bearer clip_v1.${"A".repeat(32)}.${"b".repeat(64)}`,
    "Bearer " + "a".repeat(100_000),
  ])("rejects malformed credentials without a storage read: %s", async (authorization) => {
    const mock = fakeBucket();
    expect(await authenticateClipToken(mock.bucket, authorization)).toBeNull();
    expect(mock.get).not.toHaveBeenCalled();
  });

  it("rejects an unknown id and wrong secret, and accepts case-insensitive Bearer scheme", async () => {
    const mock = fakeBucket();
    const created = await createClipToken(mock.bucket, USER);
    expect(
      await authenticateClipToken(
        mock.bucket,
        `Bearer clip_v1.${"0".repeat(32)}.${"1".repeat(64)}`,
      ),
    ).toBeNull();
    expect(
      await authenticateClipToken(mock.bucket, `Bearer clip_v1.${created.id}.${"0".repeat(64)}`),
    ).toBeNull();
    expect(await authenticateClipToken(mock.bucket, `bEaReR ${created.token}`)).toEqual({
      userId: USER,
    });
  });

  it("expires at the exact expiry time and does not expose expired metadata", async () => {
    const mock = fakeBucket();
    const created = await createClipToken(mock.bucket, USER);
    vi.setSystemTime(Date.parse(created.expiresAt) - 1);
    expect(await authenticateClipToken(mock.bucket, `Bearer ${created.token}`)).not.toBeNull();
    vi.setSystemTime(Date.parse(created.expiresAt));
    expect(await authenticateClipToken(mock.bucket, `Bearer ${created.token}`)).toBeNull();
    expect(await getClipToken(mock.bucket, USER)).toBeNull();
  });

  it("rechecks expiry after reading the authoritative pointer", async () => {
    const mock = fakeBucket();
    const created = await createClipToken(mock.bucket, USER);
    const originalGet = mock.get.getMockImplementation()!;
    mock.get.mockImplementation(async (key) => {
      if (key === POINTER) vi.setSystemTime(Date.parse(created.expiresAt));
      return originalGet(key);
    });
    expect(await authenticateClipToken(mock.bucket, `Bearer ${created.token}`)).toBeNull();
  });

  it("rotates immediately and revokes using a persistent tombstone, even if cleanup fails", async () => {
    const mock = fakeBucket();
    const first = await createClipToken(mock.bucket, USER);
    mock.remove.mockRejectedValue(new Error("synthetic cleanup outage"));
    const second = await createClipToken(mock.bucket, USER);
    expect(await authenticateClipToken(mock.bucket, `Bearer ${first.token}`)).toBeNull();
    expect(await authenticateClipToken(mock.bucket, `Bearer ${second.token}`)).not.toBeNull();
    await revokeClipToken(mock.bucket, USER);
    expect(await authenticateClipToken(mock.bucket, `Bearer ${second.token}`)).toBeNull();
    expect(await getClipToken(mock.bucket, USER)).toBeNull();
    expect(mock.store.has(POINTER)).toBe(true);
    const firstTombstone = mock.store.get(POINTER)!.body;
    await revokeClipToken(mock.bucket, USER);
    expect(mock.store.get(POINTER)!.body).not.toBe(firstTombstone);
  });

  it("does not let an in-flight create undo a concurrent revocation", async () => {
    const mock = fakeBucket();
    const existing = await createClipToken(mock.bucket, USER);
    mock.beforePut(async () => {
      await revokeClipToken(mock.bucket, USER);
    });
    await expect(createClipToken(mock.bucket, USER)).rejects.toBeInstanceOf(ClipTokenConflictError);
    expect(await getClipToken(mock.bucket, USER)).toBeNull();
    expect(await authenticateClipToken(mock.bucket, `Bearer ${existing.token}`)).toBeNull();
  });

  it("also fences an in-flight first creation when there was no previous token", async () => {
    const mock = fakeBucket();
    mock.beforePut(async () => {
      await revokeClipToken(mock.bucket, USER);
    });
    await expect(createClipToken(mock.bucket, USER)).rejects.toBeInstanceOf(ClipTokenConflictError);
    expect(await getClipToken(mock.bucket, USER)).toBeNull();
  });

  it("allows only one of two creates from the same pointer revision to commit", async () => {
    const mock = fakeBucket();
    const results = await Promise.allSettled([
      createClipToken(mock.bucket, USER),
      createClipToken(mock.bucket, USER),
    ]);
    const succeeded = results.filter((result) => result.status === "fulfilled");
    const failed = results.filter((result) => result.status === "rejected");
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toBeInstanceOf(ClipTokenConflictError);
    expect(await authenticateClipToken(mock.bucket, `Bearer ${succeeded[0].value.token}`)).toEqual({
      userId: USER,
    });
  });

  it("reports a conflicting revoke instead of claiming that a concurrently rotated token was revoked", async () => {
    const mock = fakeBucket();
    await createClipToken(mock.bucket, USER);
    let latest = "";
    mock.beforePut(async () => {
      latest = (await createClipToken(mock.bucket, USER)).token;
    });
    await expect(revokeClipToken(mock.bucket, USER)).rejects.toBeInstanceOf(ClipTokenConflictError);
    expect(await authenticateClipToken(mock.bucket, `Bearer ${latest}`)).toEqual({ userId: USER });
  });

  it("uses record-owned identity and never grants another account's token through a pointer", async () => {
    const mock = fakeBucket();
    const alice = await createClipToken(mock.bucket, USER);
    const bob = await createClipToken(mock.bucket, "synthetic-bob");
    const pointer = JSON.parse(mock.store.get(POINTER)!.body);
    mock.rewrite(POINTER, { ...pointer, tokenId: bob.id });
    expect(await getClipToken(mock.bucket, USER)).toBeNull();
    expect(await authenticateClipToken(mock.bucket, `Bearer ${alice.token}`)).toBeNull();
    expect(await authenticateClipToken(mock.bucket, `Bearer ${bob.token}`)).toEqual({
      userId: "synthetic-bob",
    });
    const recordKey = `clip-tokens/${bob.id}.json`;
    const record = JSON.parse(mock.store.get(recordKey)!.body);
    mock.rewrite(recordKey, { ...record, userId: "../../victim" });
    mock.get.mockClear();
    expect(await authenticateClipToken(mock.bucket, `Bearer ${bob.token}`)).toBeNull();
    expect(mock.get).toHaveBeenCalledTimes(1);
  });

  it("does not delete another owner's token if a malformed ownership pointer references it", async () => {
    const mock = fakeBucket();
    const bob = await createClipToken(mock.bucket, "synthetic-bob");
    mock.rewrite(POINTER, { version: 1, revision: "a".repeat(32), tokenId: bob.id });
    await revokeClipToken(mock.bucket, USER);
    expect(await authenticateClipToken(mock.bucket, `Bearer ${bob.token}`)).toEqual({
      userId: "synthetic-bob",
    });
  });

  it.each([
    { scope: "all" },
    { scope: ["clip:write", "admin"] },
    { id: "invalid" },
    { secretHash: "not-a-hash" },
    { createdAt: "tomorrow" },
    { expiresAt: "2099-01-01T00:00:00.000Z" },
    { version: 999 },
  ])("fails closed on invalid stored token data %j", async (patch) => {
    const mock = fakeBucket();
    const created = await createClipToken(mock.bucket, USER);
    const key = `clip-tokens/${created.id}.json`;
    mock.rewrite(key, { ...JSON.parse(mock.store.get(key)!.body), ...patch });
    expect(await authenticateClipToken(mock.bucket, `Bearer ${created.token}`)).toBeNull();
    expect(await getClipToken(mock.bucket, USER)).toBeNull();
  });

  it("rejects malformed/oversized JSON and pointers without following attacker-selected paths", async () => {
    const mock = fakeBucket();
    const created = await createClipToken(mock.bucket, USER);
    mock.rewrite(POINTER, { version: 1, revision: "a".repeat(32), tokenId: "../victim" });
    expect(await authenticateClipToken(mock.bucket, `Bearer ${created.token}`)).toBeNull();
    expect(await getClipToken(mock.bucket, USER)).toBeNull();
    mock.store.set(POINTER, { body: "{", etag: "bad-json" });
    expect(await authenticateClipToken(mock.bucket, `Bearer ${created.token}`)).toBeNull();
    mock.store.set(POINTER, { body: "a".repeat(5000), etag: "too-large" });
    expect(await authenticateClipToken(mock.bucket, `Bearer ${created.token}`)).toBeNull();
  });

  it("propagates operational read/body failures rather than authenticating or reporting an absent token", async () => {
    const mock = fakeBucket();
    const created = await createClipToken(mock.bucket, USER);
    const outage = new Error("synthetic R2 outage");
    mock.get.mockRejectedValueOnce(outage);
    await expect(authenticateClipToken(mock.bucket, `Bearer ${created.token}`)).rejects.toBe(
      outage,
    );
    mock.get.mockRejectedValueOnce(outage);
    await expect(getClipToken(mock.bucket, USER)).rejects.toBe(outage);
    mock.get.mockResolvedValueOnce({
      etag: "etag",
      size: 100,
      json: async () => {
        throw outage;
      },
    });
    await expect(authenticateClipToken(mock.bucket, `Bearer ${created.token}`)).rejects.toBe(
      outage,
    );
  });

  it("never authenticates from a token record when its authoritative pointer is missing or unavailable", async () => {
    const mock = fakeBucket();
    const created = await createClipToken(mock.bucket, USER);
    const originalGet = mock.get.getMockImplementation()!;
    mock.get.mockImplementation(async (key) => {
      if (key === POINTER) throw new Error("synthetic pointer outage");
      return originalGet(key);
    });
    await expect(authenticateClipToken(mock.bucket, `Bearer ${created.token}`)).rejects.toThrow(
      "synthetic pointer outage",
    );
    mock.get.mockImplementation(originalGet);
    mock.store.delete(POINTER);
    expect(await authenticateClipToken(mock.bucket, `Bearer ${created.token}`)).toBeNull();
  });

  it("does not falsely report success when an authoritative write fails", async () => {
    const mock = fakeBucket();
    const created = await createClipToken(mock.bucket, USER);
    const originalPut = mock.put.getMockImplementation()!;
    mock.put.mockImplementation(async (key, body, options) => {
      if (key === POINTER) throw new Error("synthetic write outage");
      return originalPut(key, body, options);
    });
    await expect(createClipToken(mock.bucket, USER)).rejects.toThrow("synthetic write outage");
    await expect(revokeClipToken(mock.bucket, USER)).rejects.toThrow("synthetic write outage");
    expect(await authenticateClipToken(mock.bucket, `Bearer ${created.token}`)).toEqual({
      userId: USER,
    });
  });

  it("does not retry or delete the candidate after an ambiguous committed pointer write", async () => {
    const mock = fakeBucket();
    const existing = await createClipToken(mock.bucket, USER);
    const originalPut = mock.put.getMockImplementation()!;
    mock.put.mockImplementation(async (key, body, options) => {
      const result = await originalPut(key, body, options);
      if (key === POINTER) throw new Error("synthetic response lost after commit");
      return result;
    });
    mock.put.mockClear();
    await expect(createClipToken(mock.bucket, USER)).rejects.toThrow(
      "synthetic response lost after commit",
    );
    expect(mock.put).toHaveBeenCalledTimes(2);
    const pointer = JSON.parse(mock.store.get(POINTER)!.body);
    expect(pointer.tokenId).not.toBe(existing.id);
    expect(mock.store.has(`clip-tokens/${pointer.tokenId}.json`)).toBe(true);
    expect(await authenticateClipToken(mock.bucket, `Bearer ${existing.token}`)).toBeNull();
    // A subsequent explicit revocation can recover from the unknown issuance result.
    mock.put.mockImplementation(originalPut);
    await revokeClipToken(mock.bucket, USER);
    expect(await getClipToken(mock.bucket, USER)).toBeNull();
  });

  it("rejects unsafe management identities before any R2 access", async () => {
    const mock = fakeBucket();
    for (const userId of ["../victim", "", ".", "..", "a".repeat(129)]) {
      await expect(createClipToken(mock.bucket, userId)).rejects.toThrow();
      await expect(revokeClipToken(mock.bucket, userId)).rejects.toThrow();
      await expect(getClipToken(mock.bucket, userId)).rejects.toThrow();
    }
    expect(mock.get).not.toHaveBeenCalled();
    expect(mock.put).not.toHaveBeenCalled();
  });
});
