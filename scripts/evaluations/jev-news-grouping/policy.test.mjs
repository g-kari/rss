import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { corpus, safetyCorpus } from "./corpus.mjs";
import {
  buildRequest,
  classifyResponse,
  evaluate,
  evaluateSafety,
  projectGroups,
  requestHash,
  unrollGroups,
} from "./policy.mjs";

function response(choice = "same_event", probabilities, confidence = 0.99) {
  return {
    model: "jev-test-mock",
    answers: {
      relationship: {
        type: "choice",
        choice,
        confidence,
        probabilities: probabilities ?? { same_event: 0.99, follow_up: 0.005, different: 0.005 },
      },
      sufficient_evidence: { type: "noul", noul: 0.99 },
    },
    usage: { input_tokens: 1000, output_tokens: 50 },
  };
}

test("100 authored Japanese pairs have family-disjoint development/holdout splits", () => {
  assert.equal(corpus.length, 100);
  assert.equal(new Set(corpus.map((pair) => pair.id)).size, 100);
  assert.deepEqual(
    Object.fromEntries(
      ["same_event", "follow_up", "different"].map((label) => [
        label,
        corpus.filter((pair) => pair.label === label).length,
      ]),
    ),
    { same_event: 34, follow_up: 33, different: 33 },
  );
  const development = new Set(
    corpus.filter((pair) => pair.split === "development").map((pair) => pair.family),
  );
  assert.equal(corpus.filter((pair) => pair.split === "holdout").length, 80);
  assert.ok(
    corpus
      .filter((pair) => pair.split === "holdout")
      .every((pair) => !development.has(pair.family)),
  );
  assert.ok(
    corpus.every(
      (pair) => pair.provenance === "self-authored-synthetic" && pair.rationale && pair.tags.length,
    ),
  );
  assert.ok(corpus.every((pair) => /^ja-pair-\d{3}$/.test(pair.id)));
  assert.ok(corpus.every((pair) => pair.a.publishedAt === null && pair.b.publishedAt === null));
  assert.equal(safetyCorpus.length, 8);
  assert.ok(
    safetyCorpus.every(
      (pair) => pair.expectedAction === "abstain" && !Object.hasOwn(pair, "label"),
    ),
  );
});

test("request contains only evidence and rubric, never label, rationale, split or read state", () => {
  const request = buildRequest({
    ...corpus[0],
    readIds: ["secret"],
    label: "private-ground-truth",
  });
  assert.deepEqual(Object.keys(request).sort(), ["questions", "state"]);
  assert.deepEqual(Object.keys(request.state).sort(), ["article_a", "article_b"]);
  assert.deepEqual(Object.keys(request.questions.relationship.criteria), [
    "same_event",
    "follow_up",
    "different",
  ]);
  const serialized = JSON.stringify(request);
  for (const forbidden of ["private-ground-truth", "rationale", "readIds", "secret", "split"])
    assert.ok(!serialized.includes(forbidden));
  assert.equal(requestHash(corpus[0]), requestHash(corpus[0]));
  assert.notEqual(
    requestHash(corpus[0]),
    requestHash({ ...corpus[0], a: { ...corpus[0].a, title: "変更" } }),
  );
});

test("same-event merging requires separate probability, confidence, margin and evidence gates", () => {
  assert.equal(classifyResponse(response()).action, "group");
  assert.equal(
    classifyResponse(response("same_event", { same_event: 0.98, follow_up: 0.01, different: 0.01 }))
      .action,
    "abstain",
  );
  assert.equal(classifyResponse(response("same_event", undefined, 0.9)).action, "abstain");
  const insufficient = response();
  insufficient.answers.sufficient_evidence.noul = 0.8;
  assert.equal(classifyResponse(insufficient).action, "abstain");
});

test("follow-up and different stories never become merge edges", () => {
  assert.equal(
    classifyResponse(
      response("follow_up", { same_event: 0.001, follow_up: 0.998, different: 0.001 }),
    ).action,
    "relate",
  );
  assert.equal(
    classifyResponse(
      response("different", { same_event: 0.001, follow_up: 0.001, different: 0.998 }),
    ).action,
    "separate",
  );
});

