# Cloud summaries and bounded precompute

## Selectable models

The existing default (`@cf/meta/llama-3.1-8b-instruct`) and existing model IDs are preserved. Two additional Workers AI models are selectable for explicit summaries/translations:

- `@cf/mistralai/mistral-small-3.1-24b-instruct`: `max_tokens`, synchronous `response` string
- `@cf/qwen/qwen3-30b-a3b-fp8`: `max_tokens`, synchronous `choices[0].message.content`

Qwen3 receives the documented `/no_think` soft instruction as the final trusted prompt suffix. This is not a guaranteed hard thinking switch. Closed thinking blocks are removed; empty, unclosed, nested, orphaned or escaped thinking traces are rejected. No reasoning/tool-call field is used as a fallback. No live inference or quality benchmark was run for this change.

Verified 2026-10-02 against primary sources:

- [Cloudflare Mistral model](https://developers.cloudflare.com/workers-ai/models/mistral-small-3.1-24b-instruct/)
- [Cloudflare Qwen3 model](https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/)
- [Official Qwen model card: thinking soft switch](https://huggingface.co/Qwen/Qwen3-30B-A3B#switching-between-thinking-and-non-thinking-mode)
- [Cloudflare Gemma4 model](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/)
- [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)

## Cache-only API

`POST /api/ai/summaries/cache` uses the normal session/CSRF wrapper. Body: `{ "urls": ["https://publisher.example/article"], "model": "@cf/google/gemma-4-26b-a4b-it" }`.

An explicit catalog model and 1–12 public HTTP(S) URLs are required; every URL is validated before any reads. URL length is limited to 2048 characters. Duplicates are removed. Response: `{ model, summaries: [{ url, result, metadata }] }`, containing hits only. Cache misses never fetch bodies, reserve usage or invoke AI. Responses are `private, no-store`. The client contract is `src/lib/ai-summary-contract.ts`.

Legacy R2 summary keys remain `ai-cache/summary/model-url-{sha256([model,url])}` and are never overwritten with envelopes. New records use `ai-cache/summary-v1/model-url-{sha256([model,url])}` and a versioned envelope with model, prompt version, SHA-256 of extracted plain body, generation time, input character count, truncation, provider usage when available, and completeness. Provider usage is informational; missing usage is `null`, never fabricated. Input remains limited to 8000 sanitized characters and 2048 generated tokens.

A publisher's full body cannot be proven available after extraction. New records therefore say `unknown`, or `truncated` when the input was definitely shortened. Old model-specific plaintext records remain usable with all provenance fields unknown/null. Unknown-model URL-only caches are never used for an explicitly selected model. Oversized/malformed/version-mismatched records and unsafe thinking output are ignored. New string cache readers transparently unwrap versioned summaries, then fall back to legacy text. An older deployment never sees a JSON envelope after rollback; new-only records become cache misses for it. Translation cache keys are unchanged.

## Production state: OFF

This change does not enable precompute or add a schedule/binding/service. The shipped `SUMMARY_PRECOMPUTE_ROLLOUT_ENABLED = false` code gate makes production cron summary inference unconditionally OFF, including if unknown retained operator variables are present. All `RSS_SUMMARY_PRECOMPUTE_*` configuration remains unset in `wrangler.toml`. Default and malformed activation values are OFF, meaning zero new summary inference. Existing article prefetch/extraction may still use its pre-existing toMarkdown fallback; this gate does not disable unrelated AI features. The existing 30-minute cron's body/OGP prefetch remains unchanged; an optional subsequent step can reuse its selected URLs and already-cached article bodies.

Enabling requires a separately reviewed code activation of the rollout gate and an operator action with an explicitly approved model and budget. It requires all of:

- `RSS_SUMMARY_PRECOMPUTE_ENABLED`: exactly `true`
- `RSS_SUMMARY_PRECOMPUTE_MODEL`: a freshly priced eligible model, explicitly selected
- `RSS_SUMMARY_PRECOMPUTE_RUN_USD`, `RSS_SUMMARY_PRECOMPUTE_DAY_USD`, `RSS_SUMMARY_PRECOMPUTE_MONTH_USD`: positive decimal USD limits, at most six fractional digits, ordered run ≤ day ≤ month
- `RSS_SUMMARY_PRECOMPUTE_MAX_ARTICLES`: explicit integer 1–12

Do not populate these variables merely to test this feature. No paid job, credentials, additional permissions or infrastructure are needed to leave it OFF. Since `keep_vars` preserves operator-managed variables, inspect effective deployed variables before any future gate activation. The current fixed code gate independently guarantees that this new scheduled summary step is OFF.

The price snapshot is deliberately valid only from 2026-10-02 through 2026-10-31 UTC. Revalidate provider contracts, prices and bounds before extending it. Unknown models or stale/missing estimates fail closed.

## Costs: estimates versus reservations

Current published USD pricing per million input/output tokens:

| Model                |   Input | Output | Conservative reservation per call |
| -------------------- | ------: | -----: | --------------------------------: |
| Gemma4 26B A4B       |   $0.10 |  $0.30 |                         $0.026215 |
| Mistral Small3.1 24B |  $0.351 | $0.555 |                         $0.046065 |
| Qwen3 30B A3B FP8    | $0.0509 | $0.335 |                         $0.002354 |

The reservation uses the **entire documented input context window** (256000 / 128000 / 32768 tokens respectively), plus the 2048-token output allowance, with no cached-input discounts. This is intentionally much larger than an ordinary 8000-character article summary. A character/token heuristic is not treated as a proven upper bound. For example, an assumed 4000-input/256-output-token Gemma4 call costs about $0.000477; its reservation is approximately 55 times larger. This conservatism substantially reduces useful throughput under a small configured budget. A $1 monthly reservation limit permits at most 38 / 21 / 424 reservations for the three models, before failures or daily/run limits.

These are application usage reservations, **not a guaranteed Cloudflare invoice hard cap**. Provider prices/account plan, other AI features/manual calls, provider behavior, tax, Workers/R2 operations and existing body prefetch costs are outside this ledger. The published rate snapshot can change. Billing reconciliation and any account-level spend controls must be evaluated separately before activation.

## Accounting and duplicate-generation safety

- One strongly consistent R2 monthly ledger, shared across precompute models, records UTC day/run reservations in integer micro-USD before inference. Run IDs come from the trusted scheduled timestamp; a delayed event crossing a UTC month boundary is skipped to prevent a single run bypassing its limit in two monthly ledgers. Null conditional writes, malformed ledgers or storage errors fail closed. Failed/ambiguous jobs are not refunded.
- The candidate scan is bounded to the existing maximum 150 prefetched URLs. Cache hits and known unavailable generation claims are skipped without spending reservations, so a cached/failed leading URL does not starve later articles. Actual reserved calls are bounded by the configured run count and run/day/month limits.
- Precompute reads only existing body-cache hits. Missing, malformed, oversized, empty or fewer-than-200-character effective body inputs are skipped. It does not re-extract or crawl a missing body.
- Explicit manual summaries and precompute share a model/URL generation claim using R2 conditional create/ETag compare-and-swap, following the project's existing conditional-put pattern. [R2 documents strong consistency and null returns for unmet put preconditions](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
- An active pending claim has no automatic timeout takeover: a slow original call must not overlap a second generation. After a terminal AI rejection or invalid output, a CAS marks it failed with a five-minute cooldown. Cron never automatically retries failed claims; a later explicit manual request may claim one after the cooldown. Manual cooldown responses include `Retry-After` and retry eligibility.
- An ambiguous post-inference R2 cache/status write retains pending state and requests operator inspection. Cache hits remain usable even if final status storage failed. Reservations remain counted. This deliberately favors duplicate-call safety over automatic availability after a crashed process.

## Recovery and rollout checks

Before an operator recovers a pending claim, pause precompute, confirm no manual/scheduled invocation can still be running, inspect provider/Worker logs and the model-specific cache, and reconcile the retained reservation. Do not delete a live claim, expire it by wall-clock alone, erase the budget ledger or refund a possibly billed call. If completion cannot be established, keep the hold. Recovery should conditionally update the inspected claim's exact ETag after confirming the old invocation ended; no public reset endpoint is provided.

Before enabling, check current eligible pricing/token contracts and effective deployment variables, explicitly choose a model/run/day/month budget, validate with mocks, then observe/reconcile a small approved run. Disable immediately on accounting anomalies. Turning OFF prevents new summary work; drain already-running invocations before assuming activity stopped. Reverting code does not cancel a provider request already in flight.

Regression coverage includes provider shapes/parameters, thinking rejection, authentication and URL/batch validation, zero-AI cache miss/OFF/unset budget, R2 CAS concurrency/failure, model isolation, short/unavailable bodies, truncation metadata, legacy compatibility, cooldown/operator recovery and cached-candidate starvation. Tests use mocks only.
