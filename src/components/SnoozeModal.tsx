"use client";

import { useEffect, useMemo, useState } from "react";
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
  /**
   * #748: snooze で article が DOM から消えた場合のフォーカス復元先。
   * Modal の returnFocusRef は `document.contains` ガードで silent skip するため、
   * 本 prop で呼び出し元が snooze trigger 時に snapshot した安定 element を渡すと
   * unmount 時に確実にフォーカスが戻る (WCAG 2.4.3 Focus Order)。
   */
  returnFocusEl?: HTMLElement | null;
}

/**
 * `<input type="datetime-local">` の min 属性用に「現在時刻 (ローカル)」を
 * `YYYY-MM-DDTHH:mm` 形式で返す純粋関数。タイムゾーン情報は datetime-local が
 * ローカル前提なので含めない (`d.toISOString()` を使うと UTC にズレるため避ける)。
 */
function formatLocalDateTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SnoozeModal({ articleTitle, onSnooze, onClose, returnFocusEl }: Props) {
  const options = buildOptions();
  const [customDateTime, setCustomDateTime] = useState("");
  // min 属性 (datetime-local) を 1 度だけ計算して安定化 (毎 render の "now" 揺らぎ防止)
  const minDateTime = useMemo(() => formatLocalDateTimeInput(new Date()), []);
  const customMs = customDateTime ? new Date(customDateTime).getTime() - Date.now() : 0;
  const customValid = customDateTime !== "" && customMs > 0;

  // #748: snooze 完了で article が DOM から消えると Modal の returnFocusRef は silent skip するため、
  // 呼び出し元から渡された安定 element に明示的にフォーカスを戻す (Modal cleanup の後で実行)。
  useEffect(() => {
    return () => {
      if (returnFocusEl && document.contains(returnFocusEl)) {
        returnFocusEl.focus();
      }
    };
  }, [returnFocusEl]);

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
        <div className="border-t border-border-subtle mt-2 pt-3 px-4 pb-3 flex flex-col gap-2">
          <label className="text-[11px] text-text-muted tracking-wide" htmlFor="snooze-custom-dt">
            カスタム日時
          </label>
          <input
            id="snooze-custom-dt"
            type="datetime-local"
            value={customDateTime}
            min={minDateTime}
            onChange={(e) => setCustomDateTime(e.target.value)}
            className="w-full px-2 py-1.5 text-[13px] bg-surface-subtle text-text-strong border border-border-default rounded-md focus:outline-none focus:border-ink"
          />
          <button
            onClick={() => {
              if (!customValid) return;
              onSnooze(customMs);
              onClose();
            }}
            disabled={!customValid}
            className="w-full px-3 py-1.5 text-[12px] bg-ink text-ink-text rounded-md hover:bg-ink-hover disabled:bg-surface-subtle disabled:text-text-faint transition-colors"
          >
            この日時までスヌーズ
          </button>
        </div>
      </div>
    </Modal>
  );
}
