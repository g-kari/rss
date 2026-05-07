"use client";

import { type ReactNode } from "react";

export default function FooterIconButton({
  onClick,
  onContextMenu,
  title,
  disabled,
  className = "text-text-faint hover:text-text-muted transition-colors duration-200 flex-shrink-0",
  children,
}: {
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  title: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      disabled={disabled}
      className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink ${className}${disabled ? " disabled:opacity-40" : ""}`}
      title={title}
      aria-label={title}
    >
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        {children}
      </svg>
    </button>
  );
}

export function StatItem({ value, label }: { value: number; label: string }) {
  return (
    <span className="text-[10px] text-text-faint leading-none">
      <span className="text-text-muted tabular-nums">{value}</span>
      <span className="ml-0.5">{label}</span>
    </span>
  );
}
