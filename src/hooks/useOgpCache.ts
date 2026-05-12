"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { Article, OgpData } from "../types";
import { useSyncedRef } from "./useSyncedRef";
import { STORAGE_KEYS, loadJson, saveJson } from "../lib/storage";
import { apiFetch } from "../lib/api-fetch";
import { extractBoothFallbackUrl } from "../lib/booth-fallback";

const MAX_OGP_CACHE_SIZE = 2000;
const SAVE_DEBOUNCE_MS = 500;

export function useOgpCache(visible: Article[]): Record<string, string> {
  const [ogpCache, setOgpCache] = useState<Record<string, string>>(() =>
    loadJson<Record<string, string>>(STORAGE_KEYS.OGP_CACHE, {}),
  );

  const fetchingRef = useRef<Set<string>>(new Set());
  const noImageRef = useRef<Set<string>>(new Set());
  const ogpCacheRef = useSyncedRef(ogpCache);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenLinksRef = useRef<Set<string>>(new Set());

  // 記事 ID ベースの軽量キー（全リンクを join する O(n) 文字列計算を回避）
  const linksKey = useMemo(() => visible.map((a) => a.id).join(","), [visible]);

  useEffect(() => {
    if (!linksKey) return;

    // linksKey.split() の代わりに visible から直接リンクを取得
    const allLinks = visible.map((a) => a.link).filter((l): l is string => l != null);
    const newLinks = allLinks.filter((link) => !seenLinksRef.current.has(link));
    if (newLinks.length === 0) return;

    for (const link of newLinks) seenLinksRef.current.add(link);

    const toFetch = newLinks.filter(
      (link) =>
        !ogpCacheRef.current[link] &&
        !fetchingRef.current.has(link) &&
        !noImageRef.current.has(link),
    );

    if (toFetch.length === 0) return;

    // 一度に最大10件まで並列フェッチ（429防止）
    const OGP_BATCH_SIZE = 10;
    const batch = toFetch.slice(0, OGP_BATCH_SIZE);

    const scheduleSave = (data: Record<string, string>) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveJson(STORAGE_KEYS.OGP_CACHE, data);
      }, SAVE_DEBOUNCE_MS);
    };

    const cacheImage = (link: string, image: string) => {
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
    };

    // #765 / #750 Phase 2: x.com 系記事で primary OGP が空 or fetch error のとき、
    // summary に含まれる booth.pm URL の OGP を取得して thumbnail として使う。
    // booth fallback も失敗したら noImageRef に登録して以後 retry しない。
    const tryBoothFallback = async (link: string, article: Article | undefined) => {
      const boothUrl = article
        ? extractBoothFallbackUrl({ link: article.link, summary: article.summary })
        : null;
      if (!boothUrl) {
        noImageRef.current.add(link);
        return;
      }
      try {
        const r = await apiFetch(`/api/ogp?url=${encodeURIComponent(boothUrl)}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const { image: boothImage } = (await r.json()) as OgpData;
        if (boothImage) {
          cacheImage(link, boothImage);
        } else {
          noImageRef.current.add(link);
        }
      } catch {
        noImageRef.current.add(link);
      }
    };

    batch.forEach((link) => {
      fetchingRef.current.add(link);
      const article = visible.find((a) => a.link === link);
      apiFetch(`/api/ogp?url=${encodeURIComponent(link)}`)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<OgpData>;
        })
        .then(({ image }) => {
          if (image) {
            cacheImage(link, image);
          } else {
            return tryBoothFallback(link, article);
          }
        })
        .catch(() => tryBoothFallback(link, article))
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
