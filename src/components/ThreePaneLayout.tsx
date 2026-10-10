"use client";

import type { ReactNode } from "react";
import { useHasOpenPopup } from "@/hooks/usePopupLock";

interface Props {
  sidebarWidth: number;
  listWidth: number;
  listFocusMode: boolean;
  children: ReactNode;
}

/**
 * 3ペイン CSS Grid レイアウトコンテナ。
 * サイドバー・記事一覧・記事表示の3カラムを管理する。
 *
 * `data-popup-open` 属性は e2e テストから「ポップアップ系のオーバーレイが開いていないか」
 * を判定するためのフック。ポップアップ表示中はリサイザー操作などを抑止できるよう公開している。
 */
export default function ThreePaneLayout({
  sidebarWidth,
  listWidth,
  listFocusMode,
  children,
}: Props) {
  const hasOpenPopup = useHasOpenPopup();
  return (
    <div className="reader-visual-shell flex h-dvh flex-col overflow-hidden">
      <div
        data-layout="root"
        data-popup-open={hasOpenPopup ? "true" : "false"}
        className="relative min-h-0 flex-1 overflow-hidden font-sans antialiased bg-surface-base text-text-strong lg:grid"
        style={{
          gridTemplateColumns: listFocusMode
            ? `0px 1fr 0px`
            : `${sidebarWidth}px ${listWidth}px 1fr`,
          gridTemplateRows: "100%",
        }}
      >
        {children}
      </div>
    </div>
  );
}
