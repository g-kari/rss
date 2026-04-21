"use client";

import { useState } from "react";
import type { Collection } from "@/types";

interface Props {
  articleId: string;
  collections: Collection[];
  onAdd: (collectionId: string, articleId: string) => Promise<void>;
  onRemove: (collectionId: string, articleId: string) => Promise<void>;
  onCreateNew: () => void;
}

export default function AddToCollectionMenu({
  articleId,
  collections,
  onAdd,
  onRemove,
  onCreateNew,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  const handleToggle = async (collection: Collection) => {
    if (busy) return;
    setBusy(collection.id);
    if (collection.articleIds.includes(articleId)) {
      await onRemove(collection.id, articleId);
    } else {
      await onAdd(collection.id, articleId);
    }
    setBusy(null);
  };

  return (
    <div className="py-1 min-w-[180px]">
      {collections.length === 0 && (
        <p className="px-3 py-2 text-[11px] text-text-muted">コレクションがありません</p>
      )}
      {collections.map((c) => {
        const isIn = c.articleIds.includes(articleId);
        return (
          <button
            key={c.id}
            onClick={() => handleToggle(c)}
            disabled={busy === c.id}
            className="w-full px-3 py-1.5 text-left text-[13px] flex items-center gap-2 hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            <span className="w-4 text-center text-text-muted">{isIn ? "✓" : ""}</span>
            <span className={isIn ? "text-text-strong" : "text-text-default"}>{c.name}</span>
          </button>
        );
      })}
      <div className="border-t border-border-subtle my-1" />
      <button
        onClick={onCreateNew}
        className="w-full px-3 py-1.5 text-left text-[13px] text-text-muted hover:text-text-strong hover:bg-surface-hover transition-colors flex items-center gap-2"
      >
        <span className="w-4 text-center">+</span>
        <span>新規コレクション</span>
      </button>
    </div>
  );
}
