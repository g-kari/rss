import type { WorkersAiModelId } from "./ai-models";
import type { AiUsage } from "./ai-output";

export const MAX_SUMMARY_CACHE_URLS = 12;
/** Approved scheduled model only. This policy does not report deployed configuration or activity. */
export const APPROVED_SCHEDULED_SUMMARY_MODEL: WorkersAiModelId = "@cf/google/gemma-4-26b-a4b-it";
export interface SummaryMetadata {
  version: 1;
  model: WorkersAiModelId;
  promptVersion: string | null;
  bodyHash: string | null;
  generatedAt: string | null;
  inputCharacters: number | null;
  inputTruncated: boolean | null;
  /** Extraction does not prove that the publisher's complete body was available. */
  completeness: "unknown" | "truncated";
  usage: AiUsage | null;
}
export interface CachedSummary {
  url: string;
  result: string;
  metadata: SummaryMetadata;
}
export interface SummaryCacheResponse {
  model: WorkersAiModelId;
  summaries: CachedSummary[];
}
