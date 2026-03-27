"use client";

import { useState, useEffect, useRef } from "react";
import type { Article } from "../types";
import { STORAGE_KEYS, loadJson, saveJson } from "../lib/storage";
import { apiFetch } from "../lib/api-fetch";

const MAX_OGP_CACHE_SIZE = 200;
const FETCH_BATCH_SIZE = 5;

/**
 * 表示中の記事に対して OGP 画像を遅延フェッチし、localStorage に永続化するキャッシュ。
 * ogImage がない記事の link を /api/ogp に問い合わせ、取得した image URL を返す。
 */
export function useOgpCache(visible: Article[]): Record<string, string> {
  const [ogpCache, setOgpCache] = useState<Record<string, string>>(() =>
    loadJson<Record<string, string>>(STORAGE_KEYS.OGP_CACHE, {}),
  );

  const fetchingRef = useRef<Set<string>>(new Set());
  // 画像なし・エラーだったURLをセッション内でキャッシュし無駄なリトライを防止する
  const noImageRef = useRef<Set<string>>(new Set());
  // setOgpCache 呼び出し後の再トリガーを避けるため ref で最新値を参照する
  const ogpCacheRef = useRef(ogpCache);
  ogpCacheRef.current = ogpCache;

  useEffect(() => {
    const toFetch = visible
      .filter(
        (a) =>
          !a.ogImage &&
          a.link &&
          !ogpCacheRef.current[a.link] &&
          !fetchingRef.current.has(a.link) &&
          !noImageRef.current.has(a.link),
      )
      .slice(0, FETCH_BATCH_SIZE);

    if (toFetch.length === 0) return;

    toFetch.forEach((a) => {
      fetchingRef.current.add(a.link);
      apiFetch(`/api/ogp?url=${encodeURIComponent(a.link)}`)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<{ image: string }>;
        })
        .then(({ image }) => {
          if (image) {
            setOgpCache((prev) => {
              const next = { ...prev, [a.link]: image };
              // キャッシュが肥大化しないよう最大 200 件に制限
              const keys = Object.keys(next);
              const result =
                keys.length > MAX_OGP_CACHE_SIZE
                  ? Object.fromEntries(keys.slice(-MAX_OGP_CACHE_SIZE).map((k) => [k, next[k]]))
                  : next;
              saveJson(STORAGE_KEYS.OGP_CACHE, result);
              return result;
            });
          } else {
            // OGP 画像なし: セッション内で再フェッチしないようマーク
            noImageRef.current.add(a.link);
          }
        })
        .catch(() => {
          // フェッチエラー: セッション内で再フェッチしないようマーク
          noImageRef.current.add(a.link);
        })
        .finally(() => {
          fetchingRef.current.delete(a.link);
        });
    });
  }, [visible]);

  return ogpCache;
}
