import { describe, expect, it } from "vitest";
import { AI_MODELS, DEFAULT_AI_MODEL } from "./ai-models";
import type { CachedSummary, SummaryMetadata } from "./ai-summary-contract";
import type { Article } from "../types";
import {
  freezeImmersiveTextPresentation,
  resolveImmersiveText,
  selectImmersiveSummaryUrls,
  summaryDisplayText,
  summaryProvenanceLabel,
  validateSummaryCacheResponse,
} from "./immersive-summary";

const url = "https://example.com/article";
const metadata: SummaryMetadata = {
  version: 1,
  model: DEFAULT_AI_MODEL,
  promptVersion: "old-prompt",
  bodyHash: "a".repeat(64),
  generatedAt: "2001-01-01T00:00:00Z",
  inputCharacters: 8000,
  inputTruncated: true,
  completeness: "truncated",
  usage: { inputTokens: 1, outputTokens: 2 },
};
const summary: CachedSummary = { url, result: "**保存した要約**。", metadata };
const article: Article = {
  id: "a",
  feedHash: "f",
  guid: "a",
  title: "記事",
  link: url,
  summary: "<p>フィードの抜粋。</p>",
  publishedAt: null,
  createdAt: "2026-10-02T00:00:00Z",
};
function response(row: unknown = summary) {
  return { model: DEFAULT_AI_MODEL, summaries: [row] };
}

describe("immersive cache contract", () => {
  it("preserves exact URL priority, rejects invalid values and bounds a single window", () => {
    const urls = Array.from({ length: 20 }, (_, i) => `https://example.com/${i}`);
    expect(
      selectImmersiveSummaryUrls([
        "",
        "javascript:alert(1)",
        "http://localhost/a",
        url,
        url,
        `${url}#x`,
        ...urls,
      ]),
    ).toEqual([url, `${url}#x`, ...urls.slice(0, 10)]);
    expect(selectImmersiveSummaryUrls([`${url}?${"a".repeat(2049)}`])).toEqual([]);
  });

  it("accepts old provenance and strips thinking without claiming freshness", () => {
    const accepted = validateSummaryCacheResponse(
      response({ ...summary, result: "<think>private</think>Final." }),
      DEFAULT_AI_MODEL,
      [url],
    );
    expect(accepted.summaries[0]).toEqual({ ...summary, result: "Final." });
    expect(accepted.summaries[0]?.metadata.generatedAt).toBe(metadata.generatedAt);
  });

  it("accepts explicit legacy unknown provenance and empty miss batches", () => {
    const legacy = {
      ...metadata,
      promptVersion: null,
      bodyHash: null,
      generatedAt: null,
      inputCharacters: null,
      inputTruncated: null,
      completeness: "unknown",
      usage: null,
    };
    expect(
      validateSummaryCacheResponse(response({ ...summary, metadata: legacy }), DEFAULT_AI_MODEL, [
        url,
      ]).summaries[0]?.metadata,
    ).toEqual(legacy);
    expect(
      validateSummaryCacheResponse({ model: DEFAULT_AI_MODEL, summaries: [] }, DEFAULT_AI_MODEL, [
        url,
      ]).summaries,
    ).toEqual([]);
  });

  it.each([
    null,
    {},
    { summaries: [] },
    { model: "@cf/not-a-model", summaries: [] },
    { model: "@cf/meta/llama-3.2-3b-instruct", summaries: [] },
    { model: DEFAULT_AI_MODEL, summaries: {} },
    response(null),
    response({ ...summary, url: `${url}/unsolicited` }),
    { model: DEFAULT_AI_MODEL, summaries: [summary, summary] },
    response({ ...summary, result: "<think>Only thinking</think>" }),
    response({ ...summary, result: "<think>Unclosed" }),
    response({ ...summary, result: 1 }),
    response({ ...summary, metadata: null }),
  ])(
    "rejects malformed or wrong-partition batches rather than treating them as misses: %j",
    (value) => {
      expect(() => validateSummaryCacheResponse(value, DEFAULT_AI_MODEL, [url])).toThrow();
    },
  );

  it.each([
    { version: 2 },
    { model: "@cf/meta/llama-3.2-3b-instruct" },
    { promptVersion: 1 },
    { bodyHash: "bad" },
    { generatedAt: "not a date" },
    { inputCharacters: -1 },
    { inputCharacters: 8001 },
    { inputCharacters: 1.5 },
    { inputTruncated: "yes" },
    { completeness: "complete" },
    { inputTruncated: false, completeness: "truncated" },
    { inputTruncated: null, completeness: "truncated" },
    { completeness: "unknown" },
    { usage: { inputTokens: -1, outputTokens: 1 } },
    { usage: { inputTokens: 1, outputTokens: 1.5 } },
    { usage: { inputTokens: Number.MAX_SAFE_INTEGER + 1, outputTokens: 1 } },
    { usage: [] },
  ])("validates all metadata invariants: %j", (patch) => {
    expect(() =>
      validateSummaryCacheResponse(
        response({ ...summary, metadata: { ...metadata, ...patch } }),
        DEFAULT_AI_MODEL,
        [url],
      ),
    ).toThrow();
  });

  it("bounds result and metadata independently in UTF-8 bytes", () => {
    expect(() =>
      validateSummaryCacheResponse(
        response({ ...summary, result: "あ".repeat(45_000) }),
        DEFAULT_AI_MODEL,
        [url],
      ),
    ).toThrow();
    expect(() =>
      validateSummaryCacheResponse(
        response({ ...summary, metadata: { ...metadata, promptVersion: "a".repeat(128 * 1024) } }),
        DEFAULT_AI_MODEL,
        [url],
      ),
    ).toThrow();
  });
});

