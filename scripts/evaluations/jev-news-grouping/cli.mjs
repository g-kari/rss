#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { corpus, safetyCorpus } from "./corpus.mjs";
import {
  MODEL,
  POLICY_VERSION,
  buildRequest,
  evaluate,
  evaluateSafety,
  requestHash,
} from "./policy.mjs";

const [command, ...args] = process.argv.slice(2);
const value = (name) => args[args.indexOf(name) + 1];
const split = args.includes("--split") ? value("--split") : "all";
if (!["all", "development", "holdout", "safety"].includes(split)) throw new Error("Invalid split");
const allPairs = [...corpus, ...safetyCorpus];
const pairs = allPairs.filter((pair) => split === "all" || pair.split === split);

if (command === "prepare") {
  const requests = pairs.map((pair) => ({
    pairId: pair.id,
    requestHash: requestHash(pair),
    model: MODEL,
    input: buildRequest(pair),
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
        networkCalls: 0,
        split,
        pairCount: pairs.length,
        distinctPairs: pairs.filter((pair) => !pair.reversedFrom).length,
        planning: {
          pricingDate: "2026-10-02",
          usdPerMillionInputTokens: 0.042,
          expectedInputTokensPerPair: [1000, 3000],
          expectedModelInferenceUsd: [
            (pairs.length * 1000 * 0.042) / 1_000_000,
            (pairs.length * 3000 * 0.042) / 1_000_000,
          ],
          estimateWarning:
            "Planning assumption only; no Jev tokenizer or actual usage measured. Includes both questions. No cached discount assumed.",
          maximumContextTokensPerRequest: 32000,
          fullContextIllustrationUsd: (pairs.length * 32000 * 0.042) / 1_000_000,
          ceilingWarning:
            "Not a hard billing cap. Verify billed multi-question tokens and overhead before live execution; gateway spend limits are eventually consistent.",
          prepaidCreditPurchaseFeePercent: 5,
          excludes: [
            "minimum prepaid credit top-up",
            "Worker/Gateway/storage charges",
            "tax",
            "retries",
          ],
          spendingApproval: "REQUIRED_SEPARATELY_FOR_JEV; no budget inherited from another model",
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
  const safety = evaluateSafety(safetyCorpus, {
    ...capture,
    results: capture.results.filter(
      (record) => safetyIds.has(record?.pairId) || !knownIds.has(record?.pairId),
    ),
  });
  const report =
    split === "safety"
      ? {
          safety,
          acceptance: {
            status: safety.passed ? "SAFETY_CONTRACT_PASS_REVIEW_ONLY" : "HOLD",
            productionActivationAllowed: false,
          },
        }
      : evaluate(classificationPairs, scoped);
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
    "Offline only. Commands: prepare [--split development|holdout|safety|all]; score --responses FILE [--split holdout|safety]. No live runner or credentials are included.\n",
  );
  process.exitCode = 1;
}
