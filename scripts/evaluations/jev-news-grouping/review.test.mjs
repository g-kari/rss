import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Window } from "happy-dom";
import { corpus, safetyCorpus } from "./corpus.mjs";
import { classifyResponse, requestHash } from "./policy.mjs";
import { DEFAULT_HOSTED_MODEL as model } from "./models.mjs";
import { buildReviewRows, renderReview } from "./review.mjs";

function response(choice = "same_event", evidence = 0.99) {
  return {
    model: "clef-flash",
    answers: {
      relationship: {
        type: "choice",
        choice,
        confidence: 0.99,
        probabilities: Object.fromEntries(
          ["same_event", "follow_up", "different"].map((label) => [
            label,
            label === choice ? 0.99 : 0.005,
          ]),
        ),
      },
      sufficient_evidence: { type: "noul", noul: evidence },
    },
    usage: { input_tokens: 1000, output_tokens: 0 },
  };
}

const record = (pair, result = response()) => ({
  pairId: pair.id,
  requestHash: requestHash(pair, { model }),
  response: result,
});

test("offline rows preserve all evidence and corpus order without fabricating decisions", () => {
  const pairs = [...corpus, ...safetyCorpus];
  const rows = buildReviewRows(pairs, null, { model });
  assert.equal(rows.length, 108);
  assert.deepEqual(
    rows.map((row) => row.pair.id),
    pairs.map((pair) => pair.id),
  );
  assert.ok(rows.every((row, index) => row.pair === pairs[index] && row.decision === null));
  assert.ok(rows.every((row) => row.category === "not-evaluated"));
});

test("review decisions reuse the exact scorer gates and separate unsafe merges", () => {
  const pairs = [
    corpus.find((pair) => pair.label === "same_event"),
    corpus.find((pair) => pair.label === "follow_up"),
    safetyCorpus[0],
  ];
  const capture = {
    provenance: "mock",
    results: [record(pairs[0]), record(pairs[1]), record(pairs[2])],
  };
  const rows = buildReviewRows(pairs, capture, { model });
  assert.deepEqual(
    rows.map((row) => row.category),
    ["matching", "false-merge", "unsafe-safety"],
  );
  for (let index = 0; index < pairs.length; index++)
    assert.deepEqual(
      rows[index].decision,
      classifyResponse(capture.results[index].response, { model }),
    );
  assert.equal(rows[1].pair.label, "follow_up");
});

test("missing, duplicate, mismatched and malformed captures always remain separate", () => {
  const pair = corpus[0];
  for (const results of [
    [],
    [record(pair), record(pair)],
    [{ ...record(pair), requestHash: "bad" }],
    [record(pair, {})],
    [null],
  ]) {
    const [row] = buildReviewRows([pair], { results }, { model });
    assert.equal(row.category, "invalid-capture");
    assert.equal(row.decision.action, "abstain");
    assert.equal(row.decision.valid, false);
  }
  assert.throws(() => buildReviewRows([pair], { results: {} }, { model }), /results array/);
});

test("valid abstentions are distinct from broken safety captures; follow-ups remain visible", () => {
  const pair = corpus.find((item) => item.label === "follow_up");
  const rows = buildReviewRows(
    [pair, safetyCorpus[0]],
    {
      results: [
        record(pair, response("follow_up")),
        record(safetyCorpus[0], response("same_event", 0.4)),
      ],
    },
    { model },
  );
  assert.equal(rows[0].category, "matching");
  assert.equal(rows[0].decision.action, "relate");
  assert.equal(rows[1].category, "matching");
  assert.equal(rows[1].decision.action, "abstain");
  const [abstained] = buildReviewRows(
    [pair],
    { results: [record(pair, response("follow_up", 0.4))] },
    { model },
  );
  assert.equal(abstained.category, "abstained");
});

