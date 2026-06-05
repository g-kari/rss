export default function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5 bg-surface-subtle rounded-lg px-3 py-2">
      <span className="text-[10px] font-medium tracking-[0.15em] uppercase text-text-muted">
        {label}
      </span>
      <span className="text-[20px] font-light text-text-strong tabular-nums">{value}</span>
    </div>
  );
}
