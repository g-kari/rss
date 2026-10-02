export const SUMMARY_PRECOMPUTE_LEASE_KEY = "ai-cache/summary-precompute/active.json";

interface PrecomputeLease {
  version: 1;
  owner: string;
  status: "pending" | "finished";
  runId: string;
}

export interface ClaimedPrecompute {
  owner: string;
  etag: string;
  runId: string;
}

/** One scheduled precompute invocation globally, including overlapping cron deliveries. */
export async function claimPrecompute(
  bucket: R2Bucket,
  runId: string,
): Promise<ClaimedPrecompute | null> {
  const object = await bucket.get(SUMMARY_PRECOMPUTE_LEASE_KEY);
  if (object) {
    if (object.size > 4096) throw new Error("Precompute lease too large");
    const previous = await object.json<PrecomputeLease>();
    const parsed = Date.parse(previous?.runId);
    if (
      previous?.version !== 1 ||
      typeof previous.owner !== "string" ||
      !previous.owner ||
      !["pending", "finished"].includes(previous.status) ||
      !Number.isFinite(parsed) ||
      new Date(parsed).toISOString() !== previous.runId
    )
      throw new Error("Invalid precompute lease");
    // No timeout takeover: a slow original invocation may still be inferring.
    if (previous.status === "pending") return null;
  }
  const owner = crypto.randomUUID();
  const saved = await bucket.put(
    SUMMARY_PRECOMPUTE_LEASE_KEY,
    JSON.stringify({ version: 1, owner, status: "pending", runId }),
    {
      onlyIf: object ? { etagMatches: object.etag } : new Headers({ "If-None-Match": "*" }),
      httpMetadata: { contentType: "application/json" },
    },
  );
  return saved ? { owner, etag: saved.etag, runId } : null;
}

/** Release only after the invocation and all its provider promises have settled. */
export async function finishPrecompute(bucket: R2Bucket, claim: ClaimedPrecompute): Promise<void> {
  const saved = await bucket.put(
    SUMMARY_PRECOMPUTE_LEASE_KEY,
    JSON.stringify({ version: 1, owner: claim.owner, status: "finished", runId: claim.runId }),
    {
      onlyIf: { etagMatches: claim.etag },
      httpMetadata: { contentType: "application/json" },
    },
  );
  if (!saved) throw new Error("Precompute lease release conflict; operator recovery required");
}
