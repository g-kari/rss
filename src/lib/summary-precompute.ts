import { getAiSummaryByUrl, setAiSummaryByUrl } from "./ai-cache";
import {
  buildAiInputs,
  buildSummaryMessages,
  prepareAiArticle,
  AI_MAX_OUTPUT_TOKENS,
  SUMMARY_PROMPT_VERSION,
} from "./ai-generation";
import {
  claimSummaryGeneration,
  finishSummaryGeneration,
  failSummaryGeneration,
  type ClaimedGeneration,
} from "./ai-generation-lease";
import { getAiResponseText, getAiUsage } from "./ai-output";
import { isWorkersAiModelId, type WorkersAiModelId } from "./ai-models";
import { buildContentCacheKey } from "./fetch-article-content";
import { matchCfCache } from "./cache-helper";
import { sha256Hex } from "./r2";
import { isValidFeedUrl } from "./url";
import { MAX_SUMMARY_CACHE_URLS } from "./ai-summary-contract";
import { claimPrecompute, finishPrecompute } from "./summary-precompute-lease";

export interface SummaryPrecomputeEnv {
  RSS_DATA: R2Bucket;
  AI: Ai;
  RSS_SUMMARY_PRECOMPUTE_ENABLED?: string;
  RSS_SUMMARY_PRECOMPUTE_MODEL?: string;
  RSS_SUMMARY_PRECOMPUTE_RUN_USD?: string;
  RSS_SUMMARY_PRECOMPUTE_DAY_USD?: string;
  RSS_SUMMARY_PRECOMPUTE_MONTH_USD?: string;
  RSS_SUMMARY_PRECOMPUTE_MAX_ARTICLES?: string;
  RSS_SUMMARY_PRECOMPUTE_MAX_DAILY_ARTICLES?: string;
  RSS_SUMMARY_PRECOMPUTE_CONCURRENCY?: string;
}

/** Approved rollout: Gemma 4, at most 5/run, 100/UTC day, concurrency 1 and USD 1/month. */
export const SUMMARY_PRECOMPUTE_ROLLOUT_ENABLED: boolean = true;

/** Retained configuration cannot broaden the approved model, count or reservation limits. */
export async function runScheduledSummaryPrecompute(
  env: SummaryPrecomputeEnv,
  urls: string[],
  origin: string,
  scheduledTime: number,
): Promise<number> {
  if (!SUMMARY_PRECOMPUTE_ROLLOUT_ENABLED) return 0;
  const now = Date.now();
  const config = summaryPrecomputeConfig(env, now);
  if (
    !config ||
    config.model !== "@cf/google/gemma-4-26b-a4b-it" ||
    config.maxArticles > 5 ||
    config.maxDailyArticles > 100 ||
    config.runMicros > 131075 ||
    config.monthMicros > 1_000_000 ||
    env.RSS_SUMMARY_PRECOMPUTE_CONCURRENCY !== "1" ||
    !validSchedule(scheduledTime, now)
  )
    return 0;
  try {
    const claim = await claimPrecompute(env.RSS_DATA, new Date(scheduledTime).toISOString());
    if (!claim) {
      console.warn("[summary-precompute] active invocation or operator-recovery hold");
      return 0;
    }
    let generated: number;
    try {
      generated = await runSummaryPrecompute(env, urls, origin, scheduledTime, now);
    } finally {
      await finishPrecompute(env.RSS_DATA, claim);
    }
    console.info("[summary-precompute] completed", { runId: claim.runId, generated });
    return generated;
  } catch (error) {
    console.warn(
      "[summary-precompute] rollout failed closed; inspect lease and ledger",
      error instanceof Error ? error.message : "unknown error",
    );
    return 0;
  }
}

// Primary Cloudflare model + pricing pages verified 2026-10-02. No cached-input discount.
// This snapshot deliberately expires. Revalidate before enabling or extending its lifetime.
const PRICES_VERIFIED_AT = Date.parse("2026-10-02T00:00:00Z");
const PRICES_VALID_UNTIL = Date.parse("2026-11-01T00:00:00Z");
const PRICE_BOUNDS: Partial<
  Record<
    WorkersAiModelId,
    { inputContext: number; inputUsdPerMillion: number; outputUsdPerMillion: number }
  >
