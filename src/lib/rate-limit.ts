import { NextResponse } from "next/server";
import { r2Get, r2Put } from "@/lib/r2";
import { apiError } from "@/lib/api-error";

/**
 * 同一アイソレート内の並行 checkAndUpdateCooldown 呼び出しを管理する Set。
 * inFlight に key が存在する間は後続リクエストを即時 429 で返すことで TOCTOU 競合を防ぐ。
 * 異なるアイソレート間の競合はこの仕組みでは防げないが、低頻度操作では許容可能。
 */
const inFlight = new Set<string>();

/**
 * R2 ベースのクールダウンを確認・更新する。
 * クールダウン中なら 429 NextResponse を返す。クールダウン外なら null を返し、タイムスタンプを更新する。
 *
 * 同一アイソレート内の TOCTOU 競合は inFlight Set でガードする。
 */
export async function checkAndUpdateCooldown(
  bucket: R2Bucket,
  key: string,
  cooldownMs: number,
): Promise<NextResponse | null> {
  if (inFlight.has(key)) {
    const retryAfter = Math.ceil(cooldownMs / 1000);
    const res = apiError("Too many requests", 429, {
      code: "RATE_LIMITED",
      retryable: true,
      retryAfter,
    });
    res.headers.set("Retry-After", String(retryAfter));
    return res;
  }
  inFlight.add(key);
  try {
    const { ts } = await r2Get<{ ts: number }>(bucket, key, { ts: 0 });
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
    await r2Put(bucket, key, { ts: Date.now() });
    return null;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * R2 ベースのスライディングウィンドウ レートリミット。
 * windowMs 内の呼び出し回数が maxCalls を超えると 429 を返す。
 * 単純なクールダウンと異なり、バーストを許容しつつ持続的な乱用を防ぐ。
 */
export async function checkSlidingWindow(
  bucket: R2Bucket,
  key: string,
  windowMs: number,
  maxCalls: number,
): Promise<NextResponse | null> {
  if (inFlight.has(key)) {
    const retryAfter = Math.ceil(windowMs / 1000);
    const res = apiError("Too many requests", 429, {
      code: "RATE_LIMITED",
      retryable: true,
      retryAfter,
    });
    res.headers.set("Retry-After", String(retryAfter));
    return res;
  }
  inFlight.add(key);
  try {
    const now = Date.now();
    const data = await r2Get<{ calls?: number[] }>(bucket, key, { calls: [] });
    const calls = Array.isArray(data.calls) ? data.calls : [];
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
    await r2Put(bucket, key, { calls: recent });
    return null;
  } finally {
    inFlight.delete(key);
  }
}
