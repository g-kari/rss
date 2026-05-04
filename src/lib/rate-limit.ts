import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { serialized } from "@/lib/serialize-async";

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
): Promise<NextResponse | null> {
  return serialized(key, async () => {
    const now = Date.now();
    const raw = await kv.get(key);
    let calls: number[] = [];
    if (raw) {
      try {
        calls = JSON.parse(raw) as number[];
      } catch {
        /* corrupted KV data — reset */
      }
    }
    const recent = calls.filter((t) => now - t < windowMs);
    if (recent.length >= maxCalls) {
      const oldest = Math.min(...recent);
      const retryAfter = Math.ceil((windowMs - (now - oldest)) / 1000);
      const res = apiError("Too many requests", 429, {
        code: "RATE_LIMITED",
        retryable: true,
        retryAfter,
      });
      res.headers.set("Retry-After", String(retryAfter));
      return res;
    }
    recent.push(now);
    await kv.put(key, JSON.stringify(recent), {
      expirationTtl: Math.max(60, Math.ceil(windowMs / 1000)),
    });
    return null;
  });
}
