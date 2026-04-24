"use client";

import { useEffect, useRef, useState } from "react";
import type { Collection } from "../types";
import CollectionModal from "./CollectionModal";

interface Props {
  articleId: string;
  collections: Collection[];
  onAdd: (collectionId: string, articleId: string) => Promise<void>;
  onRemove: (collectionId: string, articleId: string) => Promise<void>;
  onCreateNew?: (name: string) => Promise<Collection | { error: string }>;
}

export default function CollectionDropdown({
  articleId,
  collections,
  onAdd,
  onRemove,
  onCreateNew,
}: Props) {
  const [open, setOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const inCount = collections.filter((c) => c.articleIds.includes(articleId)).length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        title="コレクションに追加"
        className={`p-2 -m-2 lg:p-0 lg:m-0 transition-colors duration-200 ${
          inCount > 0 ? "text-indigo-400" : "text-text-faint hover:text-text-muted"
        }`}
      >
        <svg
          className="w-[18px] h-[18px] lg:w-[14px] lg:h-[14px]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          <line x1="12" y1="11" x2="12" y2="17" />
          <line x1="9" y1="14" x2="15" y2="14" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden min-w-[180px]">
          <div className="py-1">
            {collections.length === 0 && (
              <p className="px-3 py-2 text-[11px] text-text-muted">コレクションがありません</p>
            )}
            {collections.map((c) => {
              const isIn = c.articleIds.includes(articleId);
              return (
                <button
                  key={c.id}
                  onClick={async () => {
                    if (isIn) await onRemove(c.id, articleId);
                    else await onAdd(c.id, articleId);
                  }}
                  className="w-full px-3 py-1.5 text-left text-[13px] flex items-center gap-2 hover:bg-surface-hover transition-colors"
                >
                  <span className="w-4 text-center text-text-muted">{isIn ? "✓" : ""}</span>
                  <span className={isIn ? "text-text-strong" : "text-text-default"}>{c.name}</span>
                </button>
              );
            })}
            {onCreateNew && (
              <>
                <div className="border-t border-border-subtle my-1" />
                <button
                  onClick={() => {
                    setOpen(false);
                    setShowCreateModal(true);
                  }}
                  className="w-full px-3 py-1.5 text-left text-[13px] text-text-muted hover:text-text-strong hover:bg-surface-hover transition-colors flex items-center gap-2"
                >
                  <span className="w-4 text-center">+</span>
                  <span>新規コレクション</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {showCreateModal && onCreateNew && (
        <CollectionModal
          mode="create"
          onSubmit={async (name) => {
            const result = await onCreateNew(name);
            if ("error" in result) return result;
          }}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}
