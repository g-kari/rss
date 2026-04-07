"use client";

import { useCallback, useEffect, useRef } from "react";
import type { EngagementAction, UserProfile } from "../types";
import { loadJson, saveJson } from "../lib/storage";
import { apiFetch } from "../lib/api-fetch";

const BUFFER_KEY = "rss-engagement-buffer";
const MAX_BUFFER = 100;

/** sendBeacon 失敗時に localStorage にバッファリングする未送信エントリの型 */
type BufferEntry = {
  articleId: string;
  feedHash: string;
  action: EngagementAction;
  value?: string;
};

/** バッファに積まれた未送信エントリを R2 に送信する */
async function flushBuffer(): Promise<void> {
  const buffer = loadJson<BufferEntry[]>(BUFFER_KEY, []);
  if (buffer.length === 0) return;

  // 成功したエントリのみバッファから除去（一部失敗しても成功分は重複送信しない）
  const results = await Promise.allSettled(
    buffer.map((entry) =>
      apiFetch("/api/engagement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      }),
    ),
  );
  const remaining = buffer.filter((_, i) => results[i].status === "rejected");
  saveJson(BUFFER_KEY, remaining);
}

/**
 * 記事エンゲージメント（閲覧・クリック等）を記録するフック。
 * `navigator.sendBeacon` で /api/engagement に fire-and-forget 送信し、
 * 失敗した場合は localStorage にバッファリングして2秒後に再送する。
 *
 * @param user - ログイン中のユーザー情報（`null`/`undefined` のときは記録しない）
 * @returns recordEngagement - エンゲージメントを記録する関数
 */
export function useEngagement(user: UserProfile | null | undefined) {
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    },
    [],
  );

  const recordEngagement = useCallback(
    (articleId: string, feedHash: string, action: EngagementAction, value?: string) => {
      if (!user) return;

      // navigator.sendBeacon でサーバーに即送信（fire-and-forget）
      const payload = value
        ? { articleId, feedHash, action, value }
        : { articleId, feedHash, action };
      const body = JSON.stringify(payload);
      const blob = new Blob([body], { type: "application/json" });
      if (!navigator.sendBeacon("/api/engagement", blob)) {
        // sendBeacon が失敗した場合は localStorage にバッファリング
        const buffer = loadJson<BufferEntry[]>(BUFFER_KEY, []);
        buffer.push({ articleId, feedHash, action, ...(value !== undefined && { value }) });
        if (buffer.length > MAX_BUFFER) buffer.splice(0, buffer.length - MAX_BUFFER);
        saveJson(BUFFER_KEY, buffer);

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