> = {
  "@cf/google/gemma-4-26b-a4b-it": {
    inputContext: 256000,
    inputUsdPerMillion: 0.1,
    outputUsdPerMillion: 0.3,
  },
  "@cf/mistralai/mistral-small-3.1-24b-instruct": {
    inputContext: 128000,
    inputUsdPerMillion: 0.351,
    outputUsdPerMillion: 0.555,
  },
  "@cf/qwen/qwen3-30b-a3b-fp8": {
    inputContext: 32768,
    inputUsdPerMillion: 0.0509,
    outputUsdPerMillion: 0.335,
  },
};

interface PrecomputeConfig {
  model: WorkersAiModelId;
  runMicros: number;
  dayMicros: number;
  monthMicros: number;
  maxArticles: number;
  maxDailyArticles: number;
  reservationMicros: number;
}

function usdMicros(value: string | undefined): number | null {
  if (!value || !/^\d{1,5}(?:\.\d{1,6})?$/.test(value)) return null;
  const micros = Math.round(Number(value) * 1_000_000);
  return Number.isSafeInteger(micros) && micros > 0 ? micros : null;
}

/** Not a billing hard cap: reserve the full model input context, not a guessed chars/token ratio. */
export function precomputeReservationMicros(model: WorkersAiModelId, now: number): number | null {
  const price = PRICE_BOUNDS[model];
  if (!price || !Number.isFinite(now) || now < PRICES_VERIFIED_AT || now >= PRICES_VALID_UNTIL)
    return null;
  return Math.ceil(
    price.inputContext * price.inputUsdPerMillion +
      AI_MAX_OUTPUT_TOKENS * price.outputUsdPerMillion,
  );
}

export function summaryPrecomputeConfig(
  env: SummaryPrecomputeEnv,
  now: number,
): PrecomputeConfig | null {
  if (
    env.RSS_SUMMARY_PRECOMPUTE_ENABLED !== "true" ||
    !isWorkersAiModelId(env.RSS_SUMMARY_PRECOMPUTE_MODEL)
  )
    return null;
  const model = env.RSS_SUMMARY_PRECOMPUTE_MODEL;
  const reservationMicros = precomputeReservationMicros(model, now);
  const runMicros = usdMicros(env.RSS_SUMMARY_PRECOMPUTE_RUN_USD);
  const dayMicros = usdMicros(env.RSS_SUMMARY_PRECOMPUTE_DAY_USD);
  const monthMicros = usdMicros(env.RSS_SUMMARY_PRECOMPUTE_MONTH_USD);
  const maxArticles = Number(env.RSS_SUMMARY_PRECOMPUTE_MAX_ARTICLES);
  const maxDailyArticles = Number(env.RSS_SUMMARY_PRECOMPUTE_MAX_DAILY_ARTICLES);
  if (
    !reservationMicros ||
    !runMicros ||
    !dayMicros ||
    !monthMicros ||
    runMicros > dayMicros ||
    dayMicros > monthMicros ||
    !Number.isInteger(maxArticles) ||
    maxArticles < 1 ||
    maxArticles > MAX_SUMMARY_CACHE_URLS ||
    !/^[1-9]\d?$/.test(env.RSS_SUMMARY_PRECOMPUTE_MAX_ARTICLES ?? "") ||
    !/^(?:[1-9]\d?|100)$/.test(env.RSS_SUMMARY_PRECOMPUTE_MAX_DAILY_ARTICLES ?? "") ||
    maxArticles > maxDailyArticles
  )
    return null;
  return {
    model,
    reservationMicros,
    runMicros,
    dayMicros,
    monthMicros,
    maxArticles,
    maxDailyArticles,
  };
}

interface UsageLedger {
  version: 1;
  month: string;
  micros: number;
  days: Record<string, number>;
  runs: Record<string, { micros: number; calls: number }>;
}

