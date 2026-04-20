"use client";

import { useCallback, useRef, useState } from "react";
import { MAX_TAG_NAME_LENGTH, MAX_TAGS_PER_ARTICLE } from "../../lib/validation";

interface Props {
  articleId: string;
  tags: readonly string[];
  onAddTag: (articleId: string, tag: string) => void;
  onRemoveTag: (articleId: string, tag: string) => void;
}

/**
 * 記事に付与されたユーザータグの編集コンポーネント。
 * - 表示: #タグ のバッジ一覧（× ボタンで削除）
 * - 追加: + ボタンクリックで入力欄を開く → Enter で確定
 */
export default function TagEditor({ articleId, tags, onAddTag, onRemoveTag }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const canAdd = tags.length < MAX_TAGS_PER_ARTICLE;

  const commit = useCallback(() => {
    const v = draft.trim();
    if (v) onAddTag(articleId, v);
    setDraft("");
    setEditing(false);
  }, [draft, articleId, onAddTag]);

  return (
    <>
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-surface-subtle text-text-default"
        >
          <span>#{t}</span>
          <button
            type="button"
            onClick={() => onRemoveTag(articleId, t)}
            aria-label={`タグ「${t}」を削除`}
            className="text-text-muted hover:text-text-strong transition-colors leading-none"
          >
            ×
          </button>
        </span>
      ))}
      {editing ? (
        <input
          ref={inputRef}
          autoFocus
          type="text"
          value={draft}
          maxLength={MAX_TAG_NAME_LENGTH}
          placeholder="タグ名"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setDraft("");
              setEditing(false);
            }
          }}
          onBlur={commit}
          className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-subtle text-text-strong border border-border-default outline-none focus:border-text-muted w-24"
        />
      ) : (
        canAdd && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="タグを追加"
            className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-subtle text-text-muted hover:bg-surface-hover hover:text-text-default transition-colors"
          >
            + タグ
          </button>
        )
      )}
    </>
  );
}
