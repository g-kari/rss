"use client";

import {
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
  Fragment,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { useArticleFilter } from "../../contexts/ArticleFilterContext";
import { useSearchHistory } from "../../hooks/useSearchHistory";
import { useFullTextSearch } from "../../hooks/useFullTextSearch";

// listbox に並べる候補項目の型。saved (保存済み検索) と history (履歴)
// の 2 source を kind で区別して 1 つの index で管理する。
type SuggestionItem =
  | { kind: "saved"; id: string; name: string; query: string }
  | { kind: "history"; query: string };

export default function SearchBar() {
  const { rawQuery, updateQuery, searchRef } = useArticleFilter();

  const { history, addToHistory, removeFromHistory } = useSearchHistory();
  const [showHistory, setShowHistory] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const [savingName, setSavingName] = useState<string | null>(null);
  const saveNameInputRef = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState(0);

  const { savedSearches, save: saveSearch, removeSaved } = useFullTextSearch();

  // saved → history の順で flatten。Arrow キーは uniform な index で管理する。
  const items = useMemo<SuggestionItem[]>(
    () => [
      ...savedSearches.map((s) => ({
        kind: "saved" as const,
        id: s.id,
        name: s.name,
        query: s.query,
      })),
      ...history.map((q) => ({ kind: "history" as const, query: q })),
    ],
    [savedSearches, history],
  );

  // 候補数が変化したとき cursor を range 内に clamp。dropdown を閉じたら 0 に戻す。
  useEffect(() => {
    if (!showHistory) {
      setCursor(0);
      return;
    }
    if (items.length === 0) {
      setCursor(0);
    } else if (cursor > items.length - 1) {
      setCursor(items.length - 1);
    }
  }, [items.length, showHistory, cursor]);

  // ハイライト中の option を viewport 内に保つ (FeedQuickSwitchModal 同パターン)。
  useEffect(() => {
    if (!showHistory) return;
    const el = listboxRef.current?.querySelector<HTMLElement>(`#search-suggestion-${cursor}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor, showHistory]);

  const handleSearchBlur = useCallback((e: FocusEvent) => {
    if (!searchContainerRef.current?.contains(e.relatedTarget as Node)) {
      setShowHistory(false);
    }
  }, []);

  const applyHistoryItem = useCallback(
    (q: string) => {
      updateQuery(q);
      addToHistory(q);
      setShowHistory(false);
      searchRef.current?.focus();
    },
    [updateQuery, addToHistory, searchRef],
  );

  const listboxOpen = showHistory && items.length > 0;

  const handleSearchKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        // dropdown が開いていれば閉じるだけ、閉じていれば query を clear + blur (旧挙動)。
        if (showHistory) {
          setShowHistory(false);
        } else {
          updateQuery("");
          searchRef.current?.blur();
        }
        return;
      }
      if (listboxOpen) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setCursor((c) => (c < items.length - 1 ? c + 1 : 0));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setCursor((c) => (c > 0 ? c - 1 : items.length - 1));
          return;
        }
        if (e.key === "Home") {
          e.preventDefault();
          setCursor(0);
          return;
        }
        if (e.key === "End") {
          e.preventDefault();
          setCursor(items.length - 1);
          return;
        }
        if (e.key === "Enter") {
          const item = items[cursor];
          if (item) {
            e.preventDefault();
            applyHistoryItem(item.query);
            return;
          }
        }
        // Shift+Delete でハイライト中の候補を削除 (WCAG 2.1.1: マウス hover の
        // 削除アイコンと等価のキーボード操作。Chrome / Firefox のオートコンプリート
        // 候補削除と同 convention。Shift 併用で text 編集の Delete と衝突回避)。
        if (e.key === "Delete" && e.shiftKey) {
          const item = items[cursor];
          if (item) {
            e.preventDefault();
            if (item.kind === "saved") {
              removeSaved(item.id);
            } else {
              removeFromHistory(item.query);
            }
            return;
          }
        }
      }
      if (e.key === "Enter" && rawQuery.trim().length >= 2) {
        addToHistory(rawQuery.trim());
        setShowHistory(false);
      }
    },
    [
      rawQuery,
      updateQuery,
      addToHistory,
      searchRef,
      showHistory,
      listboxOpen,
      items,
      cursor,
      applyHistoryItem,
      removeSaved,
      removeFromHistory,
    ],
  );

  const activeDescendantId = listboxOpen ? `search-suggestion-${cursor}` : undefined;
  const savedCount = savedSearches.length;

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
        // WAI-ARIA combobox pattern: input を combobox として宣言し、
        // listbox を aria-controls で関連付け、現在ハイライト中の option を
        // aria-activedescendant で screen reader に通知する (FeedQuickSwitchModal 同パターン)。
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={listboxOpen}
        aria-haspopup="listbox"
        aria-controls={listboxOpen ? "search-suggestion-listbox" : undefined}
        aria-activedescendant={activeDescendantId}
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
      {listboxOpen && (
        // WAI-ARIA listbox: option は listbox の直接子である必要がある (ui-rendering.md 規範)。
        // semantic HTML (div) + ARIA role (listbox) を直交させ、ownership chain を
        // <button role="option"> 直配置で確立する (FeedQuickSwitchModal 同パターン)。
        // セクションラベル (保存済み / 履歴) は role="presentation" で ARIA tree から除外し
        // listbox → option の親子関係を切らない。削除アイコンは <button> の中に置けないため
        // role="presentation" の span に onMouseDown を載せて option クリックと区別する。
        <div
          ref={listboxRef}
          id="search-suggestion-listbox"
          role="listbox"
          aria-label="検索候補"
          className="absolute z-20 left-0 right-0 mt-1 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden max-h-80 overflow-y-auto"
        >
          {savedCount > 0 && (
            <div
              role="presentation"
              className="px-2.5 pt-1.5 pb-1 text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted"
            >
              保存済み
            </div>
          )}
          {items.map((item, i) => {
            const isActive = i === cursor;
            const optionId = `search-suggestion-${i}`;
            // history の先頭 (= saved の直後) に区切りラベルを挟む。
            const isHistorySectionStart =
              item.kind === "history" && savedCount > 0 && i === savedCount;
            const removeLabel = item.kind === "saved" ? "保存検索を削除" : "履歴から削除";
            return (
              <Fragment key={item.kind === "saved" ? `s:${item.id}` : `h:${item.query}`}>
                {isHistorySectionStart && (
                  <div
                    role="presentation"
                    className="border-t border-border-subtle mt-1 px-2.5 pt-1.5 pb-1 text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted"
                  >
                    履歴
                  </div>
                )}
                <button
                  id={optionId}
                  role="option"
                  aria-selected={isActive}
                  type="button"
                  tabIndex={-1}
                  className={`group w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 text-left cursor-pointer ${
                    isActive ? "bg-surface-subtle" : "hover:bg-surface-hover"
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyHistoryItem(item.query);
                  }}
                  onMouseEnter={() => setCursor(i)}
                  title={item.kind === "saved" ? item.query : undefined}
                >
                  <span className="flex items-center gap-1.5 flex-1 min-w-0">
                    {item.kind === "saved" ? (
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
                    ) : (
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
                    )}
                    <span className="text-[11px] text-text-default truncate">
                      {item.kind === "saved" ? item.name : item.query}
                    </span>
                  </span>
                  {/* nested <button> は HTML5 spec で非推奨 (interactive content nesting)。
                      role="presentation" の span に onMouseDown を載せ、option クリックと
                      区別する。stopPropagation で親 button の onMouseDown を発火させない。
                      キーボード操作は input の Shift+Delete で等価提供 (WCAG 2.1.1、handleSearchKeyDown)。 */}
                  <span
                    role="presentation"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (item.kind === "saved") {
                        removeSaved(item.id);
                      } else {
                        removeFromHistory(item.query);
                      }
                    }}
                    aria-label={removeLabel}
                    title={removeLabel}
                    className="opacity-0 group-hover:opacity-100 w-4 h-4 inline-flex items-center justify-center rounded text-text-faint hover:text-text-muted transition-opacity flex-shrink-0"
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
                  </span>
                </button>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
