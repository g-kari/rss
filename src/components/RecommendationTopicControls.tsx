"use client";

import type { TopicPreference, TopicPreferenceValue } from "../lib/recommendation-topics";

interface Props {
  label: string;
  topic: string;
  preferences: TopicPreference[];
  onChange: (label: string, value: TopicPreferenceValue | null) => void;
}
const buttonClass =
  "min-h-11 rounded-lg border border-border-default px-3 text-[12px] text-text-default hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 aria-pressed:bg-selection-surface aria-pressed:text-selection-accent aria-disabled:opacity-50";

export default function RecommendationTopicControls({
  label,
  topic,
  preferences,
  onChange,
}: Props) {
  const selected = preferences.find((entry) => entry.topic === topic)?.value;
  return (
    <div role="group" aria-label={`${label}のおすすめ調整`} className="min-w-0 py-2">
      <p className="break-words text-[13px] font-medium text-text-strong">{label}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          aria-pressed={selected === "more"}
          aria-label={`${label}の話題を増やす`}
          onClick={() => onChange(label, "more")}
        >
          この話題を増やす
        </button>
        <button
          type="button"
          className={buttonClass}
          aria-pressed={selected === "less"}
          aria-label={`${label}の話題を減らす`}
          onClick={() => onChange(label, "less")}
        >
          この話題を減らす
        </button>
        <button
          type="button"
          className={buttonClass}
          aria-disabled={!selected}
          aria-label={`${label}の調整を解除`}
          onClick={() => {
            if (selected) onChange(label, null);
          }}
        >
          標準に戻す
        </button>
      </div>
      <p className="mt-1 text-[12px] text-text-muted">
        {selected === "more"
          ? "増やす設定"
          : selected === "less"
            ? "減らす設定（非表示にはしません）"
            : "標準"}
      </p>
    </div>
  );
}
