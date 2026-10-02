"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isWorkersAiModelId, type WorkersAiModelId } from "../lib/ai-models";
import type { AiProviderPreference } from "../lib/ai-preferences";
import type { CachedSummary } from "../lib/ai-summary-contract";
import { DEFAULT_FETCH_TIMEOUT_MS, FEED_MAX_BYTES, readResponseText } from "../lib/fetch";
import { selectImmersiveSummaryUrls, validateSummaryCacheResponse } from "../lib/immersive-summary";
import { isValidFeedUrl } from "../lib/url";
import { getAuthReady } from "./useAuth";
import { useSyncedRef } from "./useSyncedRef";

export type CacheEntry =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "hit"; summary: CachedSummary }
  | { kind: "miss" }
  | { kind: "error"; message: string; status?: number }
  | { kind: "evicted" }
  | { kind: "disabled"; reason: string };

export interface ImmersiveSummaryCacheOptions {
  enabled: boolean;
  userId: string | null;
  preferenceUserId: string | null;
  authUsable: boolean;
  scopeKey: string;
  provider: AiProviderPreference | undefined;
  model: WorkersAiModelId | undefined;
  urls: readonly string[];
  /** Scheduling gate only: visibility changes must preserve checked misses and errors. */
  requestAllowed: boolean;
}

export interface ImmersiveSummaryCacheState {
  contextKey: string;
  disabledReason: string | null;
  loading: boolean;
  entries: ReadonlyMap<string, CacheEntry>;
  getEntry(url: string): CacheEntry;
  retry(url: string): void;
}

const MAX_HITS = 48;
const IDLE: CacheEntry = { kind: "idle" };
interface PendingRequest {
  generation: number;
  controller: AbortController;
  timeout: ReturnType<typeof setTimeout> | null;
}
interface CacheSession {
  contextKey: string;
  active: boolean;
  hits: Map<string, CachedSummary>;
  checked: Map<string, CacheEntry>;
  pending: PendingRequest | null;
}

function disabledReasonFor(options: ImmersiveSummaryCacheOptions): string | null {
  if (!options.enabled) return "保存済み要約は無効です";
  if (!options.authUsable || !options.userId) return "ログイン状態を確認してください";
  if (!options.preferenceUserId || options.preferenceUserId !== options.userId)
    return "AI設定の読み込み待ちです";
  if (options.provider !== "auto" && options.provider !== "workers-ai")
    return "ブラウザーAIでは保存済み要約を利用できません";
  if (!isWorkersAiModelId(options.model)) return "AIモデルの設定待ちです";
  return null;
}

function sessionEntry(session: CacheSession, url: string): CacheEntry {
  const summary = session.hits.get(url);
  return summary ? { kind: "hit", summary } : (session.checked.get(url) ?? IDLE);
}

function releasePending(session: CacheSession, pending: PendingRequest): void {
  if (pending.timeout !== null) clearTimeout(pending.timeout);
  pending.timeout = null;
  if (session.pending === pending) session.pending = null;
}

class CacheReadError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/**
 * One-shot reads of the selected visible/queued window. No generation, extraction,
 * auth recovery, local summarizer, background draining or automatic miss/error retry.
 */
