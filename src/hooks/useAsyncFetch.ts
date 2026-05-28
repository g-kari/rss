"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api-fetch";
import { isAbortError } from "../lib/fetch";
import { useSyncedRef } from "./useSyncedRef";

/**
 * #839 案 A — 複数 hook で重複していた async fetch ボイラープレートを集約する汎用 hook。
 *
 * 既存 4 hook (`useReadingStats` / `useEngagementEntries` / `useRecommendations` /
 * `useFeedGroups`) は、それぞれ独立に以下のパターンを再実装していた:
 *
 * ```ts
 * const [data, setData] = useState<T | null>(null);
 * const [loading, setLoading] = useState(false);
 * const [error, setError] = useState<string | null>(null);
 *
 * const fetchX = useCallback(async () => {
 *   setLoading(true);
 *   setError(null);
 *   try {
 *     const res = await apiFetch(endpoint);
 *     if (!res.ok) throw new Error(`HTTP ${res.status}`);
 *     setData(transform(await res.json()));
 *   } catch (e) {
 *     setError(e instanceof Error ? e.message : "fetch failed");
 *   } finally {
 *     setLoading(false);
 *   }
 * }, []);
 * ```
 *
 * 本 hook はこれを以下の最小 API で吸収する:
 *
 * - `endpoint`: 取得先 URL (`null` のとき fetch しない — auto / refetch どちらも no-op)
 * - `options.auto`: `true` で mount + endpoint/deps 変化時に自動 fetch (AbortController 付き)
 * - `options.deps`: auto モードの追加 deps (例: ログインユーザー)
 * - `options.transform`: raw JSON → `T` への変換 (default: identity cast)
 * - `options.fetcher`: 完全カスタム fetcher (apiFetch + json + transform をバイパス、多段 fetch 用)
 * - `options.onError`: 整形済エラーメッセージで呼ばれるコールバック
 * - `options.formatError`: 例外 → 表示用文字列の変換 (default: `err.message` / "fetch failed")
 * - `options.initialData`: 初期 data
 *
 * 戻り値の `setData` は CRUD 操作で fetch を介さず楽観的更新する hook (useFeedGroups 等) 用。
 */
export interface UseAsyncFetchOptions<T> {
  /** mount + endpoint/deps 変化時に自動 fetch (default: false = lazy) */
  auto?: boolean;
  /** auto モードの追加 deps */
  deps?: ReadonlyArray<unknown>;
  /** raw JSON → T 変換 (default: 単純 cast) */
  transform?: (raw: unknown) => T;
  /** apiFetch + json + transform をバイパスする完全カスタム fetcher */
  fetcher?: (endpoint: string, signal: AbortSignal) => Promise<T>;
  /** 例外 → 表示用文字列の変換 */
  formatError?: (err: unknown) => string;
  /** 整形済エラーメッセージで呼ばれるコールバック (UI toast 等) */
  onError?: (message: string) => void;
  /** 初期 data 値 */
  initialData?: T | null;
}

/** `useAsyncFetch` の戻り値型 */
export interface UseAsyncFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** 手動 fetch トリガー (auto モードでも追加 refresh に使える) */
  refetch: () => Promise<void>;
  /** CRUD パターンで data を直接差し替えるための setter */
  setData: React.Dispatch<React.SetStateAction<T | null>>;
  /** 外部 fetch (`triggerRefresh` 等) で error state を直接調整するための setter */
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

function defaultFormatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "fetch failed";
}

export function useAsyncFetch<T>(
  endpoint: string | null,
  options?: UseAsyncFetchOptions<T>,
): UseAsyncFetchResult<T> {
  const {
    auto = false,
    deps = [],
    transform,
    fetcher,
    formatError,
    onError,
    initialData = null,
  } = options ?? {};

  const [data, setData] = useState<T | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 最新参照を保持して deps から除外 (stale closure を避けつつ deps 不要)
  const transformRef = useSyncedRef(transform);
  const fetcherRef = useSyncedRef(fetcher);
  const formatErrorRef = useSyncedRef(formatError ?? defaultFormatError);
  const onErrorRef = useSyncedRef(onError);

  /**
   * 共通 fetch 実装。`signal` は auto モードでは AbortController から渡され、
   * lazy `refetch()` 経由では undefined (キャンセル不要)。
   */
  const runFetch = useCallback(
    async (targetEndpoint: string, signal: AbortSignal | undefined): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        let value: T;
        const customFetcher = fetcherRef.current;
        if (customFetcher) {
          // signal がない (lazy refetch) ときは never-abort signal を渡す
          value = await customFetcher(targetEndpoint, signal ?? new AbortController().signal);
        } else {
          const res = await apiFetch(targetEndpoint, signal ? { signal } : undefined);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const raw: unknown = await res.json();
          const t = transformRef.current;
          value = t ? t(raw) : (raw as T);
        }
        if (signal?.aborted) return;
        setData(value);
      } catch (err) {
        if (isAbortError(err)) return;
        const msg = formatErrorRef.current(err);
        setError(msg);
        onErrorRef.current?.(msg);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    // 全 dep は ref 経由で最新値を参照するため deps 不要
    [fetcherRef, transformRef, formatErrorRef, onErrorRef],
  );

  // 最新の endpoint を保持して lazy refetch でも常に新値を使う
  const endpointRef = useRef(endpoint);
  endpointRef.current = endpoint;

  const refetch = useCallback(async (): Promise<void> => {
    const ep = endpointRef.current;
    if (ep === null) return;
    await runFetch(ep, undefined);
  }, [runFetch]);

  useEffect(() => {
    if (!auto) return;
    if (endpoint === null) return;
    const controller = new AbortController();
    void runFetch(endpoint, controller.signal);
    return () => controller.abort();
    // deps array は呼び出し側からの追加 deps を spread する。ESLint exhaustive-deps は
    // 動的 deps を解析できないため例外的に disable する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, endpoint, runFetch, ...deps]);

  return { data, loading, error, refetch, setData, setError };
}
