"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { Article, OgpData } from "../types";
import { useSyncedRef } from "./useSyncedRef";
import { STORAGE_KEYS, loadJson, saveJson } from "../lib/storage";
import { apiFetch } from "../lib/api-fetch";

const MAX_OGP_CACHE_SIZE = 2000;
const FETCH_BATCH_SIZE = 10;
const SAVE_DEBOUNCE_MS = 2000;

export function useOgpCache(visible: Article[]): Record<string, string> {
  const [ogpCache, setOgpCache] = useState<Record<string, string>>(() =>
    loadJson<Record<string, string>>(STORAGE_KEYS.OGP_CACHE, {}),
  );

  const fetchingRef = useRef<Set<string>>(new Set());
  const noImageRef = useRef<Set<string>>(new Set());
  const ogpCacheRef = useSyncedRef(ogpCache);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // visible の link 一覧を安定した文字列キーに変換し、参照変化を抑止
  const visibleLinks = useMemo(() => visible.map((a) => a.link).filter(Boolean), [visible]);
  const linksKey = useMemo(() => visibleLinks.join("\n"), [visibleLinks]);

  useEffect(() => {
    const toFetch = visibleLinks
      .filter(
        (link) =>
          !ogpCacheRef.current[link] &&
          !fetchingRef.current.has(link) &&
          !noImageRef.current.has(link),
      )
      .slice(0, FETCH_BATCH_SIZE);

    if (toFetch.length === 0) return;

    const scheduleSave = (data: Record<string, string>) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveJson(STORAGE_KEYS.OGP_CACHE, data);
      }, SAVE_DEBOUNCE_MS);
    };

    toFetch.forEach((link) => {
      fetchingRef.current.add(link);
      apiFetch(`/api/ogp?url=${encodeURIComponent(link)}`)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<OgpData>;
        })
        .then(({ image }) => {
          if (image) {
            setOgpCache((prev) => {
              const next = { ...prev, [link]: image };
              const keys = Object.keys(next);
              const result =
                keys.length > MAX_OGP_CACHE_SIZE
                  ? Object.fromEntries(keys.slice(-MAX_OGP_CACHE_SIZE).map((k) => [k, next[k]]))
                  : next;
              scheduleSave(result);
              return result;
            });
          } else {
            noImageRef.current.add(link);
          }
        })
        .catch(() => {
          noImageRef.current.add(link);
        })
        .finally(() => {
          fetchingRef.current.delete(link);
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linksKey]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return ogpCache;
}
