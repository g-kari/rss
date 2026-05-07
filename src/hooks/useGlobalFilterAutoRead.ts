"use client";

import { useEffect, useRef } from "react";
import type { Article, KeywordFilter } from "../types";
import { normalizeFilter, matchesKeywordFilter } from "../lib/keyword-filter";
import { useSyncedRef } from "./useSyncedRef";

/**
 * globalFilter に引っかかった記事（フィルターで非表示になる記事）を自動的に既読にする。
 * これにより未読カウントや未読フィルターに除外記事が混入するのを防ぐ。
 * 差分チェック: 前回チェック済み記事IDを保持し、新規追加分のみフィルタリングする。
 */
export function useGlobalFilterAutoRead(
  articles: Article[],
  globalFilter: KeywordFilter | null | undefined,
  readIds: Set<string>,
  markBulkRead: (ids: string[]) => void,
): void {
  const checkedArticleIdsRef = useRef<Set<string>>(new Set());
  const prevGlobalFilterRef = useRef(globalFilter);
  const readIdsRef = useSyncedRef(readIds);
  useEffect(() => {
    if (!globalFilter) return;
    if (prevGlobalFilterRef.current !== globalFilter) {
      checkedArticleIdsRef.current = new Set();
      prevGlobalFilterRef.current = globalFilter;
    }
    const normalized = normalizeFilter(globalFilter);
    const checked = checkedArticleIdsRef.current;
    const currentReadIds = readIdsRef.current;
    const newIds: string[] = [];
    for (const a of articles) {
      if (checked.has(a.id) || currentReadIds.has(a.id)) continue;
      if (!matchesKeywordFilter(a, normalized)) newIds.push(a.id);
    }
    if (newIds.length > 0) markBulkRead(newIds);
    for (const a of articles) checkedArticleIdsRef.current.add(a.id);
    // readIdsRef は useSyncedRef により常に最新値を参照するため deps 不要
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articles, globalFilter, markBulkRead]);
}
