import { NextResponse } from "next/server";
import { withSession, parseJsonBody } from "@/lib/server-auth";
import { isWorkersAiModelId } from "@/lib/ai-models";
import { getAiSummaryByUrl } from "@/lib/ai-cache";
import {
  MAX_SUMMARY_CACHE_URLS,
  type CachedSummary,
  type SummaryCacheResponse,
} from "@/lib/ai-summary-contract";
import { isValidFeedUrl } from "@/lib/url";
import { apiError } from "@/lib/api-error";

/** Read-only: never extracts article bodies or calls AI, including on cache misses. */
export async function POST(request: Request) {
  return withSession(request, async ({ env }) => {
    const parsed = await parseJsonBody<{ urls?: unknown; model?: unknown }>(request);
    if (!parsed.ok) return parsed.error;
    const body = parsed.data;
    if (!body || !isWorkersAiModelId(body.model))
      return apiError("Explicit AI model required", 400, { code: "INVALID_MODEL" });
    if (
      !Array.isArray(body.urls) ||
      body.urls.length < 1 ||
      body.urls.length > MAX_SUMMARY_CACHE_URLS ||
      body.urls.some((url) => typeof url !== "string" || url.length > 2048 || !isValidFeedUrl(url))
    ) {
      return apiError("Invalid article URLs", 400, { code: "INVALID_URL" });
    }
    const model = body.model;
    const summaries: CachedSummary[] = [];
    // Sequential reads bound R2 concurrency and response size independent of batch length.
    for (const url of new Set(body.urls as string[])) {
      const cached = await getAiSummaryByUrl(env.RSS_DATA, url, model);
      if (cached) summaries.push({ url, ...cached });
    }
    return NextResponse.json({ model, summaries } satisfies SummaryCacheResponse, {
      headers: { "Cache-Control": "private, no-store" },
    });
  });
}
