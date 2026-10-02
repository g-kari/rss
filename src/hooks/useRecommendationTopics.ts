"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { loadJson, saveJson, storageGet, STORAGE_KEYS } from "../lib/storage";
import {
  parseTopicPreferences,
  type TopicPreference,
  type TopicPreferenceValue,
} from "../lib/recommendation-topics";
import { useSyncedRef } from "./useSyncedRef";

const CHANGE_EVENT = "rss-recommendation-topics-change";
export function topicPreferenceStorageKey(userId: string) {
  return `${STORAGE_KEYS.RECOMMENDATION_TOPIC_PREFERENCES}:${userId}`;
}

/** No network writes: current account, browser and local ranking only. */
export function useRecommendationTopics(userId: string) {
  const source = useId();
  const accountRef = useSyncedRef(userId);
  const [version, setVersion] = useState(0);
  const session = useMemo(
    () => ({
      entries: parseTopicPreferences(loadJson<unknown>(topicPreferenceStorageKey(userId), [])),
      undo: null as { before: TopicPreference[]; after: TopicPreference[] } | null,
      persisted: true,
    }),
    [userId],
  );
  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    const reload = () => {
      if (!session.persisted) return;
      const next = parseTopicPreferences(loadJson<unknown>(topicPreferenceStorageKey(userId), []));
      if (JSON.stringify(next) !== JSON.stringify(session.entries)) {
        session.entries = next;
        session.undo = null;
        refresh();
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === topicPreferenceStorageKey(userId) || event.key === null) reload();
    };
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string; source: string }>).detail;
      if (detail?.userId === userId && detail.source !== source) reload();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("focus", reload);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("focus", reload);
    };
  }, [userId, source, session, refresh]);
  const commit = useCallback(
    (entries: TopicPreference[]) => {
      if (accountRef.current !== userId) return;
      session.entries = entries;
      const key = topicPreferenceStorageKey(userId);
      saveJson(key, entries);
      session.persisted = storageGet(key) === JSON.stringify(entries);
      refresh();
      if (session.persisted)
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { userId, source } }));
    },
    [session, userId, source, refresh],
  );
  const update = useCallback(
    (label: string, value: TopicPreferenceValue | null) => {
      if (accountRef.current !== userId) return;
      const entry = value ? parseTopicPreferences([{ label, topic: label, value }])[0] : undefined;
      const topic = parseTopicPreferences([{ label, topic: label, value: "more" }])[0]?.topic;
      if (!topic) return;
      const before = session.persisted
        ? parseTopicPreferences(loadJson<unknown>(topicPreferenceStorageKey(userId), []))
        : session.entries;
      const after = parseTopicPreferences([
        ...(entry ? [entry] : []),
        ...before.filter((item) => item.topic !== topic),
      ]);
      if (JSON.stringify(before) === JSON.stringify(after)) return;
      session.undo = { before, after };
      commit(after);
    },
    [session, userId, commit],
  );
  const reset = useCallback(() => {
    if (accountRef.current !== userId) return;
    const before = session.persisted
      ? parseTopicPreferences(loadJson<unknown>(topicPreferenceStorageKey(userId), []))
      : session.entries;
    if (!before.length) return;
    session.undo = { before, after: [] };
    commit([]);
  }, [session, userId, commit]);
  const undo = useCallback(() => {
    if (accountRef.current !== userId || !session.undo) return false;
    const current = session.persisted
      ? parseTopicPreferences(loadJson<unknown>(topicPreferenceStorageKey(userId), []))
      : session.entries;
    const previous = session.undo;
    session.undo = null;
    // Never overwrite a newer choice from another tab while restoring an older snapshot.
    if (JSON.stringify(current) === JSON.stringify(previous.after)) {
      commit(previous.before);
      return true;
    }
    session.entries = current;
    refresh();
    return false;
  }, [session, userId, commit, refresh]);
  return useMemo(
    () => ({
      preferences: session.entries,
      update,
      reset,
      undo,
      canUndo: !!session.undo,
      persisted: session.persisted,
    }),
    [session, version, update, reset, undo],
  );
}
