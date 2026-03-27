"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Feed, KeywordFilter } from "../types";

interface Props {
  feed: Feed;
  onClose: () => void;
  onSave: (filter: KeywordFilter | null) => Promise<void>;
}

function TagInput({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || tags.includes(trimmed)) return;
      onChange([...tags, trimmed]);
      setInput("");
    },
    [tags, onChange],
  );

  const removeTag = useCallback(
    (index: number) => {
      onChange(tags.filter((_, i) => i !== index));
    },
    [tags, onChange],
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  }

  function handleBlur() {
    if (input.trim()) addTag(input);
  }

  return (
    <div
      className="min-h-[38px] flex flex-wrap gap-1 p-1.5 bg-surface-base border border-border-default rounded-lg cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-surface-subtle text-text-default text-[12px] rounded-md"
        >
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeTag(i);
            }}
            className="text-text-faint hover:text-text-default transition-colors"
            aria-label="削除"
          >
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <line x1="1" y1="1" x2="7" y2="7" />
              <line x1="7" y1="1" x2="1" y2="7" />
            </svg>
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[80px] bg-transparent text-[12px] text-text-strong placeholder-text-faint outline-none"
      />
    </div>
  );
}

export default function FeedFilterModal({ feed, onClose, onSave }: Props) {
  const [include, setInclude] = useState<string[]>(feed.filter?.include ?? []);
  const [exclude, setExclude] = useState<string[]>(feed.filter?.exclude ?? []);
  const [matchCategories, setMatchCategories] = useState<boolean>(
    feed.filter?.matchCategories ?? false,
  );
  const [saving, setSaving] = useState(false);

  // Escape で閉じる
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSave() {
    setSaving(true);
    try {
      const hasFilter = include.length > 0 || exclude.length > 0;
      if (!hasFilter) {
        await onSave(null);
      } else {
        const filter: KeywordFilter = { include, exclude };
        if (matchCategories) filter.matchCategories = true;
        await onSave(filter);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      await onSave(null);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const hasFilter =
    feed.filter && (feed.filter.include.length > 0 || feed.filter.exclude.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-surface-elevated border border-border-default rounded-xl shadow-xl w-[400px] max-w-[calc(100vw-2rem)] p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[13px] font-medium text-text-strong">キーワードフィルター</h2>
            <p className="text-[11px] text-text-muted mt-0.5 truncate max-w-[280px]">
              {feed.title || feed.url}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-text-faint hover:text-text-default transition-colors rounded"
            aria-label="閉じる"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <line x1="1" y1="1" x2="11" y2="11" />
              <line x1="11" y1="1" x2="1" y2="11" />
            </svg>
          </button>
        </div>

        {/* 含むキーワード */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium text-text-muted uppercase tracking-[0.1em]">
            含むキーワード
            <span className="ml-1 font-normal normal-case text-text-faint">
              （いずれかにマッチで表示）
            </span>
          </label>
          <TagInput tags={include} onChange={setInclude} placeholder="Enter または , で追加" />
        </div>

        {/* 除外キーワード */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium text-text-muted uppercase tracking-[0.1em]">
            除外キーワード
            <span className="ml-1 font-normal normal-case text-text-faint">
              （いずれかにマッチで非表示）
            </span>
          </label>
          <TagInput tags={exclude} onChange={setExclude} placeholder="Enter または , で追加" />
        </div>

        {/* カテゴリも対象 */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={matchCategories}
            onChange={(e) => setMatchCategories(e.target.checked)}
            className="w-3.5 h-3.5 rounded accent-text-strong"
          />
          <span className="text-[12px] text-text-default">カテゴリタグも対象にする</span>
        </label>

        {/* ボタン */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex-1 py-2 text-[12px] tracking-[0.04em] bg-ink hover:bg-ink-hover text-ink-text rounded-lg transition-all duration-200 disabled:opacity-40"
          >
            {saving ? "保存中..." : "保存"}
          </button>
          {hasFilter && (
            <button
              onClick={() => void handleClear()}
              disabled={saving}
              className="px-4 py-2 text-[12px] text-text-muted hover:text-text-default hover:bg-surface-subtle rounded-lg transition-all duration-200 disabled:opacity-40"
            >
              クリア
            </button>
          )}
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-[12px] text-text-muted hover:text-text-default hover:bg-surface-subtle rounded-lg transition-all duration-200 disabled:opacity-40"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
