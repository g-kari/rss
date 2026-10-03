import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { corpus, safetyCorpus } from "./corpus.mjs";
import { prepareHostedRequest } from "./hosted-adapter.mjs";
import { DEFAULT_HOSTED_MODEL, freeOnlyPreflight, modelProfile } from "./models.mjs";
import {
  buildRequest,
  classifyResponse,
  evaluate,
  evaluateSafety,
  projectGroups,
  requestHash,
  unrollGroups,
} from "./policy.mjs";

const selected = { model: DEFAULT_HOSTED_MODEL };
const clef = { model: "@cf/cloudflare/clef" };
function response(label = "same_event", evidence = 0.99, model = "clef-flash") {
  return {
    model,
    answers: {
      relationship: {
        type: "choice",
        choice: label,
        confidence: 0.99,
        probabilities: Object.fromEntries(
          ["same_event", "follow_up", "different"].map((key) => [
            key,
            key === label ? 0.99 : 0.005,
          ]),
        ),
      },
      sufficient_evidence: { type: "noul", noul: evidence },
    },
    usage: { input_tokens: 1000, output_tokens: 50 },
  };
}
function record(pair, options = selected) {
  return {
    pairId: pair.id,
    requestHash: requestHash(pair, options),
    response: response(pair.label ?? "same_event", pair.split === "safety" ? 0.1 : 0.99),
  };
}

test("hosted adapter selects the matching Cloudflare-made input and REST model without fallback", () => {
  const request = prepareHostedRequest(corpus[0]);
  assert.equal(request.model, DEFAULT_HOSTED_MODEL);
  assert.equal(request.body.model, "clef-flash");
  assert.equal(request.pathTemplate, "/accounts/{account_id}/ai/run/@cf/cloudflare/clef-flash");
  assert.equal(request.method, "POST");
  assert.equal(request.headers["cf-aig-collect-log"], "false");
  assert.equal(request.headers["cf-aig-skip-cache"], "true");
  assert.ok(!Object.hasOwn(request.headers, "cf-aig-gateway-id"));
  assert.equal(prepareHostedRequest(corpus[0], clef).body.model, "clef");
  assert.throws(() => prepareHostedRequest(corpus[0], { model: "typesafe/jev" }));
  for (const model of ["openai/gpt-5.5", "@cf/google/gemma-4-26b-a4b-it", "clef-flash"])
    assert.throws(() => prepareHostedRequest(corpus[0], { model }));
  const serialized = JSON.stringify(request.body);
  for (const forbidden of ["rationale", "reversedFrom", "readIds", "requestHash", "images"])
    assert.ok(!serialized.includes(forbidden));
});

test("model selectors and hash identities cannot mix Clef, Flash or historical Jev captures", () => {
  const hashes = [
    requestHash(corpus[0]),
    requestHash(corpus[0], selected),
    requestHash(corpus[0], clef),
  ];
  assert.equal(new Set(hashes).size, 3);
  assert.deepEqual(Object.keys(buildRequest(corpus[0])).sort(), ["questions", "state"]);
  assert.equal(classifyResponse(response(), selected).action, "group");
  for (const model of ["clef", "jev-1.13.0", "other", "clef-flash-unreviewed-version"])
    assert.equal(classifyResponse(response("same_event", 0.99, model), selected).valid, false);
  assert.equal(classifyResponse(response("same_event", 0.99, "clef"), clef).action, "group");
  const mismatched = record(corpus[0]);
  mismatched.requestHash = requestHash(corpus[0]);
  assert.equal(
    evaluate([corpus[0]], { provenance: "mock", results: [mismatched] }, selected).invalid,
    1,
  );
});

test("hosted outputs retain conservative evidence, choice and probability validation", () => {
  assert.equal(classifyResponse(response("follow_up"), selected).action, "relate");
  assert.equal(classifyResponse(response("different"), selected).action, "separate");
  assert.equal(classifyResponse(response("same_event", 0.8), selected).action, "abstain");
  const invalid = response();
  invalid.answers.relationship.probabilities.follow_up = 0.5;
  assert.equal(classifyResponse(invalid, selected).valid, false);
  invalid.answers.relationship.probabilities.follow_up = 0.005;
  invalid.usage.input_tokens = -1;
  assert.equal(classifyResponse(invalid, selected).valid, false);
});

