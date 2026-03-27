"use client";

import { useState, useEffect, useRef } from "react";
import type { UserProfile } from "../types";

interface AuthState {
  user: UserProfile | null | undefined; // undefined = ローディング中
  betaRestricted: boolean;
  sessionExpired: boolean; // ログイン済みだったセッションが期限切れになった
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
      return;
    }

    let mounted = true;
    let inFlight = false;

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
      } catch {
        // ネットワークエラーは現在の認証状態を維持する（不要なログアウトを防ぐ）
        if (mounted) setUser((prev) => (prev === undefined ? null : prev));
      } finally {
        inFlight = false;
      }
    }

    void checkAuth();

    // タブがフォアグラウンドに戻ったときに再チェック
    // (バックグラウンド中に access_token が期限切れになるケースへの対応)
    function onVisibilityChange() {
      if (document.visibilityState === "visible") void checkAuth();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    // 10分ごとに再チェック (access_token の有効期限 15分より短いサイクルで先回りリフレッシュ)
    const timer = setInterval(checkAuth, 10 * 60 * 1000);

    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(timer);
    };
  }, []);

  return { user, betaRestricted, sessionExpired };
}
