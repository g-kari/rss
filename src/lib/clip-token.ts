import { sha256Hex } from "./r2";
import { isPlainObject } from "./type-guards";
import { isValidUserId } from "./validation";

const TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_RECORD_BYTES = 4096;
const ID_RE = /^[0-9a-f]{32}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const TOKEN_RE = /^clip_v1\.([0-9a-f]{32})\.([0-9a-f]{64})$/;

export interface ClipTokenMetadata {
  id: string;
  createdAt: string;
  expiresAt: string;
}

interface ClipTokenRecord extends ClipTokenMetadata {
  version: 1;
  userId: string;
  scope: "clip:write";
  secretHash: string;
}

interface ClipTokenState {
  version: 1;
  revision: string;
  tokenId: string | null;
}

export class ClipTokenConflictError extends Error {
  constructor() {
    super("Clip token changed concurrently; refresh and try again");
    this.name = "ClipTokenConflictError";
  }
}

function isSafeUserId(userId: string): boolean {
  return isValidUserId(userId) && userId !== "." && userId !== "..";
}

function stateKey(userId: string): string {
  if (!isSafeUserId(userId)) throw new Error("Invalid clip token owner");
  return `users/${userId}/clip-token.json`;
}

const recordKey = (id: string) => `clip-tokens/${id}.json`;

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function readJson(object: R2ObjectBody): Promise<unknown> {
  if (object.size > MAX_RECORD_BYTES) return null;
  try {
    return await object.json<unknown>();
  } catch (error) {
    // Malformed persisted data is unauthenticated. Transport/permission errors
    // must propagate so callers can distinguish an outage from invalid credentials.
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function isTokenRecord(value: unknown): value is ClipTokenRecord {
  if (!isPlainObject(value)) return false;
  if (
    value.version !== 1 ||
    typeof value.id !== "string" ||
    !ID_RE.test(value.id) ||
    typeof value.userId !== "string" ||
    !isSafeUserId(value.userId) ||
    value.scope !== "clip:write" ||
    typeof value.secretHash !== "string" ||
    !HASH_RE.test(value.secretHash) ||
    typeof value.createdAt !== "string" ||
    typeof value.expiresAt !== "string"
  ) {
    return false;
  }
  const created = Date.parse(value.createdAt);
  const expires = Date.parse(value.expiresAt);
  return Number.isFinite(created) && expires - created === TOKEN_LIFETIME_MS;
}

function isActive(record: ClipTokenRecord): boolean {
  const now = Date.now();
  return Date.parse(record.createdAt) <= now && Date.parse(record.expiresAt) > now;
}

async function readRecord(bucket: R2Bucket, id: string): Promise<ClipTokenRecord | null> {
  const object = await bucket.get(recordKey(id));
  if (!object) return null;
  const value = await readJson(object);
  return isTokenRecord(value) && value.id === id ? value : null;
}

async function readState(bucket: R2Bucket, key: string) {
  const object = await bucket.get(key);
  if (!object) return { etag: null, state: null };
  const value = await readJson(object);
  const state: ClipTokenState | null =
    isPlainObject(value) &&
    value.version === 1 &&
    typeof value.revision === "string" &&
    ID_RE.test(value.revision) &&
    (value.tokenId === null || (typeof value.tokenId === "string" && ID_RE.test(value.tokenId)))
      ? { version: 1, revision: value.revision, tokenId: value.tokenId }
      : null;
  return { etag: object.etag, state };
}

function metadata(record: ClipTokenRecord): ClipTokenMetadata {
  return { id: record.id, createdAt: record.createdAt, expiresAt: record.expiresAt };
}

/** Metadata only: a raw secret is never recoverable after the creation response. */
export async function getClipToken(
  bucket: R2Bucket,
  userId: string,
): Promise<ClipTokenMetadata | null> {
  const { state } = await readState(bucket, stateKey(userId));
  if (!state?.tokenId) return null;
  const record = await readRecord(bucket, state.tokenId);
  return record && record.userId === userId && isActive(record) ? metadata(record) : null;
}

async function writeState(
  bucket: R2Bucket,
  key: string,
  etag: string | null,
  tokenId: string | null,
) {
  // Never delete this object: the fresh tombstone revision prevents absent-state
  // and ABA races from letting an older in-flight creation undo a revocation.
  const state: ClipTokenState = { version: 1, revision: randomHex(16), tokenId };
  const result = await bucket.put(key, JSON.stringify(state), {
    onlyIf: etag === null ? new Headers({ "If-None-Match": "*" }) : { etagMatches: etag },
    httpMetadata: { contentType: "application/json" },
  });
  if (!result) throw new ClipTokenConflictError();
}

async function cleanupOwnedRecord(bucket: R2Bucket, id: string | null | undefined, userId: string) {
  if (!id) return;
  try {
    const record = await readRecord(bucket, id);
    if (record?.userId === userId) await bucket.delete(recordKey(id));
  } catch {
    // Cleanup is not authoritative. A retained hash cannot authenticate without
    // its current pointer; do not turn a successful revocation into a false failure.
  }
}

/** Explicit session-authenticated creation/rotation only; never called during login. */
export async function createClipToken(
  bucket: R2Bucket,
  userId: string,
): Promise<ClipTokenMetadata & { token: string }> {
  const key = stateKey(userId);
  const previous = await readState(bucket, key);
  const id = randomHex(16);
  const secret = randomHex(32);
  const created = Date.now();
  const record: ClipTokenRecord = {
    version: 1,
    id,
    userId,
    scope: "clip:write",
    secretHash: await sha256Hex(secret),
    createdAt: new Date(created).toISOString(),
    expiresAt: new Date(created + TOKEN_LIFETIME_MS).toISOString(),
  };
  const stored = await bucket.put(recordKey(id), JSON.stringify(record), {
    onlyIf: new Headers({ "If-None-Match": "*" }),
    httpMetadata: { contentType: "application/json" },
  });
  if (!stored) throw new ClipTokenConflictError();
  try {
    await writeState(bucket, key, previous.etag, id);
  } catch (error) {
    // A conditional failure guarantees this candidate was never active. An
    // operational error may be an ambiguous committed write, so do not delete it.
    if (error instanceof ClipTokenConflictError) {
      await bucket.delete(recordKey(id)).catch(() => undefined);
    }
    throw error;
  }
  await cleanupOwnedRecord(bucket, previous.state?.tokenId, userId);
  return { ...metadata(record), token: `clip_v1.${id}.${secret}` };
}

export async function revokeClipToken(bucket: R2Bucket, userId: string): Promise<void> {
  const key = stateKey(userId);
  const previous = await readState(bucket, key);
  await writeState(bucket, key, previous.etag, null);
  await cleanupOwnedRecord(bucket, previous.state?.tokenId, userId);
}

/**
 * Dedicated clip:write authentication. No cookies, cache or caller-selected user.
 * At most two bounded object reads; authoritative pointer is read last. Like a
 * session revocation, this does not cancel uploads already authenticated in flight.
 */
export async function authenticateClipToken(
  bucket: R2Bucket,
  authorization: string | null,
): Promise<{ userId: string } | null> {
  if (
    !authorization ||
    authorization.length !== 112 ||
    authorization.slice(0, 7).toLowerCase() !== "bearer "
  ) {
    return null;
  }
  const match = TOKEN_RE.exec(authorization.slice(7));
  if (!match) return null;
  const [, id, secret] = match;
  const record = await readRecord(bucket, id);
  if (!record || !isActive(record)) return null;
  const hash = await sha256Hex(secret);
  // Compare all 64 digest characters rather than short-circuit on a differing prefix.
  let difference = 0;
  for (let index = 0; index < hash.length; index++) {
    difference |= hash.charCodeAt(index) ^ record.secretHash.charCodeAt(index);
  }
  if (difference !== 0) return null;
  const { state } = await readState(bucket, stateKey(record.userId));
  return state?.tokenId === record.id && isActive(record) ? { userId: record.userId } : null;
}
