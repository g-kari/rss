"use client";

import { useState, useEffect, useRef } from "react";
import type { UserProfile } from "../types";
import {
  STORAGE_KEYS,
  storageGet,
  storageSet,
  storageRemove,
  loadJsonObject,
} from "../lib/storage";
import { devError } from "../lib/dev-log";

// #1146 Phase 4: corrupted localStorage 由来の primitive / 型不正値で property access が
// TypeError → ErrorBoundary 発火するのを防ぐ。null も valid (キャッシュ無効 + 認証中の
// loading 状態を表現する nullable union 受け)。
const isUserProfileOrNull = (v: unknown): v is UserProfile | null => {
  if (v === null) return true;
  if (typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    typeof p.sub === "string" &&
    typeof p.email === "string" &&
    typeof p.name === "string" &&
    (p.picture === null || typeof p.picture === "string")
  );
};

/**
 * `useAuth` フックの戻り値型。
 * 認証状態・ベータ制限・セッション期限切れフラグを保持する。
 */
interface AuthState {
  user: UserProfile | null | undefined; // undefined = ローディング中
  betaRestricted: boolean;
  sessionExpired: boolean; // ログイン済みだったセッションが期限切れになった
}

/** token_exp cookie から有効期限 (UNIX 秒) を読み取る */
export function getTokenExpiry(): number | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)token_exp=(\d+)/);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  return isNaN(val) ? null : val;
}

// --- authReady: タブ復帰後の認証チェックが完了するまで他の API 呼び出しを待機させる ---
let authReadyResolve: (() => void) | null = null;
let authReadyPromise: Promise<void> = Promise.resolve();

/**
 * authReady を pending 状態にリセットする。
 * タブ復帰時や初回チェック前に呼び出し、他の API 呼び出しを認証完了まで待機させる。
 */
function resetAuthReady(): void {
  authReadyPromise = new Promise<void>((resolve) => {
    authReadyResolve = resolve;
  });
}

/**
 * authReady を解決して待機中の API 呼び出しをアンブロックする。
 * 認証チェック完了時・アンマウント時に呼ぶ。
 */
function resolveAuthReady(): void {
  authReadyResolve?.();
  authReadyResolve = null;
}

/** 認証チェック完了まで待機する Promise を返す（他の API 呼び出しで使用） */
export function getAuthReady(): Promise<void> {
  return authReadyPromise;
}

/**
 * 認証状態を管理するフック。
 * /api/auth/me を定期的に呼び出してセッションを検証し、
 * タブ復帰時・トークン期限前の自動リフレッシュも行う。
 *
 * @returns user - ログイン中のユーザー情報（`undefined` はローディング中、`null` は未ログイン）
 * @returns betaRestricted - ベータ制限によりアクセスが拒否されているか
 * @returns sessionExpired - 認証済みだったセッションが期限切れになったか
 */
