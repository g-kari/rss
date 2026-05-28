"use client";

import { AUTO_READ_THRESHOLD_CYCLE } from "../../hooks/useAutoReadSettings";
import { SettingRow, SegmentGroup } from "./shared";

interface AutoReadSectionProps {
  autoReadEnabled: boolean;
  toggleAutoRead: () => void;
  autoReadThreshold: (typeof AUTO_READ_THRESHOLD_CYCLE)[number];
  onChangeAutoReadThreshold: (v: (typeof AUTO_READ_THRESHOLD_CYCLE)[number]) => void;
}

export default function AutoReadSection({
  autoReadEnabled,
  toggleAutoRead,
  autoReadThreshold,
  onChangeAutoReadThreshold,
}: AutoReadSectionProps) {
  return (
    <SettingRow label="自動既読">
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={autoReadEnabled}
          aria-label={autoReadEnabled ? "自動既読を OFF にする" : "自動既読を ON にする"}
          onClick={toggleAutoRead}
          className={`relative h-6 w-11 rounded-full transition-colors duration-150 ${
            autoReadEnabled ? "bg-ink" : "bg-border-default"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-surface-elevated shadow transition-transform duration-150 ${
              autoReadEnabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
        {autoReadEnabled && (
          <SegmentGroup
            options={AUTO_READ_THRESHOLD_CYCLE.map((v) => ({ value: v, label: `${v}%` }))}
            value={autoReadThreshold}
            onChange={onChangeAutoReadThreshold}
            ariaLabel="自動既読タイミング"
          />
        )}
      </div>
    </SettingRow>
  );
}
