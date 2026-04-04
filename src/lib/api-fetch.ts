"use client";

import { getAuthReady } from "../hooks/useAuth";

/**
 * 認証チェック完了を待ってから fetch を実行するラッパー。
 * タブ復帰直後に auth チェックが完了する前に API が呼ばれて 401 になるレースコンディションを防ぐ。
 * 401 が返ってきた場合は /api/auth/me でセッション回復を試み、成功すればリトライする。
 *
 * 複数のリクエストが同時に 401 を受け取った場合、/api/auth/me の呼び出しを1回に集約する。
 */

let inflightAuthRecovery: Promise<boolean> | null = null;

async function recoverAuth(): Promise<boolean> {
  if (inflightAuthRecovery) return inflightAuthRecovery;
  inflightAuthRecovery = (async () => {
    try {
      const meRes = await fetch("/api/auth/me");
      if (!meRes.ok) return false;
      const data = (await meRes.json()) as { user: unknown };
      return data.user != null;
    } finally {
      inflightAuthRecovery = null;
    }
  })();
  return inflightAuthRecovery;
}

/** token_exp cookie から有効期限 (UNIX 秒) を読み取る */
function getTokenExpiry(): number | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)token_exp=(\d+)/);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  return isNaN(val) ? null : val;
}

/** アクセストークンの有効期限が切れている（またはあと 10 秒以内に切れる）か確認する */
function isTokenExpired(): boolean {
  const exp = getTokenExpiry();
  if (exp === null) return false; // cookie がない場合はサーバー側に任せる
  return exp - Math.floor(Date.now() / 1000) < 10;
}

/**
 * 認証付きで API エンドポイントにリクエストを送信する。
 * 認証チェック完了を待ってから fetch を実行し、401 応答時はセッション回復を試みてリトライする。
 * トークンが期限切れの場合は /api/auth/me でプロアクティブにリフレッシュしてからリクエストする。
 * これにより、複数リクエストが同時に expired token でサーバーを叩いて
 * リフレッシュトークンが race condition になるのを防ぐ。
 *
 * @param input - リクエスト先 URL
 * @param init - fetch オプション（method, body, headers 等）
 * @returns fetch の Response オブジェクト
 */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  await getAuthReady();
  // トークンが期限切れなら先にリフレッシュする（401 を避けてサーバー側の race を減らす）
  if (isTokenExpired()) {
    await recoverAuth();
  }
  const res = await fetch(input, init);
  if (res.status === 401) {
    const recovered = await recoverAuth();
    if (recovered) return fetch(input, init);
  }
  return res;
}

/**
 * `apiFetch` を呼び出し、レスポンスが ok でなければ Error を throw し、
 * ok であれば JSON をパースして指定した型で返す。
 *
 * @param input - リクエスト先 URL
 * @param init - fetch オプション（method, body, headers 等）
 * @returns パースされた JSON レスポンス
 * @throws レスポンスの HTTP ステータスが 2xx 以外の場合
 */
export async function apiFetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(input, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}
