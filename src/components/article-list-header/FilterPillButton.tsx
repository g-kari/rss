"use client";

import type { FilterPillButtonProps } from "./types";
import { PILL_BASE_CLASS, PILL_INACTIVE_CLASS, PILL_ACTIVE_CLASSES } from "./constants";

export default function FilterPillButton({
  active,
  onClick,
  title,
  children,
  variant = "default",
}: FilterPillButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`${PILL_BASE_CLASS} ${active ? PILL_ACTIVE_CLASSES[variant] : PILL_INACTIVE_CLASS}`}
    >
      {children}
    </button>
  );
}
