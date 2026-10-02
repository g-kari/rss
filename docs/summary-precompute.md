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

## Approved production rollout

The separately reviewed activation enables the existing 30-minute cron's downstream summary step for **Gemma 4 only**, after explicit approval of at most 100 articles per UTC day and USD 1 monthly conservative application reservations. No schedule, credential, permission, service or binding is added. The selected UI model is independent; immersive reading still only reads cached summaries for its explicitly selected model and never generates on a miss.

The explicit shipped configuration is:

- `RSS_SUMMARY_PRECOMPUTE_ENABLED=true`
- `RSS_SUMMARY_PRECOMPUTE_MODEL=@cf/google/gemma-4-26b-a4b-it`
- `RSS_SUMMARY_PRECOMPUTE_RUN_USD=0.131075`
- `RSS_SUMMARY_PRECOMPUTE_DAY_USD=1`
- `RSS_SUMMARY_PRECOMPUTE_MONTH_USD=1`
- `RSS_SUMMARY_PRECOMPUTE_MAX_ARTICLES=5`
- `RSS_SUMMARY_PRECOMPUTE_MAX_DAILY_ARTICLES=100`
- `RSS_SUMMARY_PRECOMPUTE_CONCURRENCY=1`

The production wrapper rejects any configuration that broadens the approved model, five-per-run, 100-per-day, one-concurrent-invocation or USD 1 monthly envelope. Missing, malformed, disabled or unpriced configuration stops before storage or AI. Limits can be reduced or disabled. The daily count includes failed reservations and is derived from the ledger's run counters, independently of dollar limits. Run/day/month decimal USD values must remain positive and ordered run ≤ day ≤ month.

**USD 1 allows at most 38 reservations per month**, not 100 successful articles each day. Five reservations cost USD 0.131075, and 38 cost USD 0.996170. Failures remain reserved, so successful articles may be fewer. The USD 1 daily limit is redundant under the tighter monthly allowance but stays explicit. The entire context bound is intentionally conservative; it is not a provider invoice cap.

A global R2 CAS lease serializes scheduled invocations, including overlapping/replayed cron deliveries. Each invocation still processes provider calls sequentially. Manual calls for unrelated articles are outside this scheduled concurrency limit and reservation budget; manual and scheduled generation of the same model/URL share the existing duplicate-generation claim.

Cloudflare settings were inspected before activation: the existing `rss-reader` script had no summary precompute variables, and the R2 budget/global lease prefixes were empty. With `keep_vars`, explicit deployment values override retained values, and the effective deployed variables must be verified after deployment. Existing article prefetch/extraction may use its pre-existing toMarkdown fallback; these limits apply to the new summary step.

The freshly checked primary Gemma 4 model/pricing pages confirm 256000 context tokens, USD 0.10/M input and USD 0.30/M output on 2026-10-02. The snapshot remains valid only through 2026-10-31 UTC and **automatically stops new work on 2026-11-01** unless prices/contracts are revalidated in another reviewed change. The clock and UTC day are checked immediately before every reservation; delayed events crossing midnight are skipped.

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

- One strongly consistent R2 monthly ledger, shared across precompute models, records UTC day/run reservations in integer micro-USD before inference. Run IDs come from the trusted scheduled timestamp; delayed events crossing a UTC day boundary are skipped. Per-day run sums must match daily money totals, making article counts auditable without changing the legacy version-1 ledger schema. Null conditional writes, malformed ledgers or storage errors fail closed. Failed/ambiguous jobs are not refunded.
- The candidate scan is bounded to the existing maximum 150 prefetched URLs. Cache hits and known unavailable generation claims are skipped without spending reservations, so a cached/failed leading URL does not starve later articles. Actual reserved calls are bounded by the configured run and daily article counts and run/day/month money limits.
- Precompute reads only existing body-cache hits. Missing, malformed, oversized, empty or fewer-than-200-character effective body inputs are skipped. It does not re-extract or crawl a missing body.
- Explicit manual summaries and precompute share a model/URL generation claim using R2 conditional create/ETag compare-and-swap, following the project's existing conditional-put pattern. [R2 documents strong consistency and null returns for unmet put preconditions](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
- An active pending claim has no automatic timeout takeover: a slow original call must not overlap a second generation. After a terminal AI rejection or invalid output, a CAS marks it failed with a five-minute cooldown. Cron never automatically retries failed claims; a later explicit manual request may claim one after the cooldown. Manual cooldown responses include `Retry-After` and retry eligibility.
- An ambiguous post-inference R2 cache/status write retains pending state and requests operator inspection. Cache hits remain usable even if final status storage failed. Reservations remain counted. This deliberately favors duplicate-call safety over automatic availability after a crashed process.

## Recovery and rollout checks

The global concurrency object is `ai-cache/summary-precompute/active.json`. Normal settled invocations conditionally transition it to `finished`; a terminated invocation or ambiguous release retains `pending`. It has no wall-clock takeover. Later scheduled runs log an active-invocation/operator hold and do no summary inference. This can pause all scheduled summaries until inspection and recovery; it must not be reported as normal completion. The completed-run log records the trusted run ID and generated count, without article content.

Before an operator recovers a pending article claim or global invocation lease, set `RSS_SUMMARY_PRECOMPUTE_ENABLED=false`, verify the disabled deployment, and pause precompute, confirm no manual/scheduled invocation can still be running, inspect provider/Worker logs and the model-specific cache, and reconcile the retained reservation. Do not delete a live claim, expire it by wall-clock alone, erase the budget ledger or refund a possibly billed call. If completion cannot be established, keep the hold. The global lease may be conditionally marked `finished` only after confirming the original invocation and all provider promises ended; preserve its owner/run ID and require the exact inspected ETag. Recovery should conditionally update the inspected claim's exact ETag after confirming the old invocation ended; no public reset endpoint is provided.

Hold publication on a failed exact-head production build, affected tests, type/lint checks or independent review. After merge, verify the deployment version and all eight effective summary variables, then observe the next natural cron and reconcile the lease, ledger and safe summary provenance. Do not trigger extra manual AI calls for verification. Disable immediately on accounting anomalies. Turning OFF prevents new summary work; drain already-running invocations before assuming activity stopped. Reverting code does not cancel a provider request already in flight.

Regression coverage includes provider shapes/parameters, thinking rejection, authentication and URL/batch validation, zero-AI cache miss/OFF/unset budget, global overlapping-cron R2 CAS concurrency/release failure, 5/run, 100/day and 38/month boundaries, model isolation, short/unavailable bodies, truncation metadata, legacy compatibility, cooldown/operator recovery and cached-candidate starvation. Tests use mocks only.
