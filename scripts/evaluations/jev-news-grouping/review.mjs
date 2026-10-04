import { classifyResponse, requestHash } from "./policy.mjs";
import { DEFAULT_HOSTED_MODEL, freeOnlyPreflight, modelProfile } from "./models.mjs";

const categories = {
  "false-merge": "誤統合: 続報・別件を隠す判定",
  "unsafe-safety": "情報不足なのに保留しなかった判定",
  "invalid-capture": "欠測・不正・重複・ハッシュ不一致",
  mismatch: "正解との不一致",
  abstained: "正常な応答で保留",
  matching: "正解と一致（モデル性能の証拠ではありません）",
  "not-evaluated": "未評価: 合成記事の比較のみ",
};
const labels = { same_event: "同じ出来事", follow_up: "続報", different: "別件" };
const actions = {
  group: "統合候補",
  relate: "関連づけのみ・別記事を維持",
  separate: "別記事を維持",
  abstain: "保留・別記事を維持",
};
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );

/** Display-only projection; use the existing scorer's exact validation and thresholds. */
export function buildReviewRows(pairs, capture, { model = DEFAULT_HOSTED_MODEL } = {}) {
  modelProfile(model);
  if (capture !== null && !Array.isArray(capture?.results))
    throw new Error("Capture requires results array");
  const records = new Map();
  for (const record of capture?.results ?? []) {
    const entries = records.get(record?.pairId) ?? [];
    entries.push(record);
    records.set(record?.pairId, entries);
  }
  return pairs.map((pair) => {
    if (capture === null) return { pair, decision: null, category: "not-evaluated", signals: null };
    const entries = records.get(pair.id) ?? [];
    const decision = !entries.length
      ? { action: "abstain", label: null, valid: false, reason: "missing-capture" }
      : entries.length !== 1 || entries[0].requestHash !== requestHash(pair, { model })
        ? { action: "abstain", label: null, valid: false, reason: "capture-mismatch-or-duplicate" }
        : classifyResponse(entries[0].response, { model });
    const category = !decision.valid
      ? "invalid-capture"
      : pair.split === "safety"
        ? decision.action === "abstain"
          ? "matching"
          : "unsafe-safety"
        : decision.action === "group" && pair.label !== "same_event"
          ? "false-merge"
          : decision.action === "abstain"
            ? "abstained"
            : decision.label === pair.label
              ? "matching"
              : "mismatch";
    const signals = decision.valid ? entries[0].response.answers : null;
    return { pair, decision, category, signals };
  });
}

function articlePanel(article, side) {
  return `<section class="article"><h3>記事${side}: ${escape(article.title)}</h3><p class="metadata">媒体: ${escape(article.source)} / 掲載日時: ${escape(article.publishedAt ?? "未設定")}</p><p>${escape(article.summary || "（短文なし）")}</p></section>`;
}