test("hosted mock scoring keeps accuracy unmeasured and counts reversed probes separately", () => {
  const holdout = corpus.filter((pair) => pair.split === "holdout");
  const report = evaluate(
    holdout,
    { provenance: "mock", results: holdout.map((pair) => record(pair)) },
    selected,
  );
  assert.equal(report.requestedModel, DEFAULT_HOSTED_MODEL);
  assert.equal(report.invalid, 0);
  assert.equal(report.distinctPairs, 60);
  assert.equal(report.orientationComparisons, 20);
  assert.equal(report.acceptedMerges, 20);
  assert.equal(report.liveEvaluated, false);
  assert.equal(report.accuracy, null);
  assert.equal(report.macroF1, null);
  assert.equal(report.acceptance.status, "HOLD");
  assert.equal(report.acceptance.productionActivationAllowed, false);
  assert.equal(report.recordedUsage.equivalentNeurons, 654.56);
  assert.equal(report.recordedUsage.modelInferenceUsd, 0.0072);
  const wrongProvenance = evaluate(
    holdout,
    { provenance: "captured-jev", results: holdout.map((pair) => record(pair)) },
    selected,
  );
  assert.equal(wrongProvenance.liveEvaluated, false);
});

test("Clef safety requires matching model provenance and preserves all eight required abstentions", () => {
  const results = safetyCorpus.map((pair) => record(pair));
  const report = evaluateSafety(safetyCorpus, { provenance: "mock", results }, selected);
  assert.equal(report.invalid, 0);
  assert.equal(report.unsafeDecisions, 0);
  assert.ok(report.cases.every((item) => item.passed));
  assert.equal(report.liveEvaluated, false);
  assert.equal(report.passed, false);
  const mixed = structuredClone(results);
  mixed[0].response.model = "clef";
  assert.equal(
    evaluateSafety(safetyCorpus, { provenance: "captured-clef-flash", results: mixed }, selected)
      .passed,
    false,
  );
});

test("hosted grouping retains source identities and unrolls without hiding follow-ups", () => {
  const articles = [
    { id: "a", read: true },
    { id: "b", read: false },
    { id: "c", saved: true },
  ];
  const projection = projectGroups(
    articles,
    [
      { aId: "a", bId: "b", response: response() },
      { aId: "b", bId: "c", response: response("follow_up") },
    ],
    { ...selected, enabled: true },
  );
  assert.deepEqual(
    projection.groups.map((group) => group.members.length),
    [2, 1],
  );
  assert.deepEqual(unrollGroups(projection), articles);
  assert.equal(unrollGroups(projection)[1], articles[1]);
});

test("free-only preflight stays blocked despite the published allowance", () => {
  const result = freeOnlyPreflight();
  assert.equal(result.inferenceAllowed, false);
  assert.equal(result.dailyFreeNeurons, 10000);
  assert.equal(result.paidPlanAutomaticallyBillsOverage, true);
  assert.equal(result.networkCalls, 0);
  assert.match(result.reason, /reserve/);
  assert.equal(modelProfile(DEFAULT_HOSTED_MODEL).inputNeuronsPerMillion, 8182);
});

test("CLI defaults to Clef-flash and produces 108 bounded synthetic requests without network", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      new URL("./deny-network.fixture.mjs", import.meta.url).href,
      new URL("./cli.mjs", import.meta.url).pathname,
      "prepare",
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const prepared = JSON.parse(result.stdout);
  assert.equal(prepared.model, DEFAULT_HOSTED_MODEL);
  assert.equal(prepared.pairCount, 108);
  assert.equal(prepared.networkCalls, 0);
  assert.equal(prepared.freeOnly.inferenceAllowed, false);
  assert.ok(prepared.requests.every((request) => request.input.model === "clef-flash"));
  assert.ok(prepared.requestSizes.every((size) => size.utf8Bytes < 2500));
});

test("missing CLI model values cannot silently fall back to historical Jev", () => {
  for (const args of [
    ["prepare", "--model"],
    ["prepare", "--model", "--split", "holdout"],
  ]) {
    const result = spawnSync(
      process.execPath,
      [new URL("./cli.mjs", import.meta.url).pathname, ...args],
      { encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Missing value for --model/);
  }
});
