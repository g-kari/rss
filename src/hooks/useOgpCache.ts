"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { Article, OgpData } from "../types";
import { useSyncedRef } from "./useSyncedRef";
import { STORAGE_KEYS, loadJson, saveJson } from "../lib/storage";
import { apiFetch } from "../lib/api-fetch";
import { devError } from "../lib/dev-log";
import { isAbortError } from "../lib/fetch";
import { OGP_STAGGER_MS } from "../lib/ogp-cache-ttl";
import { extractBoothFallbackUrl } from "../lib/booth-fallback";
import { parseOgpCache, type OgpCacheEntry } from "../lib/ogp-cache-schema";
import { mergeWithLruEviction } from "../lib/ogp-cache-lru";
import { isValidFeedUrl, isValidPublicUrl } from "../lib/url";
import type { OgpCacheStore } from "../contexts/OgpCacheContext";

const MAX_OGP_CACHE_SIZE = 2000;
const SAVE_DEBOUNCE_MS = 500;
const OGP_BATCH_SIZE = 10;

class OgpHttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

/** Release a canceled slot even if an auth wait or body decoder does not observe fetch's signal. */
async function awaitOgpResult<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  let cancel = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    cancel = () => {
      const error = new Error("OGP request canceled");
      error.name = "AbortError";
      reject(error);
    };
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

/**
 * #808 Phase 2: 内部 state を v2 schema (`Record<string, OgpCacheEntry>`) で保持。
 *
 * caller (`ArticleList` / `resolveThumbnail`) は `ogpCache[link]` で image URL を参照する
 * のみのため、戻り値は **`Record<string, string>` の BC を維持** して caller 修正 0 件で
 * Phase 2 を完結する。Phase 3 (#808) で `useContentLinkPreviews` 等が title / description
 * を必要とするときに、別途 access 関数 (`getEntry(url): OgpCacheEntry | undefined`) を
 * 追加して Context Provider 化する設計。
 *
 * localStorage 読込時に v1 (string) → v2 object へ lazy migration (`parseOgpCache`)。
 * title / description は **未取得時 undefined のまま許容** (次 fetch で追記される lazy
 * migration policy はユーザー指定の合意済み)。
 */
