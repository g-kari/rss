import type { Layout } from "../../types";

export const LAYOUT_ARIA_LABELS: Record<Layout, string> = {
  compact: "コンパクト表示",
  list: "リスト表示",
  card: "カード表示",
  magazine: "マガジン表示",
  gallery: "ギャラリー表示",
};

export const PILL_BASE_CLASS =
  "flex items-center justify-center text-control tracking-[0.04em] px-2.5 py-0.5 rounded-full border transition-all duration-200 min-h-[44px] min-w-[44px]";
export const PILL_INACTIVE_CLASS =
  "border-border-default text-text-muted hover:border-text-muted hover:text-text-default";
export const PILL_ACTIVE_CLASSES = {
  default: "border-ink bg-ink text-ink-text",
  bookmark: "border-bookmark bg-bookmark text-saved-contrast",
  like: "border-like bg-like text-saved-contrast",
  note: "border-memo bg-memo text-saved-contrast",
} as const;
