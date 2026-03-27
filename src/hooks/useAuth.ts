"use client";

import { useState, useEffect, useRef } from "react";
import type { UserProfile } from "../types";

interface AuthState {
  user: UserProfile | null | undefined; // undefined = ローディング中
  betaRestricted: boolean;
  sessionExpired: boolean; // ログイン済みだったセッションが期限切れになった
}

/** token_exp cookie から有効期限 (UNIX 秒) を読み取る */
function getTokenExpiry(): number | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)token_exp=(\d+)/);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  return isNaN(val) ? null : val;
}

// --- authReady: タブ復帰後の認証チェックが完了するまで他の API 呼び出しを待機させる ---
let authReadyResolve: (() => void) | null = null;
let authReadyPromise: Promise<void> = Promise.resolve();

function resetAuthReady(): void {
  authReadyPromise = new Promise<void>((resolve) => {
    authReadyResolve = resolve;
  });
}

function resolveAuthReady(): void {
  authReadyResolve?.();
  authReadyResolve = null;
}

/** 認証チェック完了まで待機する Promise を返す（他の API 呼び出しで使用） */
export function getAuthReady(): Promise<void> {
  return authReadyPromise;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<UserProfile | null | undefined>(undefined);
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
      try {
        const r = await fetch("/api/auth/me");
        const { user: u, betaRestricted: br } = (await r.json()) as {
          user: UserProfile | null;
          betaRestricted?: boolean;
        };
        if (!mounted) return;
        if (br) setBetaRestricted(true);
        // 以前は認証済みで、今回 null が返った場合はセッション期限切れ
        if (wasAuthenticatedRef.current && !u) {
          setSessionExpired(true);
        }
        if (u) {
          wasAuthenticatedRef.current = true;
          setSessionExpired(false);
        }
        setUser(u ?? null);
        scheduleNextRefresh();
      } catch {
        // ネットワークエラーは現在の認証状態を維持する（不要なログアウトを防ぐ）
        if (mounted) setUser((prev) => (prev === undefined ? null : prev));
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
