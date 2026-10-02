import { sha256Hex } from "./r2";
import type { WorkersAiModelId } from "./ai-models";

interface GenerationLease {
  version: 1;
  owner: string;
  status: "pending" | "finished" | "failed";
  retryAfterAt?: number;
}
export interface ClaimedGeneration {
  key: string;
  owner: string;
  etag: string;
}

/** Strongly consistent R2 CAS, never an eventually-consistent KV lock. */
export async function claimSummaryGeneration(
  bucket: R2Bucket,
  url: string,
  model: WorkersAiModelId,
  options: { retryFailed?: boolean; now?: number } = {},
): Promise<ClaimedGeneration | null> {
  const key = `ai-cache/summary-generation/${await sha256Hex(JSON.stringify([model, url]))}.json`;
  const object = await bucket.get(key);
  if (object) {
    const previous = await object.json<GenerationLease>();
    if (
      previous.version !== 1 ||
      typeof previous.owner !== "string" ||
      !["pending", "finished", "failed"].includes(previous.status)
    )
      throw new Error("Invalid generation lease");
    if (previous.status === "pending") return null;
    if (previous.status === "failed") {
      if (!Number.isSafeInteger(previous.retryAfterAt))
        throw new Error("Invalid failed generation lease");
      if (!options.retryFailed || (options.now ?? Date.now()) < previous.retryAfterAt!) return null;
    }
  }
  const owner = crypto.randomUUID();
  const result = await bucket.put(key, JSON.stringify({ version: 1, owner, status: "pending" }), {
    onlyIf: object ? { etagMatches: object.etag } : new Headers({ "If-None-Match": "*" }),
    httpMetadata: { contentType: "application/json" },
  });
  return result ? { key, owner, etag: result.etag } : null;
}

/** A rejected/invalid inference is terminal in this application; cron never retries it. */
export async function failSummaryGeneration(
  bucket: R2Bucket,
  claim: ClaimedGeneration,
  now = Date.now(),
): Promise<void> {
  const result = await bucket.put(
    claim.key,
    JSON.stringify({
      version: 1,
      owner: claim.owner,
      status: "failed",
      retryAfterAt: now + 5 * 60 * 1000,
    }),
    {
      onlyIf: { etagMatches: claim.etag },
      httpMetadata: { contentType: "application/json" },
    },
  );
  if (!result) throw new Error("Failed generation lease conflict");
}

/** null means an active/storage-ambiguous claim needs completion or operator inspection. */
export async function summaryGenerationRetryAfter(
  bucket: R2Bucket,
  url: string,
  model: WorkersAiModelId,
  now = Date.now(),
): Promise<number | null> {
  const key = `ai-cache/summary-generation/${await sha256Hex(JSON.stringify([model, url]))}.json`;
  const object = await bucket.get(key);
  if (!object) return 0;
  const state = await object.json<GenerationLease>();
  return state.version === 1 &&
    state.status === "failed" &&
    Number.isSafeInteger(state.retryAfterAt)
    ? Math.max(0, Math.ceil((state.retryAfterAt! - now) / 1000))
    : null;
}

/** Only complete after the cache write succeeds. Never expire/reclaim an ambiguous call. */
export async function finishSummaryGeneration(
  bucket: R2Bucket,
  claim: ClaimedGeneration,
): Promise<void> {
  const result = await bucket.put(
    claim.key,
    JSON.stringify({ version: 1, owner: claim.owner, status: "finished" }),
    {
      onlyIf: { etagMatches: claim.etag },
      httpMetadata: { contentType: "application/json" },
    },
  );
  if (!result) throw new Error("Generation lease conflict");
}
