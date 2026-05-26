"use client";

import { useState, useCallback, useRef, type FocusEvent, type KeyboardEvent } from "react";
import { useArticleFilter } from "../../contexts/ArticleFilterContext";
import { useSearchHistory } from "../../hooks/useSearchHistory";
import { useFullTextSearch } from "../../hooks/useFullTextSearch";

export default function SearchBar() {
  const { rawQuery, updateQuery, searchRef } = useArticleFilter();

  const { history, addToHistory, removeFromHistory } = useSearchHistory();
  const [showHistory, setShowHistory] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [savingName, setSavingName] = useState<string | null>(null);
  const saveNameInputRef = useRef<HTMLInputElement>(null);

  const { savedSearches, save: saveSearch, removeSaved } = useFullTextSearch();

  const handleSearchBlur = useCallback((e: FocusEvent) => {
    if (!searchContainerRef.current?.contains(e.relatedTarget as Node)) {
      setShowHistory(false);
    }
  }, []);

  const handleSearchKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        updateQuery("");
        searchRef.current?.blur();
        setShowHistory(false);
      } else if (e.key === "Enter" && rawQuery.trim().length >= 2) {
        addToHistory(rawQuery.trim());
        setShowHistory(false);
      }
    },
    [rawQuery, updateQuery, addToHistory, searchRef],
  );

  const applyHistoryItem = useCallback(
    (q: string) => {
      updateQuery(q);
      addToHistory(q);
      setShowHistory(false);
      searchRef.current?.focus();
    },
    [updateQuery, addToHistory, searchRef],
  );

  return (
    <div className="relative px-3 pb-2.5" ref={searchContainerRef} onBlur={handleSearchBlur}>
      <label htmlFor="article-search" className="sr-only">
        検索
      </label>
      <input
        id="article-search"
        ref={searchRef}
        type="search"
        inputMode="search"
        placeholder="検索... (/ でフォーカス、title:foo OR -bar 等)"
        value={rawQuery}
        onChange={(e) => updateQuery(e.target.value)}
        onKeyDown={handleSearchKeyDown}
        onFocus={() => {
          if (history.length > 0 || savedSearches.length > 0) setShowHistory(true);
        }}
        className="w-full text-[12px] bg-surface-base border border-border-default rounded-lg pl-2.5 pr-9 py-1.5 text-text-strong placeholder-text-faint outline-none focus:border-text-muted transition-colors duration-200"
      />
      {rawQuery.trim().length >= 2 && savingName === null && (
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            setSavingName(rawQuery.trim());
            setTimeout(() => saveNameInputRef.current?.select(), 0);
          }}
          className="absolute right-5 top-1/2 -translate-y-1/2 text-[10px] text-text-muted hover:text-text-strong transition-colors px-1.5 py-0.5"
          title="この検索条件を保存"
        >
          保存
        </button>
      )}
      {savingName !== null && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 flex items-center gap-1 bg-surface-elevated border border-border-default rounded-lg px-2 py-1.5 shadow-lg">
          <input
            ref={saveNameInputRef}
            type="text"
            value={savingName}
            onChange={(e) => setSavingName(e.target.value)}
            placeholder="保存名を入力"
            aria-label="検索を保存するための名前"
            className="flex-1 text-[11px] bg-transparent outline-none text-text-strong placeholder-text-faint"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (savingName.trim()) saveSearch(savingName.trim(), rawQuery.trim());
                setSavingName(null);
              } else if (e.key === "Escape") {
                setSavingName(null);
              }
            }}
            onBlur={() => setSavingName(null)}
          />
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              if (savingName.trim()) saveSearch(savingName.trim(), rawQuery.trim());
              setSavingName(null);
            }}
            className="text-[10px] px-2 py-0.5 bg-ink text-ink-text rounded-md hover:bg-ink-hover transition-colors flex-shrink-0"
          >
            保存
          </button>
        </div>
      )}
      {showHistory && (savedSearches.length > 0 || history.length > 0) && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden max-h-80 overflow-y-auto">
          {savedSearches.length > 0 && (
            <>
              <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
                保存済み
              </div>
              {savedSearches.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between px-2.5 py-1.5 hover:bg-surface-hover cursor-pointer group"
                >
                  <button
                    className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyHistoryItem(s.query);
                    }}
                    title={s.query}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-bookmark flex-shrink-0"
                    >
                      <path d="M3 1.5h6v9l-3-2-3 2z" />
                    </svg>
                    <span className="text-[11px] text-text-default truncate">{s.name}</span>
                  </button>
                  <button
                    className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded text-text-faint hover:text-text-muted transition-opacity flex-shrink-0"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      removeSaved(s.id);
                    }}
                    title="保存検索を削除"
                    aria-label="保存検索を削除"
                  >
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    >
                      <path d="M1 1l6 6M7 1L1 7" />
                    </svg>
                  </button>
                </div>
              ))}
              {history.length > 0 && (
                <div className="border-t border-border-subtle mt-1 px-2.5 pt-1.5 pb-1 text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
                  履歴
                </div>
              )}
            </>
          )}
          {history.map((q) => (
            <div
              key={q}
              className="flex items-center justify-between px-2.5 py-1.5 hover:bg-surface-hover cursor-pointer group"
            >
              <button
                className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyHistoryItem(q);
                }}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-text-faint flex-shrink-0"
                >
                  <circle cx="5" cy="5" r="3.5" />
                  <path d="M8 8l2.5 2.5" />
                </svg>
                <span className="text-[11px] text-text-default truncate">{q}</span>
              </button>
              <button
                className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded text-text-faint hover:text-text-muted transition-opacity flex-shrink-0"
                onMouseDown={(e) => {
                  e.preventDefault();
                  removeFromHistory(q);
                }}
                title="履歴から削除"
                aria-label="履歴から削除"
              >
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 8 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                >
                  <path d="M1 1l6 6M7 1L1 7" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
