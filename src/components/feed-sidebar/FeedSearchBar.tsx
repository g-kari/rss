"use client";

import { useRef } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function FeedSearchBar({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="px-3 py-2 border-b border-border-subtle">
      <div className="flex items-center gap-2 px-2 py-1.5 bg-surface-subtle rounded-md border border-border-subtle focus-within:border-border-default transition-colors duration-200">
        <svg
          width="11"
          height="11"
          viewBox="0 0 11 11"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-text-faint flex-shrink-0"
        >
          <circle cx="4.5" cy="4.5" r="3" />
          <line x1="7" y1="7" x2="10" y2="10" strokeLinecap="round" />
        </svg>
        <label htmlFor="feed-search-input" className="sr-only">
          フィードを検索
        </label>
        <input
          ref={inputRef}
          id="feed-search-input"
          type="text"
          placeholder="フィードを検索..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              onChange("");
              inputRef.current?.blur();
            }
          }}
          className="flex-1 bg-transparent text-[12px] text-text-default placeholder:text-text-faint outline-none min-w-0"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            className="flex-shrink-0 text-text-faint hover:text-text-muted transition-colors duration-150"
            aria-label="検索をクリア"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <line x1="2" y1="2" x2="8" y2="8" />
              <line x1="8" y1="2" x2="2" y2="8" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