test("unknown, missing, contradictory, non-finite or malformed provider fields fail closed", () => {
  const invalid = [
    null,
    {},
    response("unknown"),
    response("different"),
    response("same_event", { same_event: 0.99, follow_up: 0.9, different: 0.1 }),
  ];
  const nan = response();
  nan.answers.relationship.confidence = NaN;
  invalid.push(nan);
  const negativeUsage = response();
  negativeUsage.usage.input_tokens = -1;
  invalid.push(negativeUsage);
  const missingEvidence = response();
  delete missingEvidence.answers.sufficient_evidence;
  invalid.push(missingEvidence);
  const missingModel = response();
  delete missingModel.model;
  invalid.push(missingModel);
  invalid.push({ ...response(), model: "some-other-model" });
  const negative = response();
  negative.answers.relationship.probabilities.follow_up = -0.01;
  invalid.push(negative);
  for (const value of invalid) assert.equal(classifyResponse(value).action, "abstain");
});

test("missing edge and A-B/B-C chain cannot transitively collapse different A-C", () => {
  const articles = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const scores = [
    { aId: "a", bId: "b", response: response() },
    { aId: "b", bId: "c", response: response() },
  ];
  const projection = projectGroups(articles, scores, { enabled: true });
  assert.deepEqual(
    projection.groups.map((group) => group.members.map((article) => article.id)),
    [["a", "b"], ["c"]],
  );
  scores.push({
    aId: "a",
    bId: "c",
    response: response("different", { same_event: 0.001, follow_up: 0.001, different: 0.998 }),
  });
  assert.deepEqual(
    projectGroups(articles, scores, { enabled: true }).groups.map((group) => group.members.length),
    [2, 1],
  );
});

test("source objects, per-article read/bookmark states, order and filtered scope survive unroll", () => {
  const articles = [
    { id: "b", source: "B", read: false, bookmarked: true },
    { id: "a", source: "A", read: true },
    { id: "c", source: "C", read: false },
  ];
  const before = structuredClone(articles);
  const scores = [
    { aId: "a", bId: "b", response: response() },
    { aId: "b", bId: "hidden", response: response() },
  ];
  const projection = projectGroups(articles, scores, { enabled: true });
  assert.deepEqual(unrollGroups(projection), articles);
  assert.equal(unrollGroups(projection)[0], articles[0]);
  assert.deepEqual(articles, before);
  assert.ok(
    projection.groups.every((group) => group.members.every((article) => article.id !== "hidden")),
  );
  assert.equal(projectGroups(articles, scores).groups.length, articles.length);
});

test("duplicate or conflicting pair scores abstain rather than last-write-wins", () => {
  const pair = { aId: "a", bId: "b", response: response() };
  assert.equal(
    projectGroups([{ id: "a" }, { id: "b" }], [pair, pair], { enabled: true }).groups.length,
    2,
  );
});

test("mock responses cannot be represented as live model accuracy or release acceptance", () => {
  const results = corpus.map((pair) => ({
    pairId: pair.id,
    requestHash: requestHash(pair),
    response: response(),
  }));
  const report = evaluate(corpus, { provenance: "mock", results });
  assert.equal(report.liveEvaluated, false);
  assert.equal(report.accuracy, null);
  assert.equal(report.acceptance.status, "HOLD");
  assert.ok(report.falseMerges > 0);
});

test("missing, mismatched, duplicate and extra records prevent quality acceptance", () => {
  const pair = corpus[0];
  const record = { pairId: pair.id, requestHash: requestHash(pair), response: response() };
  assert.equal(evaluate([pair], { provenance: "captured-jev", results: [] }).missing, 1);
  assert.equal(
    evaluate([pair], { provenance: "captured-jev", results: [{ ...record, requestHash: "wrong" }] })
      .invalid,
    1,
  );
  assert.equal(
    evaluate([pair], { provenance: "captured-jev", results: [record, record] }).invalid,
    1,
  );
  assert.equal(
    evaluate([pair], {
      provenance: "captured-jev",
      results: [record, { ...record, pairId: "extra" }],
    }).extraRecords,
    1,
  );
  assert.equal(
    evaluate([pair], { provenance: "captured-jev", results: [record] }).acceptance.status,
    "HOLD",
  );
});

