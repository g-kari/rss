"use client";

import { getAuthReady, getTokenExpiry } from "../hooks/useAuth";

/**
 * 認証チェック完了を待ってから fetch を実行するラッパー。
 * タブ復帰直後に auth チェックが完了する前に API が呼ばれて 401 になるレースコンディションを防ぐ。
 * 401 が返ってきた場合は /api/auth/me でセッション回復を試み、成功すればリトライする。
 *
 * 複数のリクエストが同時に 401 を受け取った場合、/api/auth/me の呼び出しを1回に集約する。
 */

let inflightAuthRecovery: Promise<boolean> | null = null;

type ApiErrorListener = (info: { input: string; status?: number; message: string }) => void;
const errorListeners = new Set<ApiErrorListener>();

/** 通信エラー通知のグローバルリスナーを登録する。戻り値で解除可能。 */
export function onApiError(listener: ApiErrorListener): () => void {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}

function describeStatus(status?: number): string {
  if (status === 413) return "送信データが大きすぎます";
  if (status === 401 || status === 403) return "認証エラー：再ログインしてください";
  if (status === 429) return "リクエスト過多：少し待って再試行してください";
  if (status === 504) return "タイムアウト：時間をおいて再試行してください";
  if (status !== undefined && status >= 500) return "サーバーエラー（時間をおいて再試行）";
  if (status !== undefined) return `HTTP ${status}`;
  return "ネットワークエラー";
}

function notifyError(input: string, status?: number): void {
  if (errorListeners.size === 0) return;
  const message = describeStatus(status);
  for (const listener of errorListeners) {
    try {
      listener({ input, status, message });
    } catch {
      // リスナー内の例外は他のリスナーに影響させない
    }
  }
}

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
  let didProactiveRefresh = false;
  if (isTokenExpired()) {
    await recoverAuth();
    didProactiveRefresh = true;
  }
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (err) {
    notifyError(input, undefined);
    throw err;
  }
  // プロアクティブリフレッシュ済みの場合は 401 フォールバックをスキップ
  // （inflightAuthRecovery がリセットされた後に recoverAuth を二重呼び出しするのを防ぐ）
  if (res.status === 401 && !didProactiveRefresh) {
    // DBSC チャレンジが要求された場合はブラウザが自動的に署名フローを処理するため
    // ページリロードで再試行する（ブラウザが Sec-Session-Response を自動付与する）
    if (res.headers.get("Sec-Session-Challenge")) {
      window.location.reload();
      return res;
    }
    const recovered = await recoverAuth();
    if (recovered) {
      try {
        return await fetch(input, init);
      } catch (err) {
        notifyError(input, undefined);
        throw err;
      }
    }
  }
  // 4xx/5xx はグローバルリスナーに通知してトースト等で表示する。
  // 認証関連（401）と通常フロー 404 は通知対象外（読み込みリトライで大量通知になるのを防ぐ）。
  if (!res.ok && res.status !== 401 && res.status !== 404) {
    notifyError(input, res.status);
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
