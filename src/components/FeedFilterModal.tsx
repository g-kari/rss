"use client";

import { useState, useRef, useCallback, type KeyboardEvent } from "react";
import type { Feed, KeywordFilter } from "../types";
import Modal from "./Modal";

interface Props {
  feed?: Feed | null;
  /** feed が null のとき使用するタイトル */
  title?: string;
  /** feed が null のとき使用する初期フィルター値 */
  initialFilter?: KeywordFilter | null;
  onClose: () => void;
  onSave: (filter: KeywordFilter | null) => void | Promise<void>;
}

function TagInput({
  tags,
  onChange,
  placeholder,
  id,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  id?: string;
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

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
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
      {tags.map((tag, i) => {
        const isRegex = tag.startsWith("/") && tag.endsWith("/") && tag.length > 2;
        return (
          <span
            key={i}
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-[12px] rounded-md ${isRegex ? "bg-surface-subtle text-text-soft font-mono ring-1 ring-border-default" : "bg-surface-subtle text-text-default"}`}
            title={isRegex ? "正規表現" : undefined}
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
        );
      })}
      <input
        ref={inputRef}
        id={id}
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

export default function FeedFilterModal({ feed, title, initialFilter, onClose, onSave }: Props) {
  const activeFilter = feed?.filter ?? initialFilter ?? null;
  const [include, setInclude] = useState<string[]>(activeFilter?.include ?? []);
  const [exclude, setExclude] = useState<string[]>(activeFilter?.exclude ?? []);
  const [matchCategories, setMatchCategories] = useState<boolean>(
    activeFilter?.matchCategories ?? false,
  );
  const [saving, setSaving] = useState(false);

  async function doSave(filter: KeywordFilter | null) {
    setSaving(true);
    try {
      await onSave(filter);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const hasFilter = include.length > 0 || exclude.length > 0;

  function handleSave() {
    const filter: KeywordFilter | null = hasFilter
      ? { include, exclude, ...(matchCategories ? { matchCategories: true } : {}) }
      : null;
    return doSave(filter);
  }

  const modalTitle = title ?? "キーワードフィルター";
  const modalSubtitle = feed ? feed.title || feed.url : "すべてのフィード";

  return (
    <Modal title={modalTitle} subtitle={modalSubtitle} onClose={onClose} width="sm:w-[400px]">
      <div className="p-5 flex flex-col gap-4">
        {/* 含むキーワード */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="feed-filter-include"
            className="text-[11px] font-medium text-text-muted uppercase tracking-[0.1em]"
          >
            含むキーワード
            <span className="ml-1 font-normal normal-case text-text-faint">
              （いずれかにマッチで表示）
            </span>
          </label>
          <TagInput
            id="feed-filter-include"
            tags={include}
            onChange={setInclude}
            placeholder="Enter または , で追加"
          />
        </div>

        {/* 除外キーワード */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="feed-filter-exclude"
            className="text-[11px] font-medium text-text-muted uppercase tracking-[0.1em]"
          >
            除外キーワード
            <span className="ml-1 font-normal normal-case text-text-faint">
              （いずれかにマッチで非表示）
            </span>
          </label>
          <TagInput
            id="feed-filter-exclude"
            tags={exclude}
            onChange={setExclude}
            placeholder="Enter または , で追加"
          />
        </div>

        {/* 正規表現ヒント */}
        <p className="text-[11px] text-text-faint leading-relaxed -mt-1">
          <span className="font-mono text-text-muted">/pattern/</span> 形式で正規表現が使えます（例:{" "}
          <span className="font-mono text-text-muted">/Apple|Google/</span>）
        </p>

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
              onClick={() => void doSave(null)}
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
    </Modal>
  );
}