test("CLI has no live runner and refuses a live command without network activity", () => {
  const result = spawnSync(
    process.execPath,
    [new URL("./cli.mjs", import.meta.url).pathname, "live"],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /offline|Offline/);
});

test("unknown evidence has a separate required-abstain safety contract, not a fabricated class", () => {
  const results = safetyCorpus.map((pair) => {
    const result = response();
    result.answers.sufficient_evidence.noul = 0.1;
    return { pairId: pair.id, requestHash: requestHash(pair), response: result };
  });
  const mock = evaluateSafety(safetyCorpus, { provenance: "mock", results });
  assert.ok(mock.cases.every((result) => result.passed));
  assert.equal(mock.passed, false);
  const captured = results.map((record) => ({
    ...record,
    response: { ...record.response, model: "jev-1.13.0" },
  }));
  assert.equal(
    evaluateSafety(safetyCorpus, { provenance: "captured-jev", results: captured }).passed,
    true,
  );
  captured[0].response.answers.sufficient_evidence.noul = 0.99;
  assert.equal(
    evaluateSafety(safetyCorpus, { provenance: "captured-jev", results: captured }).unsafeDecisions,
    1,
  );
});

test("reversed probes cannot inflate merge coverage, class metrics or uncertainty sample size", () => {
  const holdout = corpus.filter((pair) => pair.split === "holdout");
  const sameIds = new Set(
    holdout
      .filter((pair) => pair.label === "same_event" && !pair.reversedFrom)
      .slice(0, 15)
      .map((pair) => pair.id),
  );
  const results = holdout.map((pair) => {
    const probabilities = Object.fromEntries(
      ["same_event", "follow_up", "different"].map((label) => [
        label,
        label === pair.label ? 0.99 : 0.005,
      ]),
    );
    const result = response(pair.label, probabilities);
    result.model = "jev-1.13.0";
    if (pair.label === "same_event" && !sameIds.has(pair.reversedFrom ?? pair.id))
      result.answers.sufficient_evidence.noul = 0.1;
    return { pairId: pair.id, requestHash: requestHash(pair), response: result };
  });
  const report = evaluate(holdout, { provenance: "captured-jev", results });
  assert.equal(report.acceptedMerges, 15);
  assert.equal(report.classMetrics.same_event.count, 20);
  assert.equal(report.acceptance.status, "HOLD");
  assert.ok(report.falseMergeRate95Upper > 0.087 && report.falseMergeRate95Upper < 0.088);
  assert.match(report.uncertaintyWarning, /dependent/);
});

test("safety-only CLI rejects unknown captures and ignores known classification captures", () => {
  const results = safetyCorpus.map((pair) => {
    const result = response();
    result.model = "jev-1.13.0";
    result.answers.sufficient_evidence.noul = 0.1;
    return { pairId: pair.id, requestHash: requestHash(pair), response: result };
  });
  const directory = mkdtempSync(join(tmpdir(), "jev-policy-"));
  try {
    const path = join(directory, "capture.json");
    const run = () =>
      spawnSync(
        process.execPath,
        [
          new URL("./cli.mjs", import.meta.url).pathname,
          "score",
          "--responses",
          path,
          "--split",
          "safety",
          "--model",
          "typesafe/jev",
        ],
        { encoding: "utf8" },
      );
    writeFileSync(
      path,
      JSON.stringify({
        provenance: "captured-jev",
        results: [...results, { pairId: corpus[0].id, response: {} }],
      }),
    );
    assert.equal(run().status, 0);
    writeFileSync(
      path,
      JSON.stringify({
        provenance: "captured-jev",
        results: [...results, { pairId: "unknown-case", requestHash: "wrong", response: {} }],
      }),
    );
    const blocked = run();
    assert.equal(blocked.status, 2);
    assert.equal(JSON.parse(blocked.stdout).safety.extraRecords, 1);
    assert.equal(JSON.parse(blocked.stdout).acceptance.status, "HOLD");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