export function useImmersiveSummaryCache(
  options: ImmersiveSummaryCacheOptions,
): ImmersiveSummaryCacheState {
  const disabledReason = disabledReasonFor(options);
  const contextKey = JSON.stringify([
    options.enabled,
    options.userId,
    options.preferenceUserId,
    options.authUsable,
    options.scopeKey,
    options.provider,
    options.model,
  ]);
  const urls = selectImmersiveSummaryUrls(options.urls);
  const windowSignature = JSON.stringify(urls);
  const latest = useSyncedRef({
    contextKey,
    disabledReason,
    urls,
    requestAllowed: options.requestAllowed,
  });
  const sessionRef = useRef<CacheSession | null>(null);
  const generationRef = useRef(0);
  const [version, setVersion] = useState(0);
  const publish = useCallback(() => setVersion((value) => value + 1), []);

  // Reset only security/configuration partitions, never the scheduling gate or URL window.
  useEffect(() => {
    const session: CacheSession = {
      contextKey,
      active: true,
      hits: new Map(),
      checked: new Map(),
      pending: null,
    };
    sessionRef.current = session;
    publish();
    return () => {
      session.active = false;
      generationRef.current += 1;
      const pending = session.pending;
      if (pending) {
        releasePending(session, pending);
        pending.controller.abort();
      }
      session.hits.clear();
      session.checked.clear();
    };
  }, [contextKey, publish]);

  useEffect(() => {
    const session = sessionRef.current;
    if (
      !session?.active ||
      session.contextKey !== contextKey ||
      disabledReason ||
      !options.requestAllowed ||
      session.pending ||
      !isWorkersAiModelId(options.model)
    )
      return;
    const requested = urls.filter((url) => !session.hits.has(url) && !session.checked.has(url));
    if (!requested.length) return;
    const model = options.model;
    const pending: PendingRequest = {
      generation: ++generationRef.current,
      controller: new AbortController(),
      timeout: null,
    };
    session.pending = pending;
    for (const url of requested) session.checked.set(url, { kind: "loading" });
    const isCurrent = () =>
      session.active &&
      sessionRef.current === session &&
      latest.current.contextKey === contextKey &&
      session.pending === pending &&
      generationRef.current === pending.generation;
    const fail = (entry: Extract<CacheEntry, { kind: "error" }>) => {
      if (!isCurrent()) return;
      for (const url of requested) session.checked.set(url, entry);
      releasePending(session, pending);
      publish();
    };
    pending.timeout = setTimeout(() => {
      fail({ kind: "error", message: "保存済み要約の取得がタイムアウトしました" });
      pending.controller.abort();
    }, DEFAULT_FETCH_TIMEOUT_MS);
    publish();

    void (async () => {
      try {
        await getAuthReady();
        if (!isCurrent() || pending.controller.signal.aborted) return;
        // Hidden or replaced while auth was pending: send only the latest supplied window.
        // No read was sent, so these reserved URLs remain unchecked.
        if (
          !latest.current.requestAllowed ||
          JSON.stringify(latest.current.urls) !== windowSignature
        ) {
          for (const url of requested) session.checked.delete(url);
          releasePending(session, pending);
          publish();
          return;
        }
        const response = await fetch("/api/ai/summaries/cache", {
          method: "POST",
          mode: "same-origin",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, urls: requested }),
          signal: pending.controller.signal,
        });
        if (!isCurrent() || pending.controller.signal.aborted) {
          void response.body?.cancel().catch(() => {});
          return;
        }
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          throw new CacheReadError(
            `保存済み要約を取得できませんでした（HTTP ${response.status}）`,
            response.status,
          );
        }
        const text = await readResponseText(response, FEED_MAX_BYTES, DEFAULT_FETCH_TIMEOUT_MS);
        if (!isCurrent() || pending.controller.signal.aborted) return;
        const data = validateSummaryCacheResponse(JSON.parse(text) as unknown, model, requested);
        if (!isCurrent() || pending.controller.signal.aborted) return;
        for (const url of requested) session.checked.set(url, { kind: "miss" });
        for (const summary of data.summaries) {
          // A compact checked marker survives hit eviction and never becomes an automatic reread.
          session.checked.set(summary.url, { kind: "evicted" });
          session.hits.delete(summary.url);
          session.hits.set(summary.url, summary);
        }
        while (session.hits.size > MAX_HITS) {
          const oldest = session.hits.keys().next().value;
          if (oldest === undefined) break;
          session.hits.delete(oldest);
        }
        releasePending(session, pending);
        publish();
      } catch (error) {
        if (!isCurrent() || pending.controller.signal.aborted) return;
        fail({
          kind: "error",
          message: error instanceof Error ? error.message : "保存済み要約を取得できませんでした",
          ...(error instanceof CacheReadError && error.status !== undefined
            ? { status: error.status }
            : {}),
        });
      }
      // Never let an obsolete finally reset a newer request's loading state.
    })();
  }, [
    contextKey,
    disabledReason,
    windowSignature,
    options.requestAllowed,
    options.model,
    version,
    publish,
  ]);

  // The context tag hides old account data during render, before effect cleanup executes.
  const session =
    sessionRef.current?.active && sessionRef.current.contextKey === contextKey
      ? sessionRef.current
      : null;
  const entries = new Map<string, CacheEntry>();
  for (const url of urls)
    entries.set(
      url,
      disabledReason
        ? { kind: "disabled", reason: disabledReason }
        : session
          ? sessionEntry(session, url)
          : IDLE,
    );
  const getEntry = (url: string): CacheEntry => {
    if (!isValidFeedUrl(url))
      return { kind: "disabled", reason: "この記事のURLでは保存済み要約を利用できません" };
    return disabledReason
      ? { kind: "disabled", reason: disabledReason }
      : (entries.get(url) ?? IDLE);
  };
  const retry = useCallback(
    (url: string) => {
      // Capture the session identity: stale A callbacks cannot affect a later A→B→A session.
      if (
        !session?.active ||
        sessionRef.current !== session ||
        latest.current.contextKey !== contextKey ||
        latest.current.disabledReason ||
        !latest.current.requestAllowed ||
        session.pending ||
        !latest.current.urls.includes(url)
      )
        return;
      const entry = sessionEntry(session, url);
      if (entry.kind !== "miss" && entry.kind !== "error" && entry.kind !== "evicted") return;
      session.checked.delete(url);
      publish();
    },
    [session, contextKey, publish],
  );
  return {
    contextKey,
    disabledReason,
    loading: !disabledReason && !!session?.pending,
    entries,
    getEntry,
    retry,
  };
}
