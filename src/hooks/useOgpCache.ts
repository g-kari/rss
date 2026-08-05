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
import type { OgpCacheStore } from "../contexts/OgpCacheContext";

const MAX_OGP_CACHE_SIZE = 2000;
const SAVE_DEBOUNCE_MS = 500;

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

  const fetchingRef = useRef<Set<string>>(new Set());
  const noImageRef = useRef<Set<string>>(new Set());
  const ogpCacheRef = useSyncedRef(ogpCache);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenLinksRef = useRef<Set<string>>(new Set());

  // count:last-id sentinel — O(1) で記事追加/削除を検知 (全 ID を join する O(n) GC 圧を回避)
  // visible 配列参照を deps に入れると slice の度に useMemo が再実行されるため primitive 2 値で代替
  const visibleLen = visible.length;
  const visibleLastId = visible.at(-1)?.id ?? "";
  const linksKey = useMemo(
    () => (visibleLen > 0 ? `${visibleLen}:${visibleLastId}` : ""),
    [visibleLen, visibleLastId],
  );

  useEffect(() => {
    if (!linksKey) return;

    // linksKey.split() の代わりに visible から直接リンクを取得し、新規リンクだけを収集
    // (同一 render 内の重複は従来どおり保持し、seenLinks への登録タイミングも維持)
    const newLinks: string[] = [];
    for (const article of visible) {
      const link = article.link;
      if (link != null && !seenLinksRef.current.has(link)) newLinks.push(link);
    }
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
    // OGP_STAGGER_MS は ogp-cache-ttl.ts の共有定数を使用
    const batch = toFetch.slice(0, OGP_BATCH_SIZE);

    const scheduleSave = (data: Record<string, OgpCacheEntry>) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveJson(STORAGE_KEYS.OGP_CACHE, data);
      }, SAVE_DEBOUNCE_MS);
    };

    const cacheImage = (link: string, image: string) => {
      setOgpCacheV2((prev) => {
        // #808 Phase 2: v2 entry を保存。title / description は **未取得時 undefined** の
        // まま (次 fetch で追記する lazy migration policy)。既存 entry があれば image だけ
        // 更新して title / description を保持する。
        const existing = prev[link];
        const nextEntry: OgpCacheEntry = existing ? { ...existing, image } : { image };
        // #1088 Finding 2: true-LRU eviction (再アクセス entry を末尾移動して recency 反映)。
        const result = mergeWithLruEviction(prev, link, nextEntry, MAX_OGP_CACHE_SIZE);
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
      } catch (err) {
        devError("[useOgpCache] booth fallback OGP fetch failed", link, err);
        noImageRef.current.add(link);
      }
    };

    // batch loop の `visible.find()` を避けるため、link → Article の Map を 1 度だけ構築
    // (visible 500 件 × batch 10 件で 5000 ops → 510 ops に削減)
    const articleByLink = new Map<string, Article>();
    for (const a of visible) {
      if (a.link) articleByLink.set(a.link, a);
    }
    batch.forEach((link, i) => {
      fetchingRef.current.add(link);
      const article = articleByLink.get(link);
      // リロード時の /api/ogp 一斉フェッチ burst を防ぐため、インデックスに応じて遅延する（#762）
      setTimeout(() => {
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
          .catch((err: unknown) => {
            if (!isAbortError(err)) devError("[useOgpCache] primary OGP fetch failed", link, err);
            return tryBoothFallback(link, article);
          })
          .finally(() => {
            fetchingRef.current.delete(link);
          });
      }, i * OGP_STAGGER_MS);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linksKey]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

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
