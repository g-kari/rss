"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "../contexts/ToastContext";
import { apiFetch } from "../lib/api-fetch";
import {
  loadDismissals,
  notifyRecommendationConfig,
} from "../lib/recommendation-dismissals-client";
import { useSyncedRef } from "./useSyncedRef";

export interface RecommendationPushSettings {
  recommendationEnabled: boolean;
  recommendationTime: string;
}
const DEFAULT_SETTINGS: RecommendationPushSettings = Object.freeze({
  recommendationEnabled: false,
  recommendationTime: "09:00",
});

export function useRecommendationPushSettings(
  userId: string,
  config: RecommendationPushSettings | null,
  timezone: string,
  onTimezoneChange: (timezone: string) => void,
) {
  const toast = useToast();
  const currentAccount = useSyncedRef(userId);
  const session = useMemo(() => ({ userId, controller: null as AbortController | null }), [userId]);
  const [state, setState] = useState({ userId, value: config ?? DEFAULT_SETTINGS, saving: false });
  const value = state.userId === userId ? state.value : (config ?? DEFAULT_SETTINGS);
  const saving = state.userId === userId && state.saving;
  useEffect(() => {
    setState({ userId, value: config ?? DEFAULT_SETTINGS, saving: false });
  }, [userId, config]);
  useEffect(
    () => () => {
      session.controller?.abort();
    },
    [session],
  );

  const save = useCallback(
    async (next: RecommendationPushSettings) => {
      if (!config || session.controller || currentAccount.current !== userId) return;
      const previous = value;
      const controller = new AbortController();
      session.controller = controller;
      setState({ userId, value: next, saving: true });
      // Stop further feedback writes immediately while an opt-out is saving.
      if (previous.recommendationEnabled && !next.recommendationEnabled) {
        notifyRecommendationConfig(userId, false);
      }
      const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      try {
        const response = await apiFetch("/api/push/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-RSS-Account-Id": userId },
          signal: controller.signal,
          body: JSON.stringify({
            ...next,
            timezone: tz,
            ...(!previous.recommendationEnabled && next.recommendationEnabled
              ? { recommendationDismissals: loadDismissals(userId) }
              : {}),
          }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (controller.signal.aborted || currentAccount.current !== userId) return;
        setState({ userId, value: next, saving: false });
        if (!timezone) onTimezoneChange(tz);
        notifyRecommendationConfig(userId, next.recommendationEnabled);
        toast.success("おすすめ通知の設定を保存しました");
      } catch {
        if (controller.signal.aborted || currentAccount.current !== userId) return;
        setState({ userId, value: previous, saving: false });
        if (previous.recommendationEnabled && !next.recommendationEnabled) {
          notifyRecommendationConfig(userId, true);
        }
        toast.error("おすすめ通知の設定を保存できませんでした");
      } finally {
        if (session.controller === controller) session.controller = null;
      }
    },
    [config, session, userId, value, timezone, onTimezoneChange, toast],
  );
  return { value, disabled: !config || saving, save };
}
