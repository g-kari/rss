import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { serialized } from "@/lib/serialize-async";
import { evaluateSlidingWindow } from "@/lib/rate-limit-logic";

export async function checkAndUpdateCooldown(
  kv: KVNamespace,
  key: string,
  cooldownMs: number,
): Promise<NextResponse | null> {
  return serialized(key, async () => {
    const val = await kv.get(key);
    if (val !== null) {
      const ts = Number(val);
      const elapsed = Date.now() - ts;
      if (elapsed < cooldownMs) {
        const retryAfter = Math.ceil((cooldownMs - elapsed) / 1000);
        const res = apiError("Too many requests", 429, {
          code: "RATE_LIMITED",
          retryable: true,
          retryAfter,
        });
        res.headers.set("Retry-After", String(retryAfter));
        return res;
      }
    }
    await kv.put(key, String(Date.now()), {
      expirationTtl: Math.max(60, Math.ceil(cooldownMs / 1000)),
    });
    return null;
  });
}

export async function checkSlidingWindow(
  kv: KVNamespace,
  key: string,
  windowMs: number,
  maxCalls: number,
  { failClosed = false }: { failClosed?: boolean } = {},
): Promise<NextResponse | null> {
  return serialized(key, async () => {
    let stored: number[] = [];
    try {
      const raw = await kv.get(key);
      if (raw) {
        try {
          stored = JSON.parse(raw) as number[];
        } catch {
          /* corrupted KV data — reset */
        }
      }
    } catch (err) {
      if (failClosed) {
        // AI など課金が発生するエンドポイントでは KV 障害時も fail-closed にする
        console.error("[rate-limit] checkSlidingWindow: KV get failed (fail-closed)", err);
        return apiError("Too many requests", 429, {
          code: "RATE_LIMITED",
          retryable: true,
        });
      }
      // KV の読み取りエラーはレートリミットを適用しない（fail-open）
      console.error("[rate-limit] checkSlidingWindow: KV get failed", err);
      return null;
    }
    const result = evaluateSlidingWindow(Date.now(), stored, windowMs, maxCalls);
    if (!result.allowed) {
      const res = apiError("Too many requests", 429, {
        code: "RATE_LIMITED",
        retryable: true,
        retryAfter: result.retryAfterSec,
      });
      res.headers.set("Retry-After", String(result.retryAfterSec ?? 60));
      return res;
    }
    try {
      await kv.put(key, JSON.stringify(result.recent), {
        expirationTtl: Math.max(60, Math.ceil(windowMs / 1000)),
      });
    } catch (err) {
      // KV の書き込みエラーはリクエストを通す（サービス継続優先）
      console.error("[rate-limit] checkSlidingWindow: KV put failed", err);
    }
    return null;
  });
}
