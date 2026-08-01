"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
 *
 * WCAG 2.4.3 (Focus Order): 編集モード終了 (Enter/Escape/blur) と ×
 * ボタンクリックによる要素 unmount で focus が document.body に落ちる
 * のを防ぐため、`+ タグ` ボタンに focus を復元する。
 */
export default function TagEditor({ articleId, tags, onAddTag, onRemoveTag }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const addButtonRef = useRef<HTMLButtonElement | null>(null);
  const prevEditingRef = useRef(editing);
  const canAdd = tags.length < MAX_TAGS_PER_ARTICLE;

  const commit = useCallback(() => {
    const v = draft.trim();
    if (v) onAddTag(articleId, v);
    setDraft("");
    setEditing(false);
  }, [draft, articleId, onAddTag]);

  // WCAG 2.4.3: 編集モード終了 (true → false 遷移) 時に `+ タグ` ボタンへ focus 復元。
  // `<input>` unmount 直後 `<button>` remount のタイミングで useEffect が commit 後に
  // 発火するため ref が populated 済で focus 可能。
  // 境界ケース (× onClick と共有): MAX-1 個の状態で入力 → commit() で MAX 到達 →
  // canAdd が false になり addButton unmount → addButtonRef が null で focus が body
  // に落ちる。common case (MAX 未達成での編集終了) はカバー。
  useEffect(() => {
    if (prevEditingRef.current && !editing) {
      addButtonRef.current?.focus();
    }
    prevEditingRef.current = editing;
  }, [editing]);

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
            onClick={() => {
              // WCAG 2.4.3: × ボタン unmount 前に `+ タグ` ボタンへ focus 移動。
              // canAdd が false (MAX 到達中) の境界ケースでは addButtonRef が null で focus
              // が body に落ちるが、common case (通常削除) はカバーする。
              addButtonRef.current?.focus();
              onRemoveTag(articleId, t);
            }}
            aria-label={`タグ「${t}」を削除`}
            className="max-md:min-w-[44px] max-md:min-h-[44px] lg:min-w-[24px] lg:min-h-[24px] inline-flex items-center justify-center text-text-muted hover:text-text-strong transition-colors leading-none"
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
          aria-label="新しいタグ名を入力"
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
            ref={addButtonRef}
            type="button"
            onClick={() => setEditing(true)}
            title="タグを追加"
            aria-label="タグを追加"
            className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-subtle text-text-muted hover:bg-surface-hover hover:text-text-default transition-colors"
          >
            + タグ
          </button>
        )
      )}
    </>
  );
}
