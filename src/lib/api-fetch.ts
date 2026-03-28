"use client";

import { getAuthReady } from "../hooks/useAuth";

/**
 * 認証チェック完了を待ってから fetch を実行するラッパー。
 * タブ復帰直後に auth チェックが完了する前に API が呼ばれて 401 になるレースコンディションを防ぐ。
 * 401 が返ってきた場合は /api/auth/me でセッション回復を試み、成功すればリトライする。
 */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  await getAuthReady();
  const res = await fetch(input, init);
  if (res.status === 401) {
    const meRes = await fetch("/api/auth/me");
    if (meRes.ok) {
      const data = (await meRes.json()) as { user: unknown };
      if (data.user) return fetch(input, init);
    }
  }
  return res;
}

/** res.ok でなければ Error を throw し、ok なら JSON をパースして返す */
export async function apiFetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(input, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}