export function useOgpCache(visible: Article[]): OgpCacheStore {
  // 内部 state は v2 schema (`Record<string, OgpCacheEntry>`)。localStorage 読込時に
  // `parseOgpCache` で v1 / v2 混在を v2 形式へ正規化する。
  const [ogpCacheV2, setOgpCacheV2] = useState<Record<string, OgpCacheEntry>>(() =>
    parseOgpCache(loadJson<unknown>(STORAGE_KEYS.OGP_CACHE, {})),
  );

  // 戻り値 BC 維持: caller は image URL のみ参照 (= v1 形式) なので、内部 v2 から image
  // のみ pluck した Record を memoize して返す。
  // 構造的等価ガード (#914): ogpCacheV2 が更新されても、pluck 後の {key → image} の
  // 内容 (キー集合 + 各値) が前回と完全一致する場合は前回と同じ reference を返す。
  // OGP fetch 完了のたびに Consumer が全 re-render される identity churn を回避する。
  const ogpCachePrevRef = useRef<Record<string, string>>({});
  const ogpCache = useMemo<Record<string, string>>(() => {
    const prev = ogpCachePrevRef.current;
    const result: Record<string, string> = {};
    for (const [key, entry] of Object.entries(ogpCacheV2)) {
      result[key] = entry.image;
    }
    // 新旧の内容が同一なら旧 reference を返して identity を安定化する
    const prevKeys = Object.keys(prev);
    const nextKeys = Object.keys(result);
    if (prevKeys.length === nextKeys.length && nextKeys.every((k) => prev[k] === result[k])) {
      return prev;
    }
    ogpCachePrevRef.current = result;
    return result;
  }, [ogpCacheV2]);

  const fetchingRef = useRef<Map<string, AbortController>>(new Map());
  const attemptedRef = useRef<Set<string>>(new Set());
  const noImageRef = useRef<Set<string>>(new Set());
  const ogpCacheRef = useSyncedRef(ogpCache);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<string[]>([]);
  const wantedRef = useRef<Set<string>>(new Set());
  const blockedRef = useRef(false);
  const pausedUntilRef = useRef(0);
  const pumpRef = useRef<() => void>(() => {});
  const previousLinksRef = useRef<string[]>([]);
  // Compare actual URLs, not count:last-id. Equivalent slices keep a stable identity.
  const links = useMemo(() => {
    const next = Array.from(
      new Set(
        visible.map((article) => article.link).filter((link) => !!link && isValidFeedUrl(link)),
      ),
    );
    const previous = previousLinksRef.current;
    if (next.length === previous.length && next.every((link, index) => link === previous[index])) {
      return previous;
    }
    previousLinksRef.current = next;
    return next;
  }, [visible]);
  const articleByLink = useMemo(
    () => new Map(visible.map((article) => [article.link, article])),
    [visible],
  );
  const articleByLinkRef = useSyncedRef(articleByLink);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let nextStartAt = 0;

    const scheduleSave = (data: Record<string, OgpCacheEntry>) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        if (!disposed) saveJson(STORAGE_KEYS.OGP_CACHE, data);
      }, SAVE_DEBOUNCE_MS);
    };

    const cacheImage = (link: string, image: string) => {
      if (disposed) return;
      setOgpCacheV2((prev) => {
        if (disposed) return prev;
        const existing = prev[link];
        const nextEntry: OgpCacheEntry = existing ? { ...existing, image } : { image };
        const result = mergeWithLruEviction(prev, link, nextEntry, MAX_OGP_CACHE_SIZE);
        scheduleSave(result);
        return result;
      });
    };

    const fetchImage = async (url: string, controller: AbortController): Promise<string> => {
      const response = await awaitOgpResult(
        apiFetch(
          `/api/ogp?url=${encodeURIComponent(url)}`,
          { signal: controller.signal },
          { errorNotification: "caller" },
        ),
        controller.signal,
      );
      if (controller.signal.aborted || disposed) return "";
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) blockedRef.current = true;
        if (response.status === 429) {
          const seconds = Number(response.headers.get("Retry-After"));
          const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60_000;
          pausedUntilRef.current = Math.max(pausedUntilRef.current, Date.now() + delay);
        }
        throw new OgpHttpError(response.status);
      }
      const { image } = (await awaitOgpResult(response.json(), controller.signal)) as OgpData;
      if (controller.signal.aborted || disposed) return "";
      return typeof image === "string" && isValidPublicUrl(image) ? image : "";
    };

    const resolveLink = async (link: string, controller: AbortController) => {
      const obsolete = () => disposed || controller.signal.aborted || !wantedRef.current.has(link);
      let primarySucceeded = false;
      try {
        const image = await fetchImage(link, controller);
        if (obsolete()) return;
        primarySucceeded = true;
        if (image) {
          cacheImage(link, image);
          return;
        }
      } catch (err) {
        if (obsolete() || isAbortError(err)) return;
        devError("[useOgpCache] primary OGP fetch failed", link, err);
        if (err instanceof OgpHttpError && [401, 403, 429].includes(err.status)) return;
      }

      // Keep the existing, single known BOOTH fallback. A failure is not a permanent miss.
      if (obsolete()) return;
      const article = articleByLinkRef.current.get(link);
      const boothUrl = article ? extractBoothFallbackUrl(article) : null;
      if (!boothUrl || !isValidFeedUrl(boothUrl)) {
        if (primarySucceeded) noImageRef.current.add(link);
        return;
      }
      if (blockedRef.current || pausedUntilRef.current > Date.now()) return;
      try {
        const image = ogpCacheRef.current[boothUrl] || (await fetchImage(boothUrl, controller));
        if (obsolete()) return;
        if (image) cacheImage(link, image);
        else if (primarySucceeded) noImageRef.current.add(link);
      } catch (err) {
        if (!obsolete() && !isAbortError(err)) {
          devError("[useOgpCache] booth fallback OGP fetch failed", link, err);
        }
      }
    };

    const pump = () => {
      if (
        disposed ||
        blockedRef.current ||
        timer !== null ||
        fetchingRef.current.size >= OGP_BATCH_SIZE
      )
        return;
      if (pendingRef.current.length === 0) return;
      const delay = Math.max(0, nextStartAt - Date.now(), pausedUntilRef.current - Date.now());
      timer = setTimeout(() => {
        timer = null;
        if (disposed || blockedRef.current) return;
        if (pausedUntilRef.current > Date.now()) {
          pump();
          return;
        }
        let link = pendingRef.current.shift();
        while (
          link &&
          (!wantedRef.current.has(link) ||
            ogpCacheRef.current[link] ||
            noImageRef.current.has(link) ||
            attemptedRef.current.has(link) ||
            fetchingRef.current.has(link))
        ) {
          link = pendingRef.current.shift();
        }
        if (!link) return;
        const controller = new AbortController();
        const target = link;
        attemptedRef.current.add(target);
        fetchingRef.current.set(target, controller);
        nextStartAt = Date.now() + OGP_STAGGER_MS;
        void resolveLink(target, controller).finally(() => {
          if (fetchingRef.current.get(target) === controller) fetchingRef.current.delete(target);
          // An aborted target may already be visible again. Its old result stays discarded.
          if (
            !disposed &&
            controller.signal.aborted &&
            wantedRef.current.has(target) &&
            !pendingRef.current.includes(target)
          ) {
            pendingRef.current.push(target);
          }
          pump();
        });
        pump();
      }, delay);
    };
    pumpRef.current = pump;
    return () => {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      pendingRef.current = [];
      wantedRef.current.clear();
      for (const controller of fetchingRef.current.values()) controller.abort();
      fetchingRef.current.clear();
      pumpRef.current = () => {};
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // Stable refs expose current targets/cache while this scheduler owns the mount lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    wantedRef.current = new Set(links);
    // Pagination/reordering is not a retry intent for an already-visible failed URL.
    // Never-started queued URLs remain eligible; leaving and returning permits one new attempt.
    for (const link of attemptedRef.current) {
      if (!wantedRef.current.has(link)) attemptedRef.current.delete(link);
    }
    pendingRef.current = links.filter(
      (link) =>
        !ogpCacheRef.current[link] &&
        !noImageRef.current.has(link) &&
        !attemptedRef.current.has(link) &&
        !fetchingRef.current.has(link),
    );
    blockedRef.current = false;
    for (const [link, controller] of fetchingRef.current) {
      if (!wantedRef.current.has(link)) controller.abort();
    }
    pumpRef.current();
    // Stable refs hold the latest cache; only an actual visible URL change rebuilds the queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links]);

  // #808 Phase 3a: Context 経由参照のための v2 entry getter (caller は ArticleContentBody
  // の useContentLinkPreviews で title/description 取得 cache hit 判定に使う)。
  // useSyncedRef で ogpCacheV2 の最新値を保持し、getEntry の identity を安定化。
  // OGP が 1 件取得されるたびに getEntry identity が更新されて OgpCacheStore 全体の
  // useMemo が invalidate され ArticleList 以下が re-render されるのを防ぐ。
  const ogpCacheV2Ref = useSyncedRef(ogpCacheV2);
  const getEntry = useCallback(
    (url: string): OgpCacheEntry | undefined => ogpCacheV2Ref.current[url],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- useSyncedRef の戻り値は identity 不変 (react-hook-patterns.md 規範)
    [],
  );

  // #808 Phase 3b: cache に partial entry を書き込む。useContentLinkPreviews が
  // fetch 結果 (title / description / image) を cache に書き戻すときに使用。既存 entry
  // とマージされて lazy migration policy (title/description を次 fetch で追記) を実現。
  // image が未指定なら既存 image を維持、新規 entry の場合は image="" (negative cache) で
  // 仮設置して title/description のみ持つ entry を作成する。
  const cacheOgpEntry = useCallback((url: string, partial: Partial<OgpCacheEntry>) => {
    setOgpCacheV2((prev) => {
      const existing = prev[url];
      const nextEntry: OgpCacheEntry = {
        image: partial.image ?? existing?.image ?? "",
        ...(partial.title !== undefined || existing?.title !== undefined
          ? { title: partial.title ?? existing?.title }
          : {}),
        ...(partial.description !== undefined || existing?.description !== undefined
          ? { description: partial.description ?? existing?.description }
          : {}),
        ...(partial.fetchedAt !== undefined || existing?.fetchedAt !== undefined
          ? { fetchedAt: partial.fetchedAt ?? existing?.fetchedAt }
          : {}),
      };
      // 内容変化なしなら reference 不変 (構造的等価ガード)
      if (
        existing &&
        existing.image === nextEntry.image &&
        existing.title === nextEntry.title &&
        existing.description === nextEntry.description &&
        existing.fetchedAt === nextEntry.fetchedAt
      ) {
        return prev;
      }
      // #1088 Finding 2: true-LRU eviction (再アクセス entry を末尾移動して recency 反映)。
      const result = mergeWithLruEviction(prev, url, nextEntry, MAX_OGP_CACHE_SIZE);
      // saveTimer は外側 useEffect 内の scheduleSave に同期するため、ここでは debounce
      // を経由せず即時保存。書き込み頻度は anchor 数 × 1 (per article render) で限定的。
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveJson(STORAGE_KEYS.OGP_CACHE, result);
      }, SAVE_DEBOUNCE_MS);
      return result;
    });
  }, []);

  return useMemo<OgpCacheStore>(
    () => ({ ogpCache, getEntry, cacheOgpEntry }),
    [ogpCache, getEntry, cacheOgpEntry],
  );
}