/** Standalone, script-free HTML. No URLs, capture payloads or credentials are embedded. */
export function renderReview(
  pairs,
  capture = null,
  { model = DEFAULT_HOSTED_MODEL, report = null } = {},
) {
  const profile = modelProfile(model);
  const provenance =
    capture === null
      ? "captureなし"
      : typeof capture.provenance === "string"
        ? capture.provenance
        : "unknown (invalid provenance)";
  const rows = buildReviewRows(pairs, capture, { model });
  const rowIds = new Map(pairs.map((pair, index) => [pair.id, `case-${index + 1}`]));
  const sections = Object.entries(categories)
    .map(([category, title]) => {
      const selected = rows.filter((row) => row.category === category);
      if (!selected.length) return "";
      const cases = selected
        .map(({ pair, decision, signals }) => {
          const reverse = rowIds.get(pair.reversedFrom);
          const probability = signals
            ? `<p>選択: ${escape(labels[signals.relationship.choice])} / confidence: ${escape(signals.relationship.confidence)} / evidence: ${escape(signals.sufficient_evidence.noul)}</p><p>確率: ${escape(JSON.stringify(signals.relationship.probabilities))}</p>`
            : "";
          return `<article class="case" id="${rowIds.get(pair.id)}" data-case-id="${escape(pair.id)}"><h3>${escape(pair.id)} · ${escape(pair.split)}</h3>${pair.reversedFrom ? `<p>左右反転: ${reverse ? `<a href="#${reverse}">${escape(pair.reversedFrom)}</a>` : escape(pair.reversedFrom)}（独立標本には数えません）</p>` : ""}<div class="pair">${articlePanel(pair.a, "A")}${articlePanel(pair.b, "B")}</div><p class="decision">${decision ? `判定: ${escape(actions[decision.action])} / 理由: ${escape(decision.reason)}` : "未評価: モデル応答はありません"}</p>${probability}<details><summary>合成データの正解・理由を確認</summary><p>正解: ${escape(pair.split === "safety" ? "情報不足のため保留" : labels[pair.label])}</p><p>${escape(pair.rationale)}</p><p>確認項目: ${escape(pair.tags.join(" / "))}</p></details></article>`;
        })
        .join("\n");
      return `<section id="${category}"><h2>${escape(title)} (${selected.length})</h2>${cases}</section>`;
    })
    .join("\n");
  const navigation = Object.entries(categories)
    .map(([category, title]) => {
      const count = rows.filter((row) => row.category === category).length;
      return count ? `<li><a href="#${category}">${escape(title)} (${count})</a></li>` : "";
    })
    .join("");
  const summary = report
    ? `<h2>既存採点結果: ${escape(report.acceptance.status)}</h2><p>欠測: ${escape(report.missing ?? report.safety.missing)} / 不正: ${escape(report.invalid ?? report.safety.invalid)} / 対象外: ${escape(report.extraRecords ?? report.safety.extraRecords)} / 誤統合: ${escape(report.falseMerges ?? 0)}</p><p>Safety欠測: ${escape(report.safety.missing)} / Safety不正: ${escape(report.safety.invalid)} / Safety危険判定: ${escape(report.safety.unsafeDecisions)}</p><ul>${(report.acceptance.blockers ?? []).map((blocker) => `<li>${escape(blocker)}</li>`).join("")}</ul><details><summary>既存JSON採点レポート全文</summary><pre>${escape(JSON.stringify(report, null, 2))}</pre></details>`
    : "<p>captureなし。実際の推論・日本語精度は未測定。正解だけからモデルの判定や精度を作りません。</p>";
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; connect-src 'none'"><title>同じニュース判定 · オフライン比較</title><style>
:root{color-scheme:light dark}body{font-family:system-ui,sans-serif;line-height:1.7;max-width:1100px;margin:auto;padding:24px;background:#fff;color:#202020}a{color:#165bc0}a:focus-visible,summary:focus-visible{outline:3px solid currentColor;outline-offset:4px}.notice,.case{border:1px solid #737373;border-radius:8px;padding:16px;margin:16px 0}.notice{border-width:2px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}.article{min-width:0}.case h3{margin:0 0 8px}.metadata{font-size:.9rem}.decision{font-weight:700}summary{cursor:pointer}pre{white-space:pre-wrap}p,h3,pre,a{overflow-wrap:anywhere}section[id],article[id]{scroll-margin-top:16px}@media(max-width:640px){body{padding:12px}.pair{grid-template-columns:1fr}}@media(prefers-color-scheme:dark){body{background:#171717;color:#ededed}a{color:#94bcff}}
</style></head><body><header><h1>同じニュース判定を比較する</h1><p>架空の日本語ニュース ${rows.length} 比較 / ${escape(profile.name)} / provenance: ${escape(provenance)}</p></header><aside class="notice" aria-label="評価の制約"><p>オフライン閲覧専用。推論・通信0回。productionActivationAllowed: false</p><p>${profile.hosted ? `${escape(freeOnlyPreflight().status)} / inferenceAllowed: false` : "Jevの有料試験は取り消し済み。過去記録の閲覧だけです。"}</p><p>captured / mock と正解一致は、認証済みの実行や実際のRSS精度の証明になりません。モデル性能の証拠ではありません。confidenceや確率も日本語精度として校正されていません。</p><p>developmentで基準を固定してからholdoutを一度評価してください。holdoutの結果・正解を見て閾値を調整したら、新しい未見データが必要です。続報は別記事として残します。</p></aside><main>${summary}<nav aria-label="判定別の比較"><h2>ケースへ移動</h2><ul>${navigation}</ul></nav>${sections}</main></body></html>\n`;
}
