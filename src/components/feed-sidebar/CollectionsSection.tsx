"use client";

import type { Collection } from "../../types";

interface Props {
  collections: Collection[];
  selectedCollectionId: string | null;
  onSelectCollection: (id: string | null) => void;
  onCreateCollection?: (name: string) => Promise<Collection | { error: string }>;
  loadError?: Error | null;
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
  if (collections.length === 0 && !loadError) return null;
  return (
    <div className="mt-1 pt-2 border-t border-border-subtle">
      <div className="px-4 pb-1 flex items-center">
        <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
          Collections
        </span>
        {loadError && onRetryCollections && (
          <button
            onClick={onRetryCollections}
            className="ml-auto text-[11px] text-text-muted hover:text-text-default px-2 py-1"
            title="再読み込み"
          >
            再試行
          </button>
        )}
        {!loadError && onCreateCollection && (
          <button
            onClick={() => onCreateCollection("")}
            className="ml-auto w-4 h-4 flex items-center justify-center rounded text-text-faint hover:text-text-default hover:bg-surface-subtle transition-all"
            title="コレクションを作成"
          >
            <svg
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
      {collections.map((c) => {
        const isSelected = selectedCollectionId === c.id;
        return (
          <button
            key={c.id}
            type="button"
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
