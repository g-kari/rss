"use client";

import type { ReactNode } from "react";

interface Props {
  isActive: boolean;
  onClick: () => void;
  title: string;
  ariaLabel: string;
  /** active 状態の背景・文字色 (例: "bg-ink text-ink-text") */
  activeClass: string;
  /** inactive 状態のホバー色 (例: "hover:text-text-default") */
  inactiveHoverClass: string;
  children: ReactNode;
}

/**
 * `ArticleHeaderEngagement` の 3 連トグルボタン (後で読む / ブックマーク / いいね)
 * 共通テンプレート。simplify 監査 Issue 2 で重複解消のために抽出。
 *
 * デザイントークンの差 (`bg-ink` / `bg-bookmark` / `bg-rose-400`) は
 * `activeClass` / `inactiveHoverClass` で吸収。SVG icon は children 経由で注入。
 *
 * セグメント化ラッパー (`overflow-hidden` + `<div className="w-px ...">` 区切り) は
 * 親側 (ArticleHeaderEngagement) に残す。
 */
export default function EngagementSegmentButton({
  isActive,
  onClick,
  title,
  ariaLabel,
  activeClass,
  inactiveHoverClass,
  children,
}: Props) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={isActive}
      className={`px-2.5 py-1.5 max-md:min-w-[44px] max-md:min-h-[44px] flex items-center justify-center transition-colors duration-200 [&>svg]:w-[14px] [&>svg]:h-[14px] lg:[&>svg]:w-[12px] lg:[&>svg]:h-[12px] ${
        isActive ? activeClass : `text-text-faint ${inactiveHoverClass} hover:bg-surface-hover`
      }`}
    >
      {children}
    </button>
  );
}
