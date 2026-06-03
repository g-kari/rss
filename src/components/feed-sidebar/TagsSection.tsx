"use client";

interface Props {
  sortedTags: [string, number][];
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
}

export default function TagsSection({ sortedTags, selectedTag, onSelectTag }: Props) {
  if (sortedTags.length === 0) return null;
  return (
    <div className="mt-1 pt-2 border-t border-border-subtle">
      <div className="px-4 pb-1 flex items-center">
        <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
          Tags
        </span>
      </div>
      {sortedTags.map(([tag, count]) => {
        const isSelected = selectedTag === tag;
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelectTag(isSelected ? null : tag)}
            className={`w-full px-4 py-1.5 flex items-center justify-between gap-2 text-left transition-colors ${
              isSelected
                ? "bg-surface-subtle text-text-strong"
                : "hover:bg-surface-hover text-text-muted hover:text-text-strong"
            }`}
            title={tag}
          >
            <span className="text-[13px] truncate">#{tag}</span>
            <span className="text-[11px] text-text-muted tabular-nums flex-shrink-0">
              {count > 99 ? "99+" : count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
