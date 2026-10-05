import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { isValidSessionId, isValidUserId } from "./validation";
import { sha256Hex } from "./r2";

export const MCP_PATH = "/mcp";
export const MCP_SCOPE = "rss:read";
export const MCP_AUTHORIZE_PATH = "/api/mcp/authorize";
export const MCP_TOKEN_PATH = "/api/mcp/token";
export const MCP_ACCESS_TOKEN_TTL = 900;
export const MCP_REFRESH_TOKEN_TTL = 2_592_000;
export const MCP_TRANSACTION_TTL = 600;
const MAX_STATE_BYTES = 2_048;
const HANDLE_RE = /^[A-Za-z0-9_-]{43}$/;

/** Only first-party verified identity and an approved revocation revision cross this boundary. */
export interface McpAuthProps {
  userId: string;
  connectionRevision: string;
}
export interface McpConnectionState {
  version: 1;
  revision: string;
  active: boolean;
  updatedAt: string;
}
export interface McpConnectionSnapshot {
  state: McpConnectionState | null;
  etag: string | null;
}
interface McpConsentAccount {
  userId: string | null;
  revision: string | null;
  expiresAt: number;
}
export interface McpLoginResume {
  kind: "rss-mcp-login";
  expiresAt: number;
}
export class McpConnectionError extends Error {
  constructor(
    readonly code:
      | "MCP_CONNECTION_REVOKED"
      | "MCP_AUTH_INVALID"
      | "MCP_CONNECTION_CONFLICT"
      | "MCP_STORAGE_INVALID",
  ) {
    super(code);
    this.name = "McpConnectionError";
  }
}

