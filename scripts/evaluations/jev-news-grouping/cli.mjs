#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { corpus, safetyCorpus } from "./corpus.mjs";
import { POLICY_VERSION, buildRequest, evaluate, evaluateSafety, requestHash } from "./policy.mjs";
import { DEFAULT_HOSTED_MODEL, freeOnlyPreflight, modelProfile } from "./models.mjs";
import { prepareHostedRequest } from "./hosted-adapter.mjs";

const [command, ...args] = process.argv.slice(2);
const value = (name) => {
  const result = args[args.indexOf(name) + 1];
  if (!result || result.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return result;
};
const split = args.includes("--split") ? value("--split") : "all";
const model = args.includes("--model") ? value("--model") : DEFAULT_HOSTED_MODEL;
const profile = modelProfile(model);
if (!["all", "development", "holdout", "safety"].includes(split)) throw new Error("Invalid split");
const allPairs = [...corpus, ...safetyCorpus];
const pairs = allPairs.filter((pair) => split === "all" || pair.split === split);

if (command === "prepare") {
  const requests = pairs.map((pair) => ({
    pairId: pair.id,
    requestHash: requestHash(pair, { model }),
    model,
    input: buildRequest(pair, { model }),
    ...(profile.hosted ? { adapter: prepareHostedRequest(pair, { model }) } : {}),
  }));
  const sizes = requests.map((request) => {
    const json = JSON.stringify(request.input);
    return { unicodeCharacters: [...json].length, utf8Bytes: Buffer.byteLength(json, "utf8") };
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        status: "OFFLINE_ONLY_NOT_LIVE_EVALUATED",
        policyVersion: POLICY_VERSION,
        model,
        captureProvenance: profile.provenance,
        freeOnly: profile.hosted ? freeOnlyPreflight() : null,
        networkCalls: 0,
        split,
        pairCount: pairs.length,
        distinctPairs: pairs.filter((pair) => !pair.reversedFrom).length,
        planning: {
          pricingDate: "2026-10-03",
          usdPerMillionInputTokens: profile.inputUsdPerMillion,
          neuronsPerMillionInputTokens: profile.inputNeuronsPerMillion,
          expectedInputTokensPerPair: [1000, 3000],
          expectedModelInferenceUsd: [
            (pairs.length * 1000 * profile.inputUsdPerMillion) / 1_000_000,
            (pairs.length * 3000 * profile.inputUsdPerMillion) / 1_000_000,
          ],
          expectedEquivalentNeurons: profile.hosted
            ? [1000, 3000].map(
                (tokens) => (pairs.length * tokens * profile.inputNeuronsPerMillion) / 1_000_000,
              )
            : null,
          estimateWarning:
            "Planning assumption only; no tokenizer or actual usage measured. Includes both questions. No cached discount assumed. Unit-price equivalent is not actual charge.",
          maximumContextTokensPerRequest: profile.contextTokens,
          fullContextIllustrationUsd:
            (pairs.length * profile.contextTokens * profile.inputUsdPerMillion) / 1_000_000,
          ceilingWarning:
            "Not a hard billing cap. Verify billed multi-question tokens and overhead before live execution; gateway spend limits are eventually consistent.",
          prepaidCreditPurchaseFeePercent: profile.hosted ? null : 5,
          excludes: [
            "minimum prepaid credit top-up",
            "Worker/Gateway/storage charges",
            "tax",
            "retries",
          ],
          spendingApproval: profile.hosted
            ? "FREE_ONLY; no paid overage, credit routing or inherited model budget"
            : "HISTORICAL_OFFLINE_ONLY; Jev pilot cancelled",
        },
        requestSizes: sizes,
        requests,
      },
      null,
      2,
    )}\n`,
  );
} else if (command === "score" && args.includes("--responses")) {
  const capture = JSON.parse(await readFile(value("--responses"), "utf8"));
  // A capture may contain all splits; select matching IDs deliberately. Unknown IDs
  // remain in the scorer as errors instead of silently hiding bad bookkeeping.
  const knownIds = new Set(allPairs.map((pair) => pair.id));
  const classificationPairs = pairs.filter((pair) => pair.split !== "safety");
  const selectedIds = new Set(classificationPairs.map((pair) => pair.id));
  const scoped = {
    ...capture,
    results: capture.results.filter(
      (record) => selectedIds.has(record?.pairId) || !knownIds.has(record?.pairId),
    ),
  };
  const safetyIds = new Set(safetyCorpus.map((pair) => pair.id));
  const safety = evaluateSafety(
    safetyCorpus,
    {
      ...capture,
      results: capture.results.filter(
        (record) => safetyIds.has(record?.pairId) || !knownIds.has(record?.pairId),
      ),
    },
    { model },
  );
  const report =
    split === "safety"
      ? {
          safety,
          acceptance: {
            status: safety.passed ? "SAFETY_CONTRACT_PASS_REVIEW_ONLY" : "HOLD",
            productionActivationAllowed: false,
          },
        }
      : evaluate(classificationPairs, scoped, { model });
  if (split !== "safety") {
    report.safety = safety;
    if (!safety.passed) {
      report.acceptance.status = "HOLD";
      report.acceptance.blockers.push(
        "Eight captured insufficient-evidence cases must all abstain safely",
      );
    }
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.acceptance.status === "HOLD") process.exitCode = 2;
} else {
  process.stderr.write(
    "Offline only. Commands: prepare [--model @cf/cloudflare/clef-flash|@cf/cloudflare/clef|typesafe/jev] [--split development|holdout|safety|all]; score --responses FILE [--model MODEL] [--split holdout|safety]. Free quota is unverified; no live runner or credentials are included.\n",
  );
  process.exitCode = 1;
}
