export const DEFAULT_HOSTED_MODEL = "@cf/cloudflare/clef-flash";

const profiles = [
  {
    id: "typesafe/jev",
    name: "Jev (historical offline format)",
    selector: null,
    hosted: false,
    provenance: "captured-jev",
    inputUsdPerMillion: 0.042,
    inputNeuronsPerMillion: null,
    contextTokens: 32000,
  },
  {
    id: DEFAULT_HOSTED_MODEL,
    name: "Clef-flash",
    selector: "clef-flash",
    hosted: true,
    provenance: "captured-clef-flash",
    inputUsdPerMillion: 0.09,
    inputNeuronsPerMillion: 8182,
    contextTokens: 65536,
  },
  {
    id: "@cf/cloudflare/clef",
    name: "Clef",
    selector: "clef",
    hosted: true,
    provenance: "captured-clef",
    inputUsdPerMillion: 0.24,
    inputNeuronsPerMillion: 21818,
    contextTokens: 65536,
  },
];

export const MODEL_PROFILES = Object.freeze(profiles.map((profile) => Object.freeze(profile)));

/** An explicit allowlist: no third-party or paid model fallback. */
export function modelProfile(model = "typesafe/jev") {
  const profile = MODEL_PROFILES.find((item) => item.id === model);
  if (!profile) throw new Error("Unsupported evaluation model");
  return profile;
}

export function matchesResponseModel(model, profile) {
  if (typeof model !== "string") return false;
  // Preserve the historical Jev capture contract. Clef identities fail closed;
  // an undocumented version identifier needs review before it can be accepted.
  return profile.hosted
    ? model === profile.selector || model === profile.id
    : model.startsWith("jev-");
}

export function capturedModelEvidence(capture, profile, models) {
  return (
    capture.provenance === profile.provenance &&
    models.length > 0 &&
    models.every(
      (model) =>
        matchesResponseModel(model, profile) && !/mock|test|fixture|synthetic/i.test(model),
    )
  );
}

/** No reservation API is available here; a Paid-account snapshot cannot ensure $0. */
export function freeOnlyPreflight() {
  return {
    status: "HOLD_FREE_QUOTA_UNVERIFIED",
    inferenceAllowed: false,
    dailyFreeNeurons: 10000,
    sharedAcrossAccount: true,
    reset: "00:00 UTC",
    paidPlanAutomaticallyBillsOverage: true,
    reason:
      "Verify an enforceable free-only quota before inference. Usage estimates or delayed snapshots do not reserve allowance against other Workers AI traffic.",
    networkCalls: 0,
  };
}