test("HTML is self-contained text, escapes every untrusted field and exposes no external requests", () => {
  const attack =
    '</summary><script src="https://evil.example">alert(1)</script><img src=x onerror=alert(1)> &\'"';
  const pair = {
    ...corpus[0],
    id: attack,
    rationale: attack,
    tags: [attack],
    a: { ...corpus[0].a, title: attack, source: attack, summary: attack, publishedAt: attack },
  };
  const html = renderReview([pair], null, { model });
  assert.ok(html.includes("&lt;/summary&gt;&lt;script"));
  assert.ok(html.includes("&amp;&#39;&quot;"));
  assert.ok(!html.includes(attack));
  const window = new Window();
  window.document.write(html);
  assert.equal(window.document.querySelectorAll("script,img,iframe,link,form").length, 0);
  for (const element of window.document.querySelectorAll("*"))
    assert.ok([...element.attributes].every((attribute) => !/^on/i.test(attribute.name)));
  assert.ok(!/url\(|@import|href="https?:/i.test(html));
  window.close();
  assert.ok(html.includes("productionActivationAllowed: false"));
  assert.ok(html.includes("HOLD_FREE_QUOTA_UNVERIFIED"));
  assert.ok(html.includes("実際の推論・日本語精度は未測定"));
});

function run(...args) {
  return spawnSync(
    process.execPath,
    [
      "--import",
      new URL("./deny-network.fixture.mjs", import.meta.url).pathname,
      new URL("./cli.mjs", import.meta.url).pathname,
      ...args,
    ],
    { encoding: "utf8" },
  );
}

test("review CLI renders 108/80/8 cases without captures, credentials or network", () => {
  for (const [split, count] of [
    ["all", 108],
    ["holdout", 80],
    ["safety", 8],
  ]) {
    const result = run("review", "--split", split);
    assert.equal(result.status, 0, result.stderr);
    assert.equal((result.stdout.match(/data-case-id=/g) ?? []).length, count);
    assert.ok(result.stdout.startsWith("<!doctype html>"));
    assert.ok(result.stdout.includes("未評価"));
    assert.ok(result.stdout.includes("inferenceAllowed: false"));
  }
});

test("capture review and existing JSON score share HOLD, errors and safety summary", () => {
  const dir = mkdtempSync(join(tmpdir(), "rss-review-"));
  try {
    const path = join(dir, "capture.json");
    writeFileSync(
      path,
      JSON.stringify({ provenance: "mock", results: [record(corpus[20]), { pairId: "unknown" }] }),
    );
    const score = run("score", "--responses", path, "--split", "holdout");
    const review = run("review", "--responses", path, "--split", "holdout");
    assert.equal(score.status, 2, score.stderr);
    assert.equal(review.status, 2, review.stderr);
    const report = JSON.parse(score.stdout);
    assert.ok(review.stdout.includes(`欠測: ${report.missing}`));
    assert.ok(review.stdout.includes(`不正: ${report.invalid}`));
    assert.ok(review.stdout.includes(`対象外: ${report.extraRecords}`));
    assert.ok(review.stdout.includes("mock"));
    assert.ok(review.stdout.includes("HOLD"));
    assert.ok(review.stdout.includes("モデル性能の証拠ではありません"));
    assert.ok(review.stdout.includes(`Safety欠測: ${report.safety.missing}`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("safety-only headline reflects missing and invalid captures instead of zero classification totals", () => {
  const dir = mkdtempSync(join(tmpdir(), "rss-review-safety-"));
  try {
    const path = join(dir, "capture.json");
    for (const results of [
      [],
      safetyCorpus.map((pair) => record(pair, {})),
      safetyCorpus.map((pair) => record(pair, response("same_event", 0.4))),
    ]) {
      writeFileSync(path, JSON.stringify({ provenance: "mock", results }));
      const score = run("score", "--responses", path, "--split", "safety");
      const review = run("review", "--responses", path, "--split", "safety");
      const report = JSON.parse(score.stdout);
      assert.equal(review.status, score.status);
      assert.ok(
        review.stdout.includes(
          `<p>欠測: ${report.safety.missing} / 不正: ${report.safety.invalid}`,
        ),
      );
      assert.equal((review.stdout.match(/data-case-id=/g) ?? []).length, 8);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("all navigation and reversed-probe links resolve; native disclosure controls start closed", () => {
  const window = new Window();
  window.document.write(renderReview([...corpus, ...safetyCorpus]));
  assert.equal(window.document.documentElement.lang, "ja");
  assert.equal(window.document.querySelectorAll("article.case").length, 108);
  assert.equal(window.document.querySelectorAll("article.case .pair .article").length, 216);
  assert.equal(window.document.querySelectorAll("details").length, 108);
  assert.equal(window.document.querySelectorAll("details[open]").length, 0);
  assert.equal(window.document.querySelectorAll("article.case a").length, 25);
  for (const link of window.document.querySelectorAll("a")) {
    const href = link.getAttribute("href");
    assert.ok(href.startsWith("#"));
    assert.ok(window.document.getElementById(href.slice(1)));
  }
  window.close();
});

test("model selectors remain explicit and historical Jev review cannot restore paid approval", () => {
  for (const selected of [model, "@cf/cloudflare/clef", "typesafe/jev"]) {
    const result = run("review", "--model", selected, "--split", "safety");
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes("productionActivationAllowed: false"));
    if (selected === "typesafe/jev")
      assert.ok(result.stdout.includes("Jevの有料試験は取り消し済み"));
    else assert.ok(result.stdout.includes("inferenceAllowed: false"));
  }
  assert.notEqual(run("review", "--model", "unapproved/model").status, 0);
});

test("malformed or absent provenance renders safely and preserves the scorer HOLD status", () => {
  const dir = mkdtempSync(join(tmpdir(), "rss-review-provenance-"));
  try {
    const path = join(dir, "capture.json");
    for (const provenance of [
      undefined,
      null,
      0,
      [],
      { toString: null },
      '<script>alert("capture")</script>',
    ]) {
      writeFileSync(path, JSON.stringify({ provenance, results: [] }));
      const score = run("score", "--responses", path, "--split", "holdout");
      const review = run("review", "--responses", path, "--split", "holdout");
      assert.equal(score.status, 2, score.stderr);
      assert.equal(review.status, score.status, review.stderr);
      assert.ok(review.stdout.includes("HOLD"));
      assert.ok(!review.stdout.includes('<script>alert("capture")</script>'));
      if (typeof provenance !== "string")
        assert.ok(review.stdout.includes("unknown (invalid provenance)"));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
