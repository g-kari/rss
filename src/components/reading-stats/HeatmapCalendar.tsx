import { useMemo, useState } from "react";
import { countToLevel } from "../../lib/reading-stats-level";

const LEVEL_CLASSES: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "bg-surface-subtle",
  1: "bg-ink opacity-20",
  2: "bg-ink opacity-40",
  3: "bg-ink opacity-70",
  4: "bg-ink",
};

const CELL = 11; // px (cell size + gap)

interface HeatmapCalendarProps {
  /** 365 日分の { date: "YYYY-MM-DD", count: number }[] (古い順) */
  data: { date: string; count: number }[];
}

/** グリッド構築時に level / dateLabel を事前計算したセル (tooltip hover の再 render で再計算しないため) */
type EnrichedCell = {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
  dateLabel: string;
} | null;

export default function HeatmapCalendar({ data }: HeatmapCalendarProps) {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  // data prop は親で安定 (drillStats / stats 由来) なので、グリッド構築 + 各セルの
  // level / dateLabel (Intl.toLocaleDateString) を data 変化時のみ計算する。
  // tooltip の setState では純粋な再 render のみになり、365 回の Intl 呼び出しが走らない。
  const { weeks, monthLabels, total } = useMemo(() => {
    const max = Math.max(...data.map((d) => d.count), 1);
    const total = data.reduce((sum, d) => sum + d.count, 0);

    // 日曜始まりで 53 週 × 7 日のグリッドを構築
    // data[0] が最も古い日なので、その曜日（UTC 日曜=0）に合わせてパディング
    const firstDow = new Date(data[0]!.date + "T00:00:00Z").getUTCDay(); // 0=Sun

    // グリッド配列: [週][曜日] = EnrichedCell (level / dateLabel 事前計算済) | null
    const weeks: EnrichedCell[][] = [];
    let week: EnrichedCell[] = Array(firstDow).fill(null);
    for (const entry of data) {
      week.push({
        date: entry.date,
        count: entry.count,
        level: countToLevel(entry.count, max),
        dateLabel: new Date(entry.date + "T00:00:00Z").toLocaleDateString("ja-JP", {
          month: "numeric",
          day: "numeric",
          timeZone: "UTC",
        }),
      });
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }

    // 月ラベル（各週の最初のセルから月が変わる箇所を検出）
    const monthLabels: { weekIdx: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((w, wi) => {
      const first = w.find((c) => c !== null);
      if (!first) return;
      const m = new Date(first.date + "T00:00:00Z").getUTCMonth();
      if (m !== lastMonth) {
        monthLabels.push({
          weekIdx: wi,
          label: new Date(first.date + "T00:00:00Z").toLocaleDateString("ja-JP", {
            month: "short",
            timeZone: "UTC",
          }),
        });
        lastMonth = m;
      }
    });

    return { weeks, monthLabels, total };
  }, [data]);

  return (
    <div
      className="relative overflow-x-auto"
      role="img"
      aria-label={`過去1年の読書アクティビティ ヒートマップ。合計 ${total} 件`}
    >
      {/* 月ラベル行 */}
      <div className="flex mb-1" style={{ paddingLeft: 0 }}>
        {weeks.map((_, wi) => {
          const lbl = monthLabels.find((m) => m.weekIdx === wi);
          return (
            <div key={wi} style={{ width: CELL, flexShrink: 0 }}>
              {lbl && <span className="text-[9px] text-text-faint leading-none">{lbl.label}</span>}
            </div>
          );
        })}
      </div>

      {/* グリッド本体（列 = 週、行 = 曜日） */}
      <div className="flex gap-[1px]">
        {weeks.map((w, wi) => (
          <div key={wi} className="flex flex-col gap-[1px]">
            {w.map((cell, di) => {
              if (!cell) {
                return <div key={di} style={{ width: 10, height: 10 }} />;
              }
              return (
                <div
                  key={di}
                  className={`rounded-[2px] cursor-default transition-opacity ${LEVEL_CLASSES[cell.level]}`}
                  style={{ width: 10, height: 10 }}
                  onMouseEnter={(e) => {
                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                    setTooltip({
                      text: `${cell.dateLabel}: ${cell.count} 件`,
                      x: rect.left + 5,
                      y: rect.top - 4,
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* ツールチップ（fixed position） */}
      {tooltip && (
        <div
          className="fixed z-50 px-2 py-1 text-[11px] text-ink-text bg-ink rounded shadow-sm pointer-events-none whitespace-nowrap"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
