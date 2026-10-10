import type { Article } from "../types";
import { AI_MODELS, isWorkersAiModelId, type WorkersAiModelId } from "./ai-models";
import { stripAiThinking } from "./ai-output";
import { renderSummaryHtml } from "./ai-summary-markdown";
import {
  MAX_SUMMARY_CACHE_URLS,
  type CachedSummary,
  type SummaryCacheResponse,
  type SummaryMetadata,
} from "./ai-summary-contract";
import { toPlainText } from "./html";
import { contentLruCache } from "./lru-cache";
import { getProviderContentCacheId } from "./slide-providers";
import { immersiveExcerpt } from "./immersive-articles";
import { sentenceExcerpt } from "./immersive-text";
import { isValidFeedUrl } from "./url";

// Legacy cache results can occupy the full backend limit without a JSON envelope.
export const MAX_IMMERSIVE_SUMMARY_RESULT_BYTES = 128 * 1024;
export const MAX_IMMERSIVE_SUMMARY_METADATA_BYTES = 16 * 1024;

/** Exact URL identity is the cache contract; never normalize or crawl beyond this window. */
export function selectImmersiveSummaryUrls(urls: readonly string[]): string[] {
  const selected = new Set<string>();
  for (const url of urls) {
    if (typeof url === "string" && isValidFeedUrl(url)) selected.add(url);
    if (selected.size === MAX_SUMMARY_CACHE_URLS) break;
  }
  return [...selected];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isSummaryMetadata(value: unknown, model: WorkersAiModelId): value is SummaryMetadata {
  if (!isRecord(value)) return false;
  return (
    value.version === 1 &&
    value.model === model &&
    (value.promptVersion === null || typeof value.promptVersion === "string") &&
    (value.bodyHash === null ||
      (typeof value.bodyHash === "string" && /^[a-f0-9]{64}$/.test(value.bodyHash))) &&
    (value.generatedAt === null ||
      (typeof value.generatedAt === "string" && Number.isFinite(Date.parse(value.generatedAt)))) &&
    (value.inputCharacters === null ||
      (isNonnegativeInteger(value.inputCharacters) && value.inputCharacters <= 8000)) &&
    (value.inputTruncated === null || typeof value.inputTruncated === "boolean") &&
    value.completeness === (value.inputTruncated === true ? "truncated" : "unknown") &&
    (value.usage === null ||
      (isRecord(value.usage) &&
        isNonnegativeInteger(value.usage.inputTokens) &&
        isNonnegativeInteger(value.usage.outputTokens)))
  );
}

/** Malformed batches fail atomically: corruption must never become an ordinary cache miss. */
export function validateSummaryCacheResponse(
  value: unknown,
  model: WorkersAiModelId,
  requestedUrls: readonly string[],
): SummaryCacheResponse {
  const requested = new Set(requestedUrls);
  if (
    !isWorkersAiModelId(model) ||
    !isRecord(value) ||
    value.model !== model ||
    !Array.isArray(value.summaries) ||
    requested.size > MAX_SUMMARY_CACHE_URLS ||
    value.summaries.length > requested.size
  )
    throw new Error("保存済み要約の応答形式が不正です");
  const seen = new Set<string>();
  const summaries: CachedSummary[] = [];
  for (const row of value.summaries) {
    if (
      !isRecord(row) ||
      typeof row.url !== "string" ||
      !requested.has(row.url) ||
      seen.has(row.url) ||
      typeof row.result !== "string" ||
      !isSummaryMetadata(row.metadata, model) ||
      new TextEncoder().encode(row.result).byteLength > MAX_IMMERSIVE_SUMMARY_RESULT_BYTES ||
      new TextEncoder().encode(JSON.stringify(row.metadata)).byteLength >
        MAX_IMMERSIVE_SUMMARY_METADATA_BYTES
    )
      throw new Error("保存済み要約の応答形式が不正です");
    const result = stripAiThinking(row.result);
    if (!result) throw new Error("保存済み要約の本文が不正です");
    seen.add(row.url);
    summaries.push({ url: row.url, result, metadata: row.metadata });
  }
  return { model, summaries };
}

export interface ImmersiveTextPresentation {
  text: string;
  source: "cached-ai" | "excerpt";
  sourceLabel: string;
  metadata: SummaryMetadata | null;
  /** Only display shortening. This says nothing about source-body completeness. */
  previewShortened: boolean;
}

export interface FrozenImmersiveTextPresentation {
  readonly text: string;
  readonly source: ImmersiveTextPresentation["source"];
  readonly sourceLabel: string;
  readonly metadata:
    | (Readonly<Omit<SummaryMetadata, "usage">> & {
        readonly usage: Readonly<NonNullable<SummaryMetadata["usage"]>> | null;
      })
    | null;
  readonly previewShortened: boolean;
}

/** Render only already-saved final output; the fallback never triggers body extraction or AI. */
export function resolveImmersiveText(
  article: Article,
  cachedSummary?: CachedSummary | null,
): ImmersiveTextPresentation {
  // A missing article link must not make an absent summary's optional URL look like a match.
  const plain =
    cachedSummary && cachedSummary.url === article.link ? summaryDisplayText(cachedSummary) : "";
  if (plain && cachedSummary) {
    const text = sentenceExcerpt(plain);
    const modelLabel =
      AI_MODELS.find((model) => model.id === cachedSummary.metadata.model)?.label ?? "モデル不明";
    return {
      text,
      source: "cached-ai",
      sourceLabel: `保存済みのAI要約 · ${modelLabel}`,
      metadata: cachedSummary.metadata,
      previewShortened: text !== plain,
    };
  }
  const cachedBody = toPlainText(
    contentLruCache.get(getProviderContentCacheId(article.id, article.link)) || "",
  );
  const body = toPlainText(article.content || "");
  const description = toPlainText(article.summary);
  const sourceLabel = cachedBody
    ? "取得済み本文の抜粋"
    : body && body.length >= description.length
      ? "フィード本文の抜粋"
      : description
        ? "フィード説明の抜粋"
        : "タイトルのみ";
  const text = immersiveExcerpt(article);
  // Compare the canonical fallback preview to its selected already-loaded source.
  const sourceText = cachedBody || (body.length >= description.length ? body : description);
  return {
    text,
    source: "excerpt",
    sourceLabel,
    metadata: null,
    previewShortened: text !== sourceText,
  };
}

/** Pin the current presentation so late cache hits cannot rewrite active captions or speech. */
export function freezeImmersiveTextPresentation(
  presentation: ImmersiveTextPresentation,
): FrozenImmersiveTextPresentation {
  const metadata = presentation.metadata;
  return Object.freeze({
    ...presentation,
    metadata: metadata
      ? Object.freeze({
          ...metadata,
          usage: metadata.usage ? Object.freeze({ ...metadata.usage }) : null,
        })
      : null,
  });
}

/** Full display/narration text; never confuse this with the shortened preview. */
export function summaryDisplayText(summary: CachedSummary): string {
  return toPlainText(renderSummaryHtml(stripAiThinking(summary.result)));
}

/** Truncated AI input and a shortened UI preview are independent facts. */
export function summaryProvenanceLabel(metadata: SummaryMetadata): string {
  const legacyUnknown =
    metadata.promptVersion === null || metadata.bodyHash === null || metadata.generatedAt === null;
  const generation = legacyUnknown ? "生成情報不明" : `生成: ${metadata.generatedAt}`;
  const input =
    metadata.inputTruncated === true
      ? "入力は途中で打ち切り"
      : metadata.inputTruncated === null
        ? "入力の打ち切り有無不明"
        : "入力の打ち切りなし";
  return `${generation} · ${input} · 本文全体の取得状況不明`;
}
