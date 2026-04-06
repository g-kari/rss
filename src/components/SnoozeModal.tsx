"use client";

import Modal from "./Modal";

interface SnoozeOption {
  label: string;
  sublabel: string;
  durationMs: number;
}

function buildOptions(): SnoozeOption[] {
  const now = new Date();

  const tonight = new Date(now);
  tonight.setHours(22, 0, 0, 0);
  if (tonight <= now) tonight.setDate(tonight.getDate() + 1);

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(8, 0, 0, 0);

  const nextMonday = new Date(now);
  const daysUntilMonday = (8 - nextMonday.getDay()) % 7 || 7;
  nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
  nextMonday.setHours(8, 0, 0, 0);

  return [
    {
      label: "1時間後",
      sublabel: formatTime(new Date(now.getTime() + 60 * 60 * 1000)),
      durationMs: 60 * 60 * 1000,
    },
    {
      label: "3時間後",
      sublabel: formatTime(new Date(now.getTime() + 3 * 60 * 60 * 1000)),
      durationMs: 3 * 60 * 60 * 1000,
    },
    {
      label: "今夜",
      sublabel: formatTime(tonight),
      durationMs: tonight.getTime() - now.getTime(),
    },
    {
      label: "明日の朝",
      sublabel: formatDateTime(tomorrow),
      durationMs: tomorrow.getTime() - now.getTime(),
    },
    {
      label: "来週",
      sublabel: formatDateTime(nextMonday),
      durationMs: nextMonday.getTime() - now.getTime(),
    },
  ];
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(d: Date): string {
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${d.getMonth() + 1}/${d.getDate()}(${weekdays[d.getDay()]}) ${formatTime(d)}`;
}

interface Props {
  articleTitle: string;
  onSnooze: (durationMs: number) => void;
  onClose: () => void;
}

export default function SnoozeModal({ articleTitle, onSnooze, onClose }: Props) {
  const options = buildOptions();

  return (
    <Modal title="スヌーズ" subtitle={articleTitle} onClose={onClose} width="sm:w-[320px]">
      <div className="py-1">
        {options.map((opt) => (
          <button
            key={opt.label}
            onClick={() => {
              onSnooze(opt.durationMs);
              onClose();
            }}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface-hover transition-colors text-left"
          >
            <span className="text-[13px] text-text-strong">{opt.label}</span>
            <span className="text-[11px] text-text-muted tabular-nums">{opt.sublabel}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