export function isMcpEnabled(env: Pick<CloudflareEnv, "RSS_MCP_ENABLED" | "OAUTH_KV">): boolean {
  return env.RSS_MCP_ENABLED === "true" && !!env.OAUTH_KV;
}
export function canonicalMcpOrigin(appBaseUrl: string): string {
  const url = new URL(appBaseUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (appBaseUrl !== url.origin && appBaseUrl !== `${url.origin}/`)
  ) {
    throw new TypeError("MCP requires a canonical HTTPS APP_BASE_URL origin");
  }
  return url.origin;
}
export function validateMcpAuthProps(value: unknown): McpAuthProps | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const props = value as Record<string, unknown>;
  if (
    Object.keys(props).length !== 2 ||
    typeof props.userId !== "string" ||
    !isValidUserId(props.userId) ||
    props.userId === "." ||
    props.userId === ".." ||
    typeof props.connectionRevision !== "string" ||
    !isValidSessionId(props.connectionRevision)
  )
    return null;
  return { userId: props.userId, connectionRevision: props.connectionRevision };
}
export function isMcpBetaAllowed(
  userId: string,
  env?: Pick<CloudflareEnv, "BETA_ALLOWED_SUBS">,
): boolean {
  const allowed = (env?.BETA_ALLOWED_SUBS ?? process.env.BETA_ALLOWED_SUBS)?.trim();
  return !allowed || allowed.split(",").some((id) => id.trim() === userId);
}
function connectionKey(userId: string): string {
  if (!isValidUserId(userId) || userId === "." || userId === "..")
    throw new McpConnectionError("MCP_AUTH_INVALID");
  return `users/${userId}/mcp-connection.json`;
}
function validState(raw: unknown): raw is McpConnectionState {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return false;
  const value = raw as Record<string, unknown>;
  return (
    Object.keys(value).length === 4 &&
    value.version === 1 &&
    typeof value.revision === "string" &&
    isValidSessionId(value.revision) &&
    typeof value.active === "boolean" &&
    typeof value.updatedAt === "string" &&
    value.updatedAt.length <= 30 &&
    Number.isFinite(Date.parse(value.updatedAt))
  );
}
/** R2 binding reads are strongly consistent. Failures/corruption are never treated as missing. */
export async function readMcpConnection(
  bucket: R2Bucket,
  userId: string,
): Promise<McpConnectionSnapshot> {
  const object = await bucket.get(connectionKey(userId));
  if (!object) return { state: null, etag: null };
  if (object.size > MAX_STATE_BYTES || !object.etag)
    throw new McpConnectionError("MCP_STORAGE_INVALID");
  let state: unknown;
  try {
    state = await object.json();
  } catch {
    throw new McpConnectionError("MCP_STORAGE_INVALID");
  }
  if (!validState(state)) throw new McpConnectionError("MCP_STORAGE_INVALID");
  return { state, etag: object.etag };
}
/** Called on every remote MCP request and authorization-code/refresh exchange. Never reactivates. */
export async function assertMcpConnection(
  bucket: R2Bucket,
  value: unknown,
  env?: Pick<CloudflareEnv, "BETA_ALLOWED_SUBS">,
): Promise<McpAuthProps> {
  const props = validateMcpAuthProps(value);
  if (!props || !isMcpBetaAllowed(props.userId, env))
    throw new McpConnectionError("MCP_AUTH_INVALID");
  const { state } = await readMcpConnection(bucket, props.userId);
  if (!state?.active || state.revision !== props.connectionRevision)
    throw new McpConnectionError("MCP_CONNECTION_REVOKED");
  return props;
}
/** Activate only the state observed on the consent page. A concurrent disconnect wins. */
export async function approveMcpConnection(
  bucket: R2Bucket,
  userId: string,
  approvedRevision: string | null,
): Promise<McpAuthProps> {
  const snapshot = await readMcpConnection(bucket, userId);
  if ((snapshot.state?.revision ?? null) !== approvedRevision)
    throw new McpConnectionError("MCP_CONNECTION_CONFLICT");
  if (snapshot.state?.active) return { userId, connectionRevision: snapshot.state.revision };
  const next: McpConnectionState = {
    version: 1,
    revision: crypto.randomUUID(),
    active: true,
    updatedAt: new Date().toISOString(),
  };
  const committed = await bucket.put(connectionKey(userId), JSON.stringify(next), {
    onlyIf: snapshot.etag ? { etagMatches: snapshot.etag } : { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "application/json" },
  });
  if (!committed) throw new McpConnectionError("MCP_CONNECTION_CONFLICT");
  return { userId, connectionRevision: next.revision };
}
/** Commit a new disabled revision before any eventual-consistency provider cleanup. */
export async function disconnectMcpConnection(
  bucket: R2Bucket,
  userId: string,
): Promise<McpConnectionState> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const snapshot = await readMcpConnection(bucket, userId);
    const state: McpConnectionState = {
      version: 1,
      revision: crypto.randomUUID(),
      active: false,
      updatedAt: new Date().toISOString(),
    };
    const committed = await bucket.put(connectionKey(userId), JSON.stringify(state), {
      onlyIf: snapshot.etag ? { etagMatches: snapshot.etag } : { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/json" },
    });
    if (committed) return state;
  }
  throw new McpConnectionError("MCP_CONNECTION_CONFLICT");
}
export async function cleanupMcpGrants(
  provider: OAuthHelpers,
  userId: string,
  revokedAt: string,
): Promise<boolean> {
  try {
    // Bounded best-effort cleanup: R2 rejects old revisions even when KV lags.
    const grants = await provider.listUserGrants(userId, { limit: 10 });
    // Never delete a new consent racing with cleanup. Provider timestamps have second precision.
    const cutoff = Math.floor(Date.parse(revokedAt) / 1_000);
    if (!Number.isFinite(cutoff)) return false;
    const older = grants.items.filter(
      (grant) => Number.isFinite(grant.createdAt) && grant.createdAt < cutoff,
    );
    for (const grant of older) await provider.revokeGrant(grant.id, userId);
    return !grants.cursor && older.length === grants.items.length;
  } catch {
    return false;
  }
}
export function validateMcpAuthorization(request: AuthRequest, appBaseUrl: string): void {
  const origin = canonicalMcpOrigin(appBaseUrl);
  if (
    request.resource !== `${origin}${MCP_PATH}` ||
    request.issuer !== origin ||
    request.responseType !== "code" ||
    request.scope.length !== 1 ||
    request.scope[0] !== MCP_SCOPE ||
    request.codeChallengeMethod !== "S256" ||
    !request.codeChallenge ||
    !/^[A-Za-z0-9_-]{43}$/.test(request.codeChallenge)
  )
    throw new McpConnectionError("MCP_AUTH_INVALID");
}
export function isMcpTransactionHandle(handle: string): boolean {
  return HANDLE_RE.test(handle);
}
async function consentAccountKey(handle: string): Promise<string> {
  if (!isMcpTransactionHandle(handle)) throw new McpConnectionError("MCP_AUTH_INVALID");
  return `rss-mcp:consent-account:${await sha256Hex(handle)}`;
}
export async function storeMcpConsentAccount(
  kv: KVNamespace,
  handle: string,
  userId: string | null,
  revision: string | null,
): Promise<void> {
  const account: McpConsentAccount = {
    userId,
    revision,
    expiresAt: Date.now() + MCP_TRANSACTION_TTL * 1_000,
  };
  await kv.put(await consentAccountKey(handle), JSON.stringify(account), {
    expirationTtl: MCP_TRANSACTION_TTL,
  });
}
export async function readMcpConsentAccount(
  kv: KVNamespace,
  handle: string,
): Promise<McpConsentAccount> {
  const stored = await kv.get(await consentAccountKey(handle));
  if (!stored || stored.length > MAX_STATE_BYTES) throw new McpConnectionError("MCP_AUTH_INVALID");
  let raw: unknown;
  try {
    raw = JSON.parse(stored);
  } catch {
    throw new McpConnectionError("MCP_AUTH_INVALID");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    throw new McpConnectionError("MCP_AUTH_INVALID");
  const record = raw as Record<string, unknown>;
  if (
    Object.keys(record).length !== 3 ||
    !(
      record.userId === null ||
      (typeof record.userId === "string" && isValidUserId(record.userId))
    ) ||
    !(
      record.revision === null ||
      (typeof record.revision === "string" && isValidSessionId(record.revision))
    ) ||
    typeof record.expiresAt !== "number" ||
    record.expiresAt <= Date.now() ||
    record.expiresAt > Date.now() + MCP_TRANSACTION_TTL * 1_000
  )
    throw new McpConnectionError("MCP_AUTH_INVALID");
  return raw as McpConsentAccount;
}
export async function deleteMcpConsentAccount(kv: KVNamespace, handle: string): Promise<void> {
  await kv.delete(await consentAccountKey(handle));
}
export function mcpLoginResumeData(): McpLoginResume {
  return { kind: "rss-mcp-login", expiresAt: Date.now() + MCP_TRANSACTION_TTL * 1_000 };
}
export function validateMcpLoginResume(value: unknown): void {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new McpConnectionError("MCP_AUTH_INVALID");
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).length !== 2 ||
    data.kind !== "rss-mcp-login" ||
    typeof data.expiresAt !== "number" ||
    data.expiresAt <= Date.now() ||
    data.expiresAt > Date.now() + MCP_TRANSACTION_TTL * 1_000
  )
    throw new McpConnectionError("MCP_AUTH_INVALID");
}
/** Preserve every provider Set-Cookie; never store its helper in global request state. */
export function appendMcpHeaders(target: Headers, source: Headers): void {
  source.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") target.set(key, value);
  });
  for (const cookie of source.getSetCookie()) target.append("Set-Cookie", cookie);
}
