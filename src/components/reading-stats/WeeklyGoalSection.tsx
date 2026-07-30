import { useRef, useState, type KeyboardEvent } from "react";
import { storageGet, storageSet, STORAGE_KEYS } from "../../lib/storage";

const DEFAULT_WEEKLY_GOAL = 20;

export default function WeeklyGoalSection({ weeklyTotal }: { weeklyTotal: number }) {
  const [goal, setGoal] = useState<number>(() => {
    const stored = storageGet(STORAGE_KEYS.WEEKLY_GOAL);
    const parsed = stored ? parseInt(stored, 10) : NaN;
    return isNaN(parsed) || parsed <= 0 ? DEFAULT_WEEKLY_GOAL : parsed;
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const pct = Math.min(Math.round((weeklyTotal / goal) * 100), 100);
  const achieved = weeklyTotal >= goal;

  function startEdit() {
    setDraft(String(goal));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitEdit() {
    const n = parseInt(draft, 10);
    if (!isNaN(n) && n > 0) {
      setGoal(n);
      storageSet(STORAGE_KEYS.WEEKLY_GOAL, String(n));
    }
    setEditing(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") setEditing(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
          週間目標
        </span>
        <div className="flex items-center gap-1 text-[11px] tabular-nums">
          <span className={achieved ? "text-accent-dot font-medium" : "text-text-default"}>
            {weeklyTotal}
          </span>
          <span className="text-text-faint">/</span>
          {editing ? (
            <input
              ref={inputRef}
              type="number"
              min={1}
              aria-label="週間目標（件）"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              className="w-10 bg-surface-subtle text-text-strong rounded px-1 text-center text-[11px] outline-none border border-border-default focus:border-ink"
            />
          ) : (
            <button
              onClick={startEdit}
              className="text-text-muted hover:text-text-strong transition-colors cursor-text"
              title="目標を変更"
              aria-label={`週間目標: ${goal} 件（クリックして変更）`}
            >
              {goal}
            </button>
          )}
          <span className="text-text-faint ml-0.5">件</span>
          {achieved && (
            <span className="ml-1 text-accent-dot" title="達成！">
              ✓
            </span>
          )}
        </div>
      </div>
      <div className="h-1.5 bg-surface-subtle rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor: achieved ? "var(--color-accent-dot)" : "var(--color-ink)",
          }}
        />
      </div>
      <span className="text-[10px] text-text-faint text-right tabular-nums">{pct}%</span>
    </div>
  );
}
