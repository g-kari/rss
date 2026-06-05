export default function StatBar({ value, max }: { value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="flex-1 h-1.5 bg-surface-subtle rounded-full overflow-hidden">
      <div
        className="h-full bg-ink rounded-full transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
