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
export async function flushBuffer(): Promise<void> {
  const snapshot = loadJson<BufferEntry[]>(BUFFER_KEY, []);
  if (snapshot.length === 0) return;

  // 成功したエントリのみバッファから除去（一部失敗しても成功分は重複送信しない）
  const results = await Promise.allSettled(
    snapshot.map((entry) =>
      apiFetch("/api/engagement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      }),
    ),
  );
  // await 中に recordEngagement が末尾追加した entry を失わないよう再 load する。
  // stale な snapshot をそのまま saveJson で書き戻すと concurrent 追加分が消える
  // (read-modify-write across await の stale write-back、#1124 と同 class の lost update)。
  // snapshot 分のうち失敗分 + await 中に末尾追加された分 (index snapshot.length 以降) を保持する。
  const current = loadJson<BufferEntry[]>(BUFFER_KEY, []);
  const failedFromSnapshot = snapshot.filter((_, i) => results[i].status === "rejected");
  const addedDuringFlush = current.slice(snapshot.length);
  saveJson(BUFFER_KEY, [...failedFromSnapshot, ...addedDuringFlush]);
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
      // 古い WebView 等で navigator.sendBeacon が undefined だと `undefined(...)` で TypeError
      // 発生する罠を feature detection で構造的予防 (browser-platform.md § ブラウザ仕様)。
      const beaconSent =
        typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/engagement", blob);
      if (!beaconSent) {
        // sendBeacon が失敗した場合 (or 未対応 environment) は localStorage にバッファリング
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
