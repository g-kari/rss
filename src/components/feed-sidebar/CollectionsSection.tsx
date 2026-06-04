"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Collection, CollectionSortBy } from "../../types";
import {
  COLLECTION_SORT_BY_CYCLE,
  COLLECTION_SORT_BY_LABELS,
  sortCollectionsBy,
} from "../../lib/sort-utils";
import { STORAGE_KEYS, loadStoredEnum, storageSet } from "../../lib/storage";
import { cycleValue } from "../../lib/article-utils";

interface Props {
  collections: Collection[];
  selectedCollectionId: string | null;
  onSelectCollection: (id: string | null) => void;
  onCreateCollection?: (name: string) => Promise<Collection | { error: string }>;
  loadError?: string | null;
  onRetryCollections?: () => void;
}

export default function CollectionsSection({
  collections,
  selectedCollectionId,
  onSelectCollection,
  onCreateCollection,
  loadError,
  onRetryCollections,
}: Props) {
  const [sortBy, setSortBy] = useState<CollectionSortBy>(() =>
    loadStoredEnum(STORAGE_KEYS.COLLECTION_SORT_BY, COLLECTION_SORT_BY_CYCLE, "order"),
  );
  const cycleSortBy = useCallback(() => {
    setSortBy((prev) => {
      const next = cycleValue(COLLECTION_SORT_BY_CYCLE, prev);
      storageSet(STORAGE_KEYS.COLLECTION_SORT_BY, next);
      return next;
    });
  }, []);
  // 1 件以下なら sort 切替は実用上無意味
  const showSortButton = collections.length >= 2 && !loadError;
  // collections 入力 or sortBy 変化時のみ再計算
  const displayCollections = useMemo(
    () => sortCollectionsBy(collections, sortBy),
    [collections, sortBy],
  );

  // SSR / hydration mismatch 回避: 初回 render は localStorage 値で初期化済のためそのまま使う
  useEffect(() => {
    // hot reload で別タブ変更を取り込む (StorageEvent 簡易対応、低頻度操作なので polling 不要)
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEYS.COLLECTION_SORT_BY || e.newValue === null) return;
      const next = loadStoredEnum(
        STORAGE_KEYS.COLLECTION_SORT_BY,
        COLLECTION_SORT_BY_CYCLE,
        "order",
      );
      setSortBy(next);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  if (collections.length === 0 && !loadError) return null;
  return (
    <div className="mt-1 pt-2 border-t border-border-subtle">
      <div className="px-4 pb-1 flex items-center gap-1">
        <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
          Collections
        </span>
        {showSortButton && (
          <button
            onClick={cycleSortBy}
            aria-label={`コレクション並び順: ${COLLECTION_SORT_BY_LABELS[sortBy]} (クリックで切替)`}
            title={`並び順: ${COLLECTION_SORT_BY_LABELS[sortBy]}`}
            className="ml-auto w-4 h-4 flex items-center justify-center rounded text-text-faint hover:text-text-default hover:bg-surface-subtle transition-all"
          >
            <svg
              aria-hidden="true"
              width="9"
              height="9"
              viewBox="0 0 9 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 1.5h5M2.5 4.5h4M3 7.5h3" />
            </svg>
          </button>
        )}
        {loadError && onRetryCollections && (
          <button
            onClick={onRetryCollections}
            className={`${showSortButton ? "" : "ml-auto"} text-[11px] text-text-muted hover:text-text-default px-2 py-1`}
            title="再読み込み"
          >
            再試行
          </button>
        )}
        {!loadError && onCreateCollection && (
          <button
            onClick={() => onCreateCollection("")}
            className={`${showSortButton ? "" : "ml-auto"} w-4 h-4 flex items-center justify-center rounded text-text-faint hover:text-text-default hover:bg-surface-subtle transition-all`}
            aria-label="コレクションを作成"
            title="コレクションを作成"
          >
            <svg
              aria-hidden="true"
              width="9"
              height="9"
              viewBox="0 0 9 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <line x1="4.5" y1="1" x2="4.5" y2="8" strokeLinecap="round" />
              <line x1="1" y1="4.5" x2="8" y2="4.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      {displayCollections.map((c) => {
        const isSelected = selectedCollectionId === c.id;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelectCollection(isSelected ? null : c.id)}
            className={`w-full px-4 py-1.5 flex items-center justify-between gap-2 text-left transition-colors ${
              isSelected
                ? "bg-surface-subtle text-text-strong"
                : "hover:bg-surface-hover text-text-muted hover:text-text-strong"
            }`}
            title={c.name}
          >
            <span className="text-[13px] truncate">{c.name}</span>
            <span className="text-[11px] text-text-muted tabular-nums flex-shrink-0">
              {c.articleIds.length > 99 ? "99+" : c.articleIds.length}
            </span>
          </button>
        );
      })}
    </div>
  );
}
