"use client";

import type { ReactNode } from "react";

interface Props {
  sidebarWidth: number;
  listWidth: number;
  listFocusMode: boolean;
  children: ReactNode;
}

/**
 * 3ペイン CSS Grid レイアウトコンテナ。
 * サイドバー・記事一覧・記事表示の3カラムを管理する。
 */
export default function ThreePaneLayout({
  sidebarWidth,
  listWidth,
  listFocusMode,
  children,
}: Props) {
  return (
    <div
      data-layout="root"
      className="relative h-screen overflow-hidden font-sans antialiased bg-surface-base text-text-strong lg:grid"
      style={{
        gridTemplateColumns: listFocusMode ? `0px 1fr 0px` : `${sidebarWidth}px ${listWidth}px 1fr`,
        gridTemplateRows: "100%",
        transition: "grid-template-columns 0.25s ease",
      }}
    >
      {children}
    </div>
  );
}
