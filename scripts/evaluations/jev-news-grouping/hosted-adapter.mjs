import { DEFAULT_HOSTED_MODEL, freeOnlyPreflight, modelProfile } from "./models.mjs";
import { buildRequest, requestHash } from "./policy.mjs";

/** Pure adapter: no fetch, credentials, gateway selection, retries or fallback. */
export function prepareHostedRequest(pair, { model = DEFAULT_HOSTED_MODEL } = {}) {
  const profile = modelProfile(model);
  if (!profile.hosted) throw new Error("Hosted adapter requires a Cloudflare-made model");
  return {
    pairId: pair.id,
    requestHash: requestHash(pair, { model }),
    model,
    method: "POST",
    pathTemplate: `/accounts/{account_id}/ai/run/${model}`,
    // No cf-aig-gateway-id: use ordinary Workers AI billing, not credit routing.
    // Request-level controls do not mutate any account or gateway setting.
    headers: { "cf-aig-collect-log": "false", "cf-aig-skip-cache": "true" },
    body: buildRequest(pair, { model }),
    preflight: freeOnlyPreflight(),
  };
}
