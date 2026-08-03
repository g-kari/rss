"use client";

import { useState, useEffect, useCallback } from "react";
import type { UserProfile } from "../types";
import { apiFetch } from "../lib/api-fetch";
import { base64urlToBytes } from "../lib/auth";
import { devError } from "../lib/dev-log";

interface PushNotificationState {
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
  /** テスト通知を送信する */
  sendTest: () => Promise<string>;
}

/**
 * Web Push 通知サブスクリプション管理フック。
 *
 * マウント時に service worker の準備完了を待ち、現在の購読状態を確認する。
 * `toggle()` で購読/解除を行い、成功時は /api/push/subscribe or /api/push/unsubscribe に送信する。
 * ブラウザが Push をサポートしない場合や `user` が未ログインの場合は `supported: false` を返す。
 */
export function usePushNotifications(user: UserProfile | null | undefined): PushNotificationState {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 初期表示 critical path から除外するため、service worker ready 待ち + getSubscription
  // を initial paint 後まで defer (設定モーダル open まで実質不要、subscribed state は
  // toggle 呼出時に refresh されるため defer による UX 影響ゼロ)。
  const [deferReady, setDeferReady] = useState(false);
  useEffect(() => {
    if (!user) {
      setDeferReady(false);
      return;
    }
    const id = setTimeout(() => setDeferReady(true), 0);
    return () => clearTimeout(id);
  }, [user]);

  // マウント時: ブラウザのサポート確認と現在の購読状態を取得 (initial paint 後まで defer)
  useEffect(() => {
    if (!user || !deferReady) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    setSupported(true);

    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(sub !== null))
      .catch((err: unknown) => {
        devError("[usePushNotifications] getSubscription failed", err);
      });
  }, [user, deferReady]);

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
        const appServerKey = base64urlToBytes(publicKey);
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
      devError("Push toggle failed:", err);
      setError("エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, [supported, loading]);

  const sendTest = useCallback(async (): Promise<string> => {
    try {
      const res = await apiFetch("/api/push/test", { method: "POST" });
      if (res.status === 503) return "VAPID キーが未設定です (wrangler secret を確認してください)";
      if (res.status === 404) return "サブスクリプションが見つかりません (再度購読してください)";
      if (!res.ok) return `送信失敗 (${res.status})`;
      const data = (await res.json()) as { sent: number; expired: number; remaining: number };
      if (data.expired > 0) return `送信完了 (期限切れ ${data.expired} 件を削除しました)`;
      return `テスト通知を ${data.sent} 件送信しました`;
    } catch (err) {
      devError("[usePushNotifications] sendTest failed", err);
      return "ネットワークエラーが発生しました";
    }
  }, []);

  return { supported, subscribed, loading, error, toggle, sendTest };
}
