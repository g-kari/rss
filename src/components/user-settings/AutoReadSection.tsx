"use client";

import { AUTO_READ_THRESHOLD_CYCLE } from "../../hooks/useAutoReadSettings";
import { SettingRow, SegmentGroup, ToggleSwitch } from "./shared";

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
        <ToggleSwitch
          checked={autoReadEnabled}
          onChange={() => toggleAutoRead()}
          ariaLabel={autoReadEnabled ? "自動既読を OFF にする" : "自動既読を ON にする"}
        />
        {autoReadEnabled && (
          <div data-setting-id="auto-read-threshold" tabIndex={-1} aria-label="自動既読タイミング">
            <SegmentGroup
              options={AUTO_READ_THRESHOLD_CYCLE.map((v) => ({ value: v, label: `${v}%` }))}
              value={autoReadThreshold}
              onChange={onChangeAutoReadThreshold}
              ariaLabel="自動既読タイミング"
            />
          </div>
        )}
      </div>
    </SettingRow>
  );
}
