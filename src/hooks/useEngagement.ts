"use client";

import { useCallback, useRef } from "react";
import type { EngagementAction, UserProfile } from "../types";
import { storageGet, storageSet } from "../lib/storage";
import { apiFetch } from "../lib/api-fetch";

const BUFFER_KEY = "rss-engagement-buffer";
const MAX_BUFFER = 100;

/** バッファに積まれた未送信エントリを R2 に送信する */
async function flushBuffer(): Promise<void> {
  const raw = storageGet(BUFFER_KEY);
  if (!raw) return;
  let buffer: Array<{ articleId: string; feedHash: string; action: EngagementAction }>;
  try {
    buffer = JSON.parse(raw) as Array<{
      articleId: string;
      feedHash: string;
      action: EngagementAction;
    }>;
  } catch {
    storageSet(BUFFER_KEY, "[]");
    return;
  }
  if (buffer.length === 0) return;

  // 送信成功したらバッファをクリア
  try {
    await Promise.all(
      buffer.map((entry) =>
        apiFetch("/api/engagement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry),
        }),
      ),
    );
    storageSet(BUFFER_KEY, "[]");
  } catch {
    // ネットワークエラー時はバッファを保持したまま
  }
}

export function useEngagement(user: UserProfile | null | undefined) {
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recordEngagement = useCallback(
    (articleId: string, feedHash: string, action: EngagementAction) => {
      if (!user) return;

      // navigator.sendBeacon でサーバーに即送信（fire-and-forget）
      const body = JSON.stringify({ articleId, feedHash, action });
      const blob = new Blob([body], { type: "application/json" });
      if (!navigator.sendBeacon("/api/engagement", blob)) {
        // sendBeacon が失敗した場合は localStorage にバッファリング
        const raw = storageGet(BUFFER_KEY);
        let buffer: Array<{ articleId: string; feedHash: string; action: EngagementAction }> = [];
        try {
          buffer = raw ? (JSON.parse(raw) as typeof buffer) : [];
        } catch {
          buffer = [];
        }
        buffer.push({ articleId, feedHash, action });
        if (buffer.length > MAX_BUFFER) buffer.splice(0, buffer.length - MAX_BUFFER);
        storageSet(BUFFER_KEY, JSON.stringify(buffer));

        // 2 秒後にバッファをフラッシュ
        if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
        flushTimerRef.current = setTimeout(() => {
          void flushBuffer();
        }, 2000);
      }
    },
    [user],
  );

  return { recordEngagement };
}
