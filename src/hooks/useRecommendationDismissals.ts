"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { saveJson } from "../lib/storage";
import { apiFetch } from "../lib/api-fetch";
import { useSyncedRef } from "./useSyncedRef";
import {
  applyDismissalChanges,
  currentDismissals,
  dismissalStorageKey,
  DISMISSAL_TTL_MS,
  loadDismissals,
  loadDismissalChanges,
  mergeDismissalChanges,
  saveDismissalChanges,
  RECOMMENDATION_CONFIG_EVENT,
  recommendationConfigStorageKey,
  type DismissalChanges,
  type RecommendationDismissal,
  type RecommendationConfigChange,
} from "../lib/recommendation-dismissals-client";

/** Bounded, reversible, account-scoped feedback; cloud sync requires explicit opt-in. */
export function useRecommendationDismissals(userId: string) {
  const [version, setVersion] = useState(0);
  const accountRef = useSyncedRef(userId);
  const session = useMemo(() => {
    const entries = loadDismissals(userId);
    return {
      userId,
      entries,
      pending: loadDismissalChanges(userId, entries.length ? { add: entries } : {}),
      flush: () => {},
    };
  }, [userId]);
  const activeEntries = useMemo(() => currentDismissals(session.entries), [session, version]);
  const dismissedIds = useMemo(
    () => new Set(activeEntries.map((entry) => entry.articleId)),
    [activeEntries],
  );

  useEffect(() => {
    const refresh = () => setVersion((value) => value + 1);
    const earliest = Math.min(
      ...activeEntries.map((entry) => entry.dismissedAt + DISMISSAL_TTL_MS),
    );
    const timer = activeEntries.length
      ? setTimeout(refresh, Math.min(2147483647, Math.max(1, earliest - Date.now() + 1)))
      : undefined;
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [activeEntries]);

  useEffect(() => {
    saveDismissalChanges(userId, session.pending);
    let alive = true;
    let enabled = false;
    let generation = 0;
    let configController: AbortController | undefined;
    let mutationController: AbortController | undefined;
    const valid = () => alive && accountRef.current === userId;
    const refreshPending = () => {
      session.pending = loadDismissalChanges(userId, session.pending);
      return session.pending;
    };
    const applyServer = (entries: RecommendationDismissal[]) => {
      session.entries = applyDismissalChanges(entries, refreshPending());
      saveJson(dismissalStorageKey(userId), session.entries);
      setVersion((value) => value + 1);
    };
    const flush = async () => {
      if (!valid() || !enabled || mutationController) return;
      const changes = refreshPending();
      if (!Object.keys(changes).length) return;
      const sent = JSON.stringify(changes);
      const controller = new AbortController();
      mutationController = controller;
      const requestGeneration = generation;
      let saved = false;
      try {
        const response = await apiFetch("/api/push/recommendations/dismissals", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-RSS-Account-Id": userId },
          body: sent,
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = (await response.json()) as {
          recommendationDismissals: RecommendationDismissal[];
        };
        if (!valid() || !enabled || controller.signal.aborted || requestGeneration !== generation)
          return;
        if (JSON.stringify(refreshPending()) === sent) {
          session.pending = {};
          saveDismissalChanges(userId, session.pending);
        }
        applyServer(data.recommendationDismissals ?? []);
        saved = true;
      } catch {
        // Keep intentions locally. Retry on the next change, focus, online, or opt-in.
      } finally {
        if (mutationController === controller) mutationController = undefined;
        if (saved && valid() && enabled) void flush();
      }
    };
    session.flush = () => {
      void flush();
    };
    const setEnabled = (next: boolean) => {
      enabled = next;
      if (!next) {
        generation += 1;
        mutationController?.abort();
        mutationController = undefined;
      }
    };
    const loadConfig = async () => {
      setEnabled(false);
      configController?.abort();
      const controller = new AbortController();
      configController = controller;
      const requestGeneration = ++generation;
      try {
        const response = await apiFetch("/api/push/config", {
          signal: controller.signal,
          headers: { "X-RSS-Account-Id": userId },
        });
        if (!response.ok) return;
        const data = (await response.json()) as {
          recommendationEnabled?: boolean;
          recommendationDismissals?: RecommendationDismissal[];
        };
        if (!valid() || controller.signal.aborted || requestGeneration !== generation) return;
        setEnabled(data.recommendationEnabled === true);
        if (enabled) {
          applyServer(data.recommendationDismissals ?? []);
          void flush();
        }
      } catch {
        // A config read failure must never turn sync on.
      }
    };
    const onConfigChange = (event: Event) => {
      const data = (event as CustomEvent<RecommendationConfigChange>).detail;
      if (data?.userId !== userId) return;
      configController?.abort();
      generation += 1;
      setEnabled(false);
      if (data.recommendationEnabled) void loadConfig();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === recommendationConfigStorageKey(userId)) {
        // Pause immediately, including an already pending mutation, before rechecking opt-in.
        setEnabled(false);
        void loadConfig();
        return;
      }
      if (event.key !== dismissalStorageKey(userId) && event.key !== null) return;
      session.entries = loadDismissals(userId);
      session.pending = loadDismissalChanges(userId, {});
      setVersion((value) => value + 1);
    };
    const reload = () => {
      void loadConfig();
    };
    window.addEventListener(RECOMMENDATION_CONFIG_EVENT, onConfigChange);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", reload);
    window.addEventListener("online", reload);
    void loadConfig();
    return () => {
      alive = false;
      session.flush = () => {};
      configController?.abort();
      mutationController?.abort();
      window.removeEventListener(RECOMMENDATION_CONFIG_EVENT, onConfigChange);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", reload);
      window.removeEventListener("online", reload);
    };
  }, [session, userId]);

  const update = useCallback(
    (change: DismissalChanges) => {
      if (accountRef.current !== userId) return;
      session.entries = applyDismissalChanges(loadDismissals(userId, session.entries), change);
      session.pending = mergeDismissalChanges(
        loadDismissalChanges(userId, session.pending),
        change,
      );
      saveDismissalChanges(userId, session.pending);
      saveJson(dismissalStorageKey(userId), session.entries);
      setVersion((value) => value + 1);
      session.flush();
    },
    [session, userId],
  );
  const dismiss = useCallback(
    (articleId: string) => update({ add: [{ articleId, dismissedAt: Date.now() }] }),
    [update],
  );
  const restore = useCallback((articleId: string) => update({ remove: [articleId] }), [update]);
  const reset = useCallback(() => update({ reset: true }), [update]);
  return { dismissedIds, dismiss, restore, reset };
}
