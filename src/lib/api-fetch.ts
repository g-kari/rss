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
