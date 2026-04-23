import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";

/**
 * 同一アイソレート内の並行リクエストを管理する Set。
 * inFlight に key が存在する間は後続リクエストを即時 429 で返すことで TOCTOU 競合を防ぐ。
 * 異なるアイソレート間の競合はこの仕組みでは防げないが、低頻度操作では許容可能。
 */
const inFlight = new Set<string>();

/**
 * KV ベースのクールダウンを確認・更新する。
 * クールダウン中なら 429 NextResponse を返す。クールダウン外なら null を返し、タイムスタンプを更新する。
 * KV の expirationTtl を利用してクールダウン期間後にエントリを自動削除する。
 *
 * 同一アイソレート内の TOCTOU 競合は inFlight Set でガードする。
 */
export async function checkAndUpdateCooldown(
  kv: KVNamespace,
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
    // KV expirationTtl の最小値は 60 秒のため clamp する
    await kv.put(key, String(Date.now()), {
      expirationTtl: Math.max(60, Math.ceil(cooldownMs / 1000)),
    });
    return null;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * KV ベースのスライディングウィンドウ レートリミット。
 * windowMs 内の呼び出し回数が maxCalls を超えると 429 を返す。
 * 単純なクールダウンと異なり、バーストを許容しつつ持続的な乱用を防ぐ。
 * KV の expirationTtl でウィンドウ期間後にエントリを自動削除する。
 */
export async function checkSlidingWindow(
  kv: KVNamespace,
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
    const raw = await kv.get(key);
    const calls: number[] = raw ? (JSON.parse(raw) as number[]) : [];
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
    // KV expirationTtl の最小値は 60 秒のため clamp する
    await kv.put(key, JSON.stringify(recent), {
      expirationTtl: Math.max(60, Math.ceil(windowMs / 1000)),
    });
    return null;
  } finally {
    inFlight.delete(key);
  }
}