function validLedger(value: UsageLedger, month: string): boolean {
  const validAmount = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
  if (
    !value ||
    typeof value !== "object" ||
    value.version !== 1 ||
    value.month !== month ||
    !validAmount(value.micros) ||
    !value.days ||
    typeof value.days !== "object" ||
    Array.isArray(value.days) ||
    Object.keys(value.days).length > 31 ||
    !value.runs ||
    typeof value.runs !== "object" ||
    Array.isArray(value.runs) ||
    Object.keys(value.runs).length > 2000
  )
    return false;
  let dailyTotal = 0;
  for (const [day, amount] of Object.entries(value.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !day.startsWith(month) || !validAmount(amount))
      return false;
    const parsed = Date.parse(day + "T00:00:00Z");
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== day)
      return false;
    dailyTotal += amount;
    if (!Number.isSafeInteger(dailyTotal)) return false;
  }
  let runTotal = 0;
  const runDailyTotals: Record<string, number> = {};
  for (const [id, run] of Object.entries(value.runs)) {
    const parsed = Date.parse(id);
    if (
      !Number.isFinite(parsed) ||
      new Date(parsed).toISOString() !== id ||
      !id.startsWith(month) ||
      !run ||
      typeof run !== "object" ||
      !validAmount(run.micros) ||
      !validAmount(run.calls) ||
      run.calls > MAX_SUMMARY_CACHE_URLS ||
      (run.calls === 0) !== (run.micros === 0)
    )
      return false;
    runTotal += run.micros;
    const day = id.slice(0, 10);
    runDailyTotals[day] = (runDailyTotals[day] ?? 0) + run.micros;
    if (!Number.isSafeInteger(runTotal)) return false;
  }
  return (
    dailyTotal === value.micros &&
    runTotal === value.micros &&
    Object.entries(runDailyTotals).every(([day, amount]) => value.days[day] === amount) &&
    Object.entries(value.days).every(([day, amount]) => (runDailyTotals[day] ?? 0) === amount)
  );
}

/** Reserve once before any inference. Conflicts/errors fail closed; failures are never refunded. */
async function reserveUsage(
  bucket: R2Bucket,
  config: PrecomputeConfig,
  now: number,
  runId: string,
): Promise<boolean> {
  const day = new Date(now).toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  const key = `ai-cache/summary-budget/${month}.json`;
  const object = await bucket.get(key);
  if (object && object.size > 256 * 1024) throw new Error("Usage ledger too large");
  const ledger: UsageLedger = object
    ? await object.json<UsageLedger>()
    : { version: 1, month, micros: 0, days: {}, runs: {} };
  if (!validLedger(ledger, month)) throw new Error("Invalid summary usage ledger");
  const run = ledger.runs[runId] ?? { micros: 0, calls: 0 };
  const amount = config.reservationMicros;
  const dailyCalls = Object.entries(ledger.runs)
    .filter(([id]) => id.startsWith(day))
    .reduce((total, [, entry]) => total + entry.calls, 0);
  if (
    ledger.micros + amount > config.monthMicros ||
    (ledger.days[day] ?? 0) + amount > config.dayMicros ||
    run.micros + amount > config.runMicros ||
    run.calls >= config.maxArticles ||
    dailyCalls >= config.maxDailyArticles ||
    (!ledger.runs[runId] && Object.keys(ledger.runs).length >= 2000)
  )
    return false;
  ledger.micros += amount;
  ledger.days[day] = (ledger.days[day] ?? 0) + amount;
  ledger.runs[runId] = { micros: run.micros + amount, calls: run.calls + 1 };
  const saved = await bucket.put(key, JSON.stringify(ledger), {
    onlyIf: object ? { etagMatches: object.etag } : new Headers({ "If-None-Match": "*" }),
    httpMetadata: { contentType: "application/json" },
  });
  return !!saved;
}

function validSchedule(scheduledTime: number, now: number): boolean {
  return (
    Number.isFinite(scheduledTime) &&
    Number.isFinite(now) &&
    Math.abs(now - scheduledTime) <= 60 * 60 * 1000 &&
    new Date(scheduledTime).toISOString().slice(0, 10) === new Date(now).toISOString().slice(0, 10)
  );
}

