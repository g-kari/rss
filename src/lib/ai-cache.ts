/**
 * AI 結果の R2 キャッシュヘルパー
 *
 * キー: `ai-cache/{type}/model-url-{sha256([model, url])}`
 * model 省略の既存 caller だけ `ai-cache/{type}/url-{sha256(url)}` を使用する。
 * 旧キャッシュの生成モデルは不明のため、モデル指定時はフォールバックしない。
 *
 * #698 セキュリティ対応: 旧 `id-{articleId}` 形式は cross-user poisoning を
 * 招くため廃止。url から決定論的に sha256 ハッシュを取り、攻撃者が偽 url で
 * 別ユーザー記事の cache を上書きできないようにした。
 *
 * URL hash ベースなら攻撃者は自身の cache key しか書けない (攻撃者が制御する
 * url の hash で必ず分離される)。
 */
import { sha256Hex } from "./r2";
import { stripAiThinking } from "./ai-output";
import { isWorkersAiModelId } from "./ai-models";
import type { SummaryMetadata } from "./ai-summary-contract";

export type AiCacheType = "summary" | "translation";

const MAX_CACHE_BYTES = 128 * 1024;

function legacyMetadata(model: SummaryMetadata["model"]): SummaryMetadata {
  return {
    version: 1,
    model,
    promptVersion: null,
    bodyHash: null,
    generatedAt: null,
    inputCharacters: null,
    inputTruncated: null,
    completeness: "unknown",
    usage: null,
  };
}

function isSummaryMetadata(value: unknown, model: string): value is SummaryMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  const usage = data.usage as Record<string, unknown> | null;
  return (
    data.version === 1 &&
    data.model === model &&
    isWorkersAiModelId(data.model) &&
    typeof data.promptVersion === "string" &&
    typeof data.bodyHash === "string" &&
    /^[a-f0-9]{64}$/.test(data.bodyHash) &&
    typeof data.generatedAt === "string" &&
    Number.isFinite(Date.parse(data.generatedAt)) &&
    typeof data.inputCharacters === "number" &&
    Number.isSafeInteger(data.inputCharacters) &&
    data.inputCharacters >= 0 &&
    data.inputCharacters <= 8000 &&
    typeof data.inputTruncated === "boolean" &&
    data.completeness === (data.inputTruncated ? "truncated" : "unknown") &&
    (usage === null ||
      (typeof usage === "object" &&
        !Array.isArray(usage) &&
        typeof usage.inputTokens === "number" &&
        Number.isSafeInteger(usage.inputTokens) &&
        usage.inputTokens >= 0 &&
        typeof usage.outputTokens === "number" &&
        Number.isSafeInteger(usage.outputTokens) &&
        usage.outputTokens >= 0))
  );
}

/** Model-specific legacy text is readable, with deliberately unknown provenance. */
export async function getAiSummaryByUrl(
  bucket: R2Bucket,
  url: string,
  model: SummaryMetadata["model"],
): Promise<{ result: string; metadata: SummaryMetadata } | null> {
  const legacyKey = await buildKey(url, "summary", model);
  const versioned = await bucket.get(
    legacyKey.replace("ai-cache/summary/", "ai-cache/summary-v1/"),
  );
  const obj = versioned ?? (await bucket.get(legacyKey));
  if (!obj || obj.size > MAX_CACHE_BYTES) return null;
  const raw = await obj.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_CACHE_BYTES) return null;
  let result = raw;
  let metadata = legacyMetadata(model);
  if (versioned || raw.trimStart().startsWith("{")) {
    try {
      const envelope: unknown = JSON.parse(raw);
      if (
        envelope &&
        typeof envelope === "object" &&
        "kind" in envelope &&
        envelope.kind === "article-summary"
      ) {
        const entry = envelope as Record<string, unknown>;
        if (
          entry.version !== 1 ||
          typeof entry.result !== "string" ||
          !isSummaryMetadata(entry.metadata, model)
        )
          return null;
        result = entry.result;
        metadata = entry.metadata;
      } else if (versioned) {
        return null;
      }
    } catch {
      return null;
    }
  }
  const safe = stripAiThinking(result);
  return safe ? { result: safe, metadata } : null;
}

async function buildKey(url: string, type: AiCacheType, model?: string): Promise<string> {
  if (model !== undefined) {
    const hash = await sha256Hex(JSON.stringify([model, url]));
    return `ai-cache/${type}/model-url-${hash}`;
  }
  const hash = await sha256Hex(url);
  return `ai-cache/${type}/url-${hash}`;
}

/** url + model ベースのキャッシュ取得（model 省略時は旧キー） */
export async function getAiCacheByUrl(
  bucket: R2Bucket,
  url: string,
  type: AiCacheType = "summary",
  model?: string,
): Promise<string | null> {
  if (type === "summary" && isWorkersAiModelId(model)) {
    return (await getAiSummaryByUrl(bucket, url, model))?.result ?? null;
  }
  const obj = await bucket.get(await buildKey(url, type, model));
  if (!obj || obj.size > MAX_CACHE_BYTES) return null;
  return stripAiThinking(await obj.text()) || null;
}

/** url + model ベースのキャッシュ保存（model 省略時は旧キー） */
export async function setAiCacheByUrl(
  bucket: R2Bucket,
  url: string,
  result: string,
  type: AiCacheType = "summary",
  model?: string,
): Promise<void> {
  const safe = stripAiThinking(result);
  if (!safe) return;
  await bucket.put(await buildKey(url, type, model), safe, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
  });
}

export async function setAiSummaryByUrl(
  bucket: R2Bucket,
  url: string,
  result: string,
  metadata: SummaryMetadata,
): Promise<void> {
  const safe = stripAiThinking(result);
  if (!safe || !isSummaryMetadata(metadata, metadata.model))
    throw new Error("Invalid summary cache entry");
  const envelope = JSON.stringify({ kind: "article-summary", version: 1, result: safe, metadata });
  if (new TextEncoder().encode(envelope).byteLength > MAX_CACHE_BYTES)
    throw new Error("Summary cache entry too large");
  await bucket.put(
    (await buildKey(url, "summary", metadata.model)).replace(
      "ai-cache/summary/",
      "ai-cache/summary-v1/",
    ),
    envelope,
    {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    },
  );
}
