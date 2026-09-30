"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadJsonArray, saveJson, STORAGE_KEYS } from "../lib/storage";

interface Dismissal {
  articleId: string;
  dismissedAt: number;
}

const DISMISSAL_TTL_MS = 30 * 86400000;
const MAX_DISMISSALS = 200;

function isDismissal(value: unknown): value is Dismissal {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.articleId === "string" &&
    entry.articleId.length > 0 &&
    entry.articleId.length <= 256 &&
    typeof entry.dismissedAt === "number" &&
    Number.isFinite(entry.dismissedAt)
  );
}

function currentDismissals(entries: Dismissal[], now: number): Dismissal[] {
  const seen = new Set<string>();
  return entries
    .filter((entry) => {
      const age = now - entry.dismissedAt;
      if (age < 0 || age >= DISMISSAL_TTL_MS || seen.has(entry.articleId)) return false;
      seen.add(entry.articleId);
      return true;
    })
    .slice(0, MAX_DISMISSALS);
}

/** Bounded, reversible, account-scoped feedback. It never changes topic preferences. */
export function useRecommendationDismissals(userId: string) {
  const [clockVersion, setClockVersion] = useState(0);
  const storageKey = `${STORAGE_KEYS.ARTICLE_RECOMMENDATION_DISMISSALS}:${userId}`;
  const initialEntries = useMemo(
    () => loadJsonArray<Dismissal>(storageKey, [], isDismissal),
    [storageKey],
  );
  const [state, setState] = useState(() => ({ storageKey, entries: initialEntries }));
  // While the effect catches up to an account change, derive solely from that account's data.
  const entries = state.storageKey === storageKey ? state.entries : initialEntries;
  useEffect(() => {
    setState((previous) =>
      previous.storageKey === storageKey ? previous : { storageKey, entries: initialEntries },
    );
  }, [storageKey, initialEntries]);
  const activeEntries = useMemo(
    () => currentDismissals(entries, Date.now()),
    // clockVersion changes only at an expiration boundary or window focus.
    [entries, clockVersion],
  );
  const dismissedIds = useMemo(
    () => new Set(activeEntries.map((entry) => entry.articleId)),
    [activeEntries],
  );
  useEffect(() => {
    const refresh = () => setClockVersion((version) => version + 1);
    window.addEventListener("focus", refresh);
    const earliest = Math.min(
      ...activeEntries.map((entry) => entry.dismissedAt + DISMISSAL_TTL_MS),
    );
    const timer =
      activeEntries.length > 0
        ? setTimeout(refresh, Math.min(2147483647, Math.max(1, earliest - Date.now() + 1)))
        : undefined;
    return () => {
      window.removeEventListener("focus", refresh);
      clearTimeout(timer);
    };
  }, [activeEntries]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== null) return;
      setState({ storageKey, entries: loadJsonArray<Dismissal>(storageKey, [], isDismissal) });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey]);

  const update = useCallback(
    (change: (entries: Dismissal[]) => Dismissal[]) => {
      setState((previous) => {
        const base = previous.storageKey === storageKey ? previous.entries : initialEntries;
        // Read again at mutation time so another tab's feedback is not overwritten.
        // If storage is blocked, loadJsonArray retains this tab's working state.
        const latest = loadJsonArray<Dismissal>(storageKey, base, isDismissal);
        const next = currentDismissals(change(currentDismissals(latest, Date.now())), Date.now());
        saveJson(storageKey, next);
        return { storageKey, entries: next };
      });
    },
    [storageKey, initialEntries],
  );
  const dismiss = useCallback(
    (articleId: string) => {
      update((previous) => [
        { articleId, dismissedAt: Date.now() },
        ...previous.filter((entry) => entry.articleId !== articleId),
      ]);
    },
    [update],
  );
  const restore = useCallback(
    (articleId: string) =>
      update((previous) => previous.filter((entry) => entry.articleId !== articleId)),
    [update],
  );
  const reset = useCallback(() => update(() => []), [update]);
  return { dismissedIds, dismiss, restore, reset };
}