describe("immersive presentation", () => {
  it("renders Markdown to safe plain text with accurate cached model provenance", () => {
    const presentation = resolveImmersiveText(article, {
      ...summary,
      result: "<think>hidden</think>**Final** [link](https://example.com).",
    });
    expect(presentation.text).toBe("Final link .");
    expect(presentation.source).toBe("cached-ai");
    expect(presentation.sourceLabel).toBe(
      `保存済みのAI要約 · ${AI_MODELS.find((model) => model.id === DEFAULT_AI_MODEL)?.label}`,
    );
    expect(presentation.metadata?.model).toBe(DEFAULT_AI_MODEL);
    expect(presentation.metadata).toEqual(metadata);
    expect(presentation.previewShortened).toBe(false);
  });

  it("uses verbatim fallback for empty, reasoning-only or wrong URL cached text", () => {
    for (const cached of [
      undefined,
      { ...summary, result: "<think>hidden</think>" },
      { ...summary, result: "---" },
      { ...summary, url: `${url}/other` },
    ]) {
      const presentation = resolveImmersiveText(article, cached);
      expect(presentation).toEqual({
        text: "フィードの抜粋。",
        source: "excerpt",
        sourceLabel: "フィード説明の抜粋",
        metadata: null,
        previewShortened: false,
      });
    }
  });

  it("distinguishes excerpt shortening from input truncation and never invents completeness", () => {
    const result = "文です。".repeat(400);
    const fullMetadata = {
      ...metadata,
      inputCharacters: 100,
      inputTruncated: false,
      completeness: "unknown" as const,
    };
    const presentation = resolveImmersiveText(article, {
      ...summary,
      result,
      metadata: fullMetadata,
    });
    expect(presentation.previewShortened).toBe(true);
    expect(presentation.metadata?.inputTruncated).toBe(false);
    expect(presentation.metadata?.completeness).toBe("unknown");
    expect(presentation.text).toMatch(/文です。$/);
    expect(resolveImmersiveText(article, summary).previewShortened).toBe(false);
  });

  it("freezes a detached presentation and nested provenance for current captions, transcript and TTS", () => {
    const presentation = resolveImmersiveText(article, summary);
    const frozen = freezeImmersiveTextPresentation(presentation);
    expect(frozen).toEqual(presentation);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.metadata)).toBe(true);
    expect(Object.isFrozen(frozen.metadata?.usage)).toBe(true);
    expect(frozen.metadata).not.toBe(presentation.metadata);
    presentation.text = "changed";
    if (presentation.metadata?.usage) presentation.metadata.usage.inputTokens = 99;
    expect(frozen.text).toBe("保存した要約 。");
    expect(frozen.metadata?.usage?.inputTokens).toBe(1);
  });
});

it("describes unknown legacy provenance without claiming full-body completeness", () => {
  const legacy = {
    ...metadata,
    promptVersion: null,
    bodyHash: null,
    generatedAt: null,
    inputCharacters: null,
    inputTruncated: null,
    completeness: "unknown" as const,
    usage: null,
  };
  expect(summaryProvenanceLabel(legacy)).toContain("生成情報不明");
  expect(summaryProvenanceLabel(legacy)).toContain("打ち切り有無不明");
  expect(summaryProvenanceLabel(metadata)).toContain("入力は途中で打ち切り");
  expect(
    summaryProvenanceLabel({ ...metadata, inputTruncated: false, completeness: "unknown" }),
  ).toContain("本文全体の取得状況不明");
  expect(summaryDisplayText({ ...summary, result: "<think>hidden</think>**Final**." })).toBe(
    "Final .",
  );
});

it("labels feed-body and title-only fallback honestly", () => {
  expect(
    resolveImmersiveText({ ...article, content: "<p>Longer feed body.</p>" }).sourceLabel,
  ).toBe("フィード本文の抜粋");
  expect(resolveImmersiveText({ ...article, summary: "" }).sourceLabel).toBe("タイトルのみ");
});

it("accurately reports display shortening of a long fallback excerpt", () => {
  const presentation = resolveImmersiveText({ ...article, summary: "文です。".repeat(400) });
  expect(presentation.source).toBe("excerpt");
  expect(presentation.previewShortened).toBe(true);
});

it("accepts a backend-limit legacy result without charging URL/envelope overhead against its 128KiB", () => {
  const legacyMetadata = {
    ...metadata,
    promptVersion: null,
    bodyHash: null,
    generatedAt: null,
    inputCharacters: null,
    inputTruncated: null,
    completeness: "unknown" as const,
    usage: null,
  };
  const result = "a".repeat(128 * 1024);
  expect(
    validateSummaryCacheResponse(
      response({ ...summary, result, metadata: legacyMetadata }),
      DEFAULT_AI_MODEL,
      [url],
    ).summaries[0]?.result,
  ).toBe(result);
  expect(() =>
    validateSummaryCacheResponse(
      response({ ...summary, result: result + "a", metadata: legacyMetadata }),
      DEFAULT_AI_MODEL,
      [url],
    ),
  ).toThrow();
  const multibyte = "あ".repeat(Math.floor((128 * 1024) / 3)) + "aa";
  expect(new TextEncoder().encode(multibyte).byteLength).toBe(128 * 1024);
  expect(
    validateSummaryCacheResponse(
      response({ ...summary, result: multibyte, metadata: legacyMetadata }),
      DEFAULT_AI_MODEL,
      [url],
    ).summaries[0]?.result,
  ).toBe(multibyte);
});

it("bounds validated metadata independently of result length", () => {
  expect(() =>
    validateSummaryCacheResponse(
      response({ ...summary, metadata: { ...metadata, promptVersion: "あ".repeat(6000) } }),
      DEFAULT_AI_MODEL,
      [url],
    ),
  ).toThrow();
});