/** Only reads article bodies already fetched by existing cron prefetch. */
export async function runSummaryPrecompute(
  env: SummaryPrecomputeEnv,
  urls: string[],
  origin: string,
  scheduledTime: number,
  now = Date.now(),
  clock = Date.now,
): Promise<number> {
  const config = summaryPrecomputeConfig(env, now);
  if (!config || !validSchedule(scheduledTime, now)) return 0;
  const runId = new Date(scheduledTime).toISOString();
  if (runId.slice(0, 7) !== new Date(now).toISOString().slice(0, 7)) return 0;
  let generated = 0;
  // Existing cron selection is at most 50 feeds × 3 articles. Skip hits without starving later URLs.
  for (const url of [...new Set(urls)].slice(0, 150)) {
    if (typeof url !== "string" || url.length > 2048 || !isValidFeedUrl(url)) continue;
    let claim: ClaimedGeneration | null = null;
    let inferenceStarted = false;
    let inferenceCompleted = false;
    try {
      if (await getAiSummaryByUrl(env.RSS_DATA, url, config.model)) continue;
      const cachedBody = await matchCfCache(await buildContentCacheKey(origin, url));
      if (!cachedBody) continue;
      const raw: unknown = await cachedBody.json();
      if (
        !raw ||
        typeof raw !== "object" ||
        !("content" in raw) ||
        typeof raw.content !== "string" ||
        raw.content.length > 500_000
      )
        continue;
      const article = prepareAiArticle(raw.content);
      if (article.body.length < 200 || article.inputCharacters < 200) continue;
      claim = await claimSummaryGeneration(env.RSS_DATA, url, config.model);
      if (!claim) continue;
      // A manual generation may have filled this while the reservation was acquired.
      if (await getAiSummaryByUrl(env.RSS_DATA, url, config.model)) {
        await finishSummaryGeneration(env.RSS_DATA, claim);
        continue;
      }
      const reservationNow = clock();
      if (
        !validSchedule(scheduledTime, reservationNow) ||
        !summaryPrecomputeConfig(env, reservationNow) ||
        !(await reserveUsage(env.RSS_DATA, config, reservationNow, runId))
      ) {
        await finishSummaryGeneration(env.RSS_DATA, claim); // No AI was started.
        break;
      }
      // R2 reservation I/O may itself cross midnight or the pricing expiry.
      // Keep the reservation, but do not start inference under an expired bound.
      const inferenceNow = clock();
      if (
        !validSchedule(scheduledTime, inferenceNow) ||
        !summaryPrecomputeConfig(env, inferenceNow)
      ) {
        await finishSummaryGeneration(env.RSS_DATA, claim);
        break;
      }
      inferenceStarted = true;
      const output: unknown = await env.AI.run(
        config.model as AiModelId,
        buildAiInputs(config.model, buildSummaryMessages(article.plain)),
      );
      inferenceCompleted = true;
      const result = getAiResponseText(output);
      if (!result) {
        await failSummaryGeneration(env.RSS_DATA, claim);
        continue;
      }
      const usage = getAiUsage(output);
      const price = PRICE_BOUNDS[config.model]!;
      if (
        usage &&
        (usage.inputTokens > price.inputContext || usage.outputTokens > AI_MAX_OUTPUT_TOKENS)
      ) {
        await failSummaryGeneration(env.RSS_DATA, claim);
        break;
      }
      await setAiSummaryByUrl(env.RSS_DATA, url, result, {
        version: 1,
        model: config.model,
        promptVersion: SUMMARY_PROMPT_VERSION,
        bodyHash: await sha256Hex(article.body),
        generatedAt: new Date().toISOString(),
        inputCharacters: article.inputCharacters,
        inputTruncated: article.inputTruncated,
        completeness: article.inputTruncated ? "truncated" : "unknown",
        usage,
      });
      await finishSummaryGeneration(env.RSS_DATA, claim);
      generated++;
    } catch (error) {
      // Never make an ambiguous post-inference cache/status write retryable.
      if (claim && inferenceStarted && !inferenceCompleted) {
        await failSummaryGeneration(env.RSS_DATA, claim).catch(() => undefined);
      } else if (claim && !inferenceStarted) {
        await finishSummaryGeneration(env.RSS_DATA, claim).catch(() => undefined);
      }
      console.warn(
        "[summary-precompute] failed closed",
        error instanceof Error ? error.message : "unknown error",
      );
      break;
    }
  }
  return generated;
}
