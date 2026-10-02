"use client";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import {
  SETTINGS_CATEGORIES,
  normalizeSettingsQuery,
  searchSettings,
  type SettingDestination,
  type SettingsCategoryId,
} from "./settings-catalog";

interface Props {
  activeCategory: SettingsCategoryId;
  onCategoryChange: (category: SettingsCategoryId) => void;
  onSettingSelect: (setting: SettingDestination) => void;
}
export default function SettingsNavigation({
  activeCategory,
  onCategoryChange,
  onSettingSelect,
}: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const results = searchSettings(query);
  const searching = normalizeSettingsQuery(query).length > 0;
  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = SETTINGS_CATEGORIES.findIndex((category) => category.id === activeCategory);
    let next = -1;
    if (event.key === "ArrowRight") next = (current + 1) % SETTINGS_CATEGORIES.length;
    if (event.key === "ArrowLeft")
      next = (current + SETTINGS_CATEGORIES.length - 1) % SETTINGS_CATEGORIES.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = SETTINGS_CATEGORIES.length - 1;
    if (next < 0) return;
    event.preventDefault();
    onCategoryChange(SETTINGS_CATEGORIES[next].id);
    const tab = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next];
    tab?.focus();
    tab?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
  }
  return (
    <div
      data-settings-navigation
      className="sticky top-0 z-10 border-b border-border-default bg-surface-elevated"
    >
      <div className="px-4 pt-3 pb-2">
        <label htmlFor={searchId} className="text-[12px] font-medium text-text-default">
          設定を検索
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id={searchId}
            ref={inputRef}
            type="search"
            value={query}
            autoComplete="off"
            placeholder="例: 文字サイズ、TTL、音声"
            aria-describedby={`${searchId}-help`}
            aria-controls={`${searchId}-results`}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-border-default bg-surface-base px-3 py-2 text-[13px] text-text-default focus-visible:outline-2 focus-visible:outline-ink"
          />
          {query && (
            <button
              type="button"
              aria-label="設定検索をクリア"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="min-h-[44px] rounded-lg px-3 text-[12px] text-text-default hover:bg-surface-hover"
            >
              クリア
            </button>
          )}
        </div>
        <p id={`${searchId}-help`} className="mt-1 text-[12px] text-text-muted">
          項目名・説明・別名をこの画面内で検索します
        </p>
      </div>
      <div
        role="tablist"
        aria-label="設定カテゴリ"
        onKeyDown={handleTabKeyDown}
        className="flex overflow-x-auto"
      >
        {SETTINGS_CATEGORIES.map((category) => (
          <button
            key={category.id}
            id={`tab-${category.id}`}
            type="button"
            role="tab"
            aria-selected={activeCategory === category.id}
            aria-controls={`panel-${category.id}`}
            tabIndex={activeCategory === category.id ? 0 : -1}
            onClick={() => onCategoryChange(category.id)}
            className={`min-h-[44px] shrink-0 whitespace-nowrap px-4 py-2 text-[13px] focus-visible:outline-2 focus-visible:outline-ink ${activeCategory === category.id ? "selection-tab-current font-medium text-selection-accent" : "text-text-muted hover:bg-surface-hover hover:text-text-default"}`}
          >
            {category.label}
          </button>
        ))}
      </div>
      <div
        id={`${searchId}-results`}
        hidden={!searching}
        className="max-h-[28dvh] overflow-y-auto border-t border-border-subtle px-4 py-2"
      >
        <p role="status" className="pb-2 text-[12px] text-text-muted">
          {results.length
            ? `${results.length}件の設定`
            : "一致する設定がありません。短い言葉や別名で検索してください。"}
        </p>
        <ul className="space-y-1">
          {results.map((setting) => (
            <li key={setting.id}>
              <button
                type="button"
                aria-label={`${setting.label} ${SETTINGS_CATEGORIES.find((category) => category.id === setting.category)!.label}`}
                aria-describedby={`${searchId}-${setting.id}-description`}
                onClick={() => {
                  onSettingSelect(setting);
                  setQuery("");
                }}
                className="w-full rounded-lg px-3 py-2 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ink"
              >
                <span className="block text-[13px] font-medium text-text-default">
                  {setting.label}{" "}
                  <span className="ml-2 text-[12px] font-normal text-text-muted">
                    {
                      SETTINGS_CATEGORIES.find((category) => category.id === setting.category)!
                        .label
                    }
                  </span>
                </span>
                <span
                  id={`${searchId}-${setting.id}-description`}
                  className="mt-0.5 block text-[12px] text-text-muted"
                >
                  {setting.description}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
