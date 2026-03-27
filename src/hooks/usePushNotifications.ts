"use client";

import { useState, useEffect, useCallback } from "react";
import type { UserProfile } from "../types";
import { apiFetch } from "../lib/api-fetch";

export interface PushNotificationState {
  /** ブラウザが Web Push をサポートしているか */
  supported: boolean;
  /** 現在のブラウザで購読中か */
  subscribed: boolean;
  /** 購読操作中か */
  loading: boolean;
  /** 最後に発生したエラーメッセージ (null = エラーなし) */
  error: string | null;
  /** 購読/解除をトグルする */
  toggle: () => Promise<void>;
}

export function usePushNotifications(user: UserProfile | null | undefined): PushNotificationState {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // マウント時: ブラウザのサポート確認と現在の購読状態を取得
  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    setSupported(true);

    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(sub !== null))
      .catch(() => {});
  }, [user]);

  const toggle = useCallback(async () => {
    if (!supported || loading) return;
    setLoading(true);
    setError(null);

    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();

      if (existing) {
        // 解除
        await existing.unsubscribe();
        await apiFetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        });
        setSubscribed(false);
      } else {
        // 購読
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setError("通知の許可が必要です");
          return;
        }

        // VAPID 公開鍵を取得
        const keyRes = await apiFetch("/api/push/vapid-key");
        if (!keyRes.ok) {
          setError("プッシュ通知が設定されていません (503)");
          return;
        }
        const { publicKey } = (await keyRes.json()) as { publicKey: string };

        // base64url → Uint8Array に変換
        const appServerKey = urlBase64ToUint8Array(publicKey);
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey,
        });

        // サーバーに購読情報を保存。失敗した場合はブラウザ側の購読もロールバックする
        const subRes = await apiFetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        });
        if (!subRes.ok) {
          await sub.unsubscribe();
          setError("購読の保存に失敗しました");
          return;
        }
        setSubscribed(true);
      }
    } catch (err) {
      console.error("Push toggle failed:", err);
      setError("エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, [supported, loading]);

  return { supported, subscribed, loading, error, toggle };
}

/** base64url 文字列を Uint8Array に変換する（PushManager.subscribe の applicationServerKey 用） */
function urlBase64ToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const result = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) result[i] = raw.charCodeAt(i);
  return result;
}