export function useAuth(): AuthState {
  const [user, setUser] = useState<UserProfile | null | undefined>(() => {
    // オフライン時のために localStorage からキャッシュを復元する（初回ロード時のちらつき防止も兼ねる）
    const raw = storageGet(STORAGE_KEYS.CACHED_USER);
    return raw
      ? loadJsonObject<UserProfile | null>(STORAGE_KEYS.CACHED_USER, null, isUserProfileOrNull)
      : undefined;
  });
  const [betaRestricted, setBetaRestricted] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const wasAuthenticatedRef = useRef(false);

  useEffect(() => {
    // URL パラメーターでベータ制限リダイレクトを検出
    if (new URLSearchParams(window.location.search).get("beta") === "denied") {
      setBetaRestricted(true);
      setUser(null);
      resolveAuthReady();
      return;
    }

    let mounted = true;
    let inFlight = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let loginRetryDone = false; // ?login=1 リトライは一度だけ
    let sessionRecoveryAttempts = 0; // 「認証済みだったが user=null」の猶予リトライ回数
    const SESSION_RECOVERY_MAX_ATTEMPTS = 2; // 最大 2 回（800ms → 2400ms）

    /** token_exp を読み、2分前にリフレッシュをスケジュールする（最低30秒） */
    function scheduleNextRefresh(): void {
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      const exp = getTokenExpiry();
      if (exp === null) {
        // token_exp がない場合は固定 10分インターバル
        refreshTimer = setTimeout(() => void checkAuth(), 10 * 60 * 1000);
        return;
      }
      const nowSec = Math.floor(Date.now() / 1000);
      const delayMs = Math.max((exp - nowSec - 120) * 1000, 30 * 1000);
      refreshTimer = setTimeout(() => void checkAuth(), delayMs);
    }

    async function checkAuth() {
      if (inFlight) return;
      inFlight = true;
      // callback リダイレクト直後かどうかを判定（R2 整合性ラグ対策の一度だけリトライ用）
      const isFirstPostLogin =
        !loginRetryDone && new URLSearchParams(window.location.search).get("login") === "1";
      try {
        const r = await fetch("/api/auth/me");
        // 503 + { transient: true } は上流認可サーバーの一時的障害。
        // 429 はレートリミット（SW のバックグラウンドリクエストが先に叩いた等）。
        // いずれもログアウト扱いにせず、既存の認証状態を維持して次回リフレッシュを待つ。
        if (r.status === 503 || r.status === 429) {
          if (mounted) scheduleNextRefresh();
          return;
        }
        const { user: u, betaRestricted: br } = (await r.json()) as {
          user: UserProfile | null;
          betaRestricted?: boolean;
          transient?: boolean;
        };
        if (!mounted) return;
        if (br) setBetaRestricted(true);

        // ログイン直後に user=null → R2 結果整合性ラグの可能性。一度だけリトライ（LP を表示しない）
        if (isFirstPostLogin && !u) {
          loginRetryDone = true;
          setTimeout(() => {
            if (mounted) void checkAuth();
          }, 600);
          return; // setUser は呼ばずスピナー状態を維持
        }

        // 認証済みだったが null が返った → サーバー側 refresh の transient 失敗や R2 一時障害の
        // 可能性。即座にログイン画面へ落とさず、指数バックオフで猶予リトライする
        // （既存の user / undefined 状態のまま setUser は呼ばない）。
        if (
          wasAuthenticatedRef.current &&
          !u &&
          sessionRecoveryAttempts < SESSION_RECOVERY_MAX_ATTEMPTS
        ) {
          sessionRecoveryAttempts += 1;
          const delay = 800 * sessionRecoveryAttempts; // 800ms, 1600ms
          setTimeout(() => {
            if (mounted) void checkAuth();
          }, delay);
          return;
        }

        // 以前は認証済みで、今回 null が返った場合はセッション期限切れ
        // → user を null にせずキャッシュされたユーザー情報を維持する
        //   （現在の UI を保持したままモーダルで再ログインを促す）
        if (wasAuthenticatedRef.current && !u) {
          setSessionExpired(true);
          scheduleNextRefresh();
          return;
        }
        if (u) {
          wasAuthenticatedRef.current = true;
          sessionRecoveryAttempts = 0; // 成功時はカウンタをリセット
          setSessionExpired(false);
          // オフライン時に使えるようユーザー情報を localStorage にキャッシュ
          storageSet(STORAGE_KEYS.CACHED_USER, JSON.stringify(u));
          // ログイン完了後に ?login=1 をクリア
          if (new URLSearchParams(window.location.search).get("login") === "1") {
            const url = new URL(window.location.href);
            url.searchParams.delete("login");
            window.history.replaceState({}, "", url);
          }
        } else {
          // 初回訪問の未ログイン状態 — キャッシュをクリア
          storageRemove(STORAGE_KEYS.CACHED_USER);
        }
        // サーバー応答がキャッシュ済みのユーザーと同一内容の場合はオブジェクト参照を維持する。
        // 参照が変わると useFeedGroups/useCollections の useEffect が再実行されて
        // 進行中の fetch が AbortController でキャンセルされてしまうため。
        setUser((prev) => {
          const next = u ?? null;
          if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
          return next;
        });
        scheduleNextRefresh();
      } catch (err) {
        devError("[useAuth] checkAuth failed", err);
        if (mounted) {
          if (isFirstPostLogin) {
            // ログイン直後のネットワークエラーはリトライ（LP に飛ばさない）
            loginRetryDone = true;
            setTimeout(() => {
              if (mounted) void checkAuth();
            }, 600);
            return;
          }
          // ネットワークエラーは現在の認証状態を維持する（不要なログアウトを防ぐ）
          setUser((prev) => (prev === undefined ? null : prev));
        }
        scheduleNextRefresh();
      } finally {
        inFlight = false;
        resolveAuthReady();
      }
    }

    // 初回チェック前は authReady を pending 状態にする
    resetAuthReady();
    void checkAuth();

    // タブがフォアグラウンドに戻ったときに再チェック
    // (バックグラウンド中に access_token が期限切れになるケースへの対応)
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        // 再チェック開始前に authReady をリセットして他の API を待機させる
        resetAuthReady();
        void checkAuth();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      // アンマウント時は authReady を解決して待機中の呼び出しを unblock する
      resolveAuthReady();
    };
  }, []);

  return { user, betaRestricted, sessionExpired };
}
